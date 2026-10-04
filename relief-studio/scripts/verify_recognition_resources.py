"""独立测量真实 CPU 引擎子进程；不把透明范围测试当 GPU 或 UI 性能验收。"""
import argparse
import base64
import hashlib
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import psutil

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'engine'))
from project_v2 import decode_project, decode_raster, encode_project


def measure(command, payload, action, output, name, expected, cancel_after=None):
  started = time.monotonic()
  peak_rss = 0
  descendants = {}
  cancelled_at = None
  with tempfile.TemporaryDirectory(prefix='task-', dir=output) as directory:
    directory = Path(directory)
    job_path, result_path = directory / 'job.json', directory / 'result'
    cancel_path = directory / 'cancel'
    job_path.write_text(json.dumps({'action': 'v2:' + action, 'payload': payload,
      'requestId': name, 'cancelPath': str(cancel_path),
      'base': {'sessionId': name, 'revision': 0}}), encoding='utf-8')
    env = dict(os.environ, PYTHONUTF8='1', RELIEF_BIREFNET_DIRECTORY=str(directory / 'missing-model'))
    with (directory / 'stderr.txt').open('wb') as stderr:
      process = psutil.Popen([*command, '--job', str(job_path), '--out', str(result_path)],
        stdout=subprocess.DEVNULL, stderr=stderr, env=env)
      process_started = time.monotonic()
      try:
        while process.poll() is None:
          now = time.monotonic()
          if now - process_started > 120:
            raise TimeoutError(name + ': 引擎超过 120 秒')
          try:
            children = process.children(recursive=True)
            for child in children:
              descendants[child.pid] = child
            resident = 0
            for member in [process, *children]:
              try:
                resident += member.memory_info().rss
              except psutil.NoSuchProcess:
                pass
            peak_rss = max(peak_rss, resident)
          except psutil.NoSuchProcess:
            pass
          if cancel_after is not None and cancelled_at is None and now - process_started >= cancel_after:
            cancel_path.write_text('cancel', encoding='utf-8')
            cancelled_at = time.monotonic()
          time.sleep(.02)
        return_code = process.wait()
        exited_at = time.monotonic()
        if return_code != 0:
          raise RuntimeError((directory / 'stderr.txt').read_text('utf-8', errors='replace'))
        result = json.loads((result_path / 'result.json').read_text('utf-8'))
        if result['status'] != expected:
          raise AssertionError(f"{name}: 预期 {expected}，实际 {result['status']}")
        if expected == 'error' and '缺少 BiRefNet' not in result.get('message', ''):
          raise AssertionError(f'{name}: 必须明确报告缺失模型，而非其他输入错误')
        if expected == 'cancelled' and cancelled_at is None:
          raise AssertionError(f'{name}: 未发出取消请求')
        if (expected == 'success' and action == 'recognition'
            and result['value']['diagnostics']['source'] != 'alpha'):
          raise AssertionError('压力图必须走真实透明范围识别')
        if expected == 'success' and action == 'height':
          snapshot = payload['snapshot']
          count = snapshot['width'] * snapshot['height']
          heights = decode_raster(snapshot['heights'], 'uint16', count)
          labels = decode_raster(snapshot['labels'], 'uint16', count)
          for block in result['value']['blocks']:
            if block['field'] == 'heights':
              before = block['before']
              length = len(base64.b64decode(before['data'])) // 2
              offset = block['offset']
              np.testing.assert_array_equal(heights[offset:offset + length], decode_raster(before, 'uint16', length))
              heights[offset:offset + length] = decode_raster(block['after'], 'uint16', length)
          np.testing.assert_array_equal(heights, np.where(labels != 0, 11, 0))
        living = [pid for pid, child in descendants.items() if child.is_running()]
        if living:
          raise AssertionError(f'任务退出后仍有子进程：{living}')
        record = {'name': name, 'status': result['status'], 'peakTreeRssBytes': peak_rss,
          'processSeconds': round(exited_at - process_started, 3),
          'totalSeconds': round(exited_at - started, 3), 'remainingChildren': living,
          'cancelSeconds': None if cancelled_at is None else round(exited_at - cancelled_at, 3)}
      finally:
        try:
          try:
            for child in process.children(recursive=True):
              descendants[child.pid] = child
          except psutil.NoSuchProcess:
            pass
          for child in reversed(list(descendants.values())):
            try:
              if child.is_running(): child.kill()
            except psutil.NoSuchProcess:
              pass
        finally:
          if process.poll() is None:
            process.kill()
          process.wait()
          _, alive = psutil.wait_procs(list(descendants.values()), timeout=5)
          if alive:
            raise RuntimeError(f'清理后仍有已观察到的子进程：{[child.pid for child in alive]}')
    temporary_path = directory
  record['temporaryRemoved'] = not temporary_path.exists()
  return record


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--output', type=Path, required=True)
  parser.add_argument('--engine', type=Path)
  args = parser.parse_args()
  args.output.mkdir(parents=True, exist_ok=False)
  command = [str(args.engine.resolve())] if args.engine else [sys.executable, str(ROOT / 'engine/main.py')]
  snapshot = decode_project(json.loads((ROOT / 'tests/fixtures/v2/normal-v2.json').read_text('utf-8')))
  side = 2048
  yy, xx = np.indices((side, side))
  rgba = np.full((side, side, 4), 255, dtype=np.uint8)
  rgba[:, :, :3] = [180, 70, 30]
  snapshot.update(width=side, height=side, sizeMm=[204.8, 204.8],
    protection=np.zeros(side * side, dtype=np.uint8))
  report = {'platform': platform.platform(), 'engine': command, 'sampleIntervalMs': 20,
    'executableSha256': hashlib.sha256(Path(command[0]).read_bytes()).hexdigest(),
    'engineSourceSha256': None if args.engine else {str(file.relative_to(ROOT)):
      hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted((ROOT / 'engine').glob('*.py'))},
    'scope': 'CPU alpha recognition subprocess RSS, not GPU, UI memory or P95',
    'descendantScope': 'sampled descendants only; not Windows Job Object containment',
    'cancelTrigger': 'elapsed 0.5s after process launch; algorithm phase not asserted', 'runs': []}

  def run(name, payload, action='recognition', expected='success', cancel_after=None):
    record = measure(command, payload, action, args.output, name, expected, cancel_after)
    report['runs'].append(record)
    (args.output / 'resources.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(record, ensure_ascii=False), flush=True)

  for fragmented in (False, True):
    visible = ((xx // 8 + yy // 8) % 2 == 0) if fragmented else ((xx > 16) & (xx < side - 16) & (yy > 16) & (yy < side - 16))
    rgba[:, :, 3] = visible.astype(np.uint8) * 255
    snapshot.update(original=rgba.ravel().copy(), colors=rgba.ravel().copy(),
      labels=visible.ravel().astype(np.uint16), heights=visible.ravel().astype(np.uint16) * 10)
    payload = {'snapshot': encode_project(snapshot), 'keepBackground': False, 'protectionPolicy': 'preserve'}
    label = 'fragmented' if fragmented else 'full'
    for repeat in range(3):
      run(f'{label}-{repeat + 1}', payload)
    run(f'{label}-cancel', payload, expected='cancelled', cancel_after=.5)
    run(f'{label}-recover', {'snapshot': payload['snapshot'], 'operation': {'kind': 'set', 'layers': 11}}, action='height')
  rgba[:, :, 3] = 255
  snapshot['original'] = rgba.ravel().copy()
  payload = {'snapshot': encode_project(snapshot), 'keepBackground': False, 'protectionPolicy': 'preserve'}
  run('missing-model', payload, expected='error')
  run('missing-model-recover', {'snapshot': payload['snapshot'], 'operation': {'kind': 'set', 'layers': 11}}, action='height')
  report['allPassed'] = True
  (args.output / 'resources.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
  main()
