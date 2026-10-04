"""实测 BiRefNet CUDA 前向期间合作取消；标记探针不替换模型计算结果。"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'engine'))


def worker(directory, job_path=None, output_path=None):
  import torch
  from foreground import ForegroundModel
  from main import main as engine_main

  original_init = ForegroundModel.__init__

  def observed_init(self, model_directory):
    original_init(self, model_directory)
    original_forward = self.model.forward

    def forward(*args, **kwargs):
      torch.cuda.synchronize()
      (directory / 'forward-start.json').write_text(json.dumps({
        'device': torch.cuda.get_device_name(0), 'allocatedBytes': torch.cuda.memory_allocated(),
        'torch': torch.__version__, 'pid': os.getpid(),
        'jobDirectory': str(Path(job_path).parent) if job_path else str(directory)}), encoding='utf-8')
      result = original_forward(*args, **kwargs)
      torch.cuda.synchronize()
      (directory / 'forward-finished').write_text(str(time.monotonic_ns()), encoding='utf-8')
      return result

    self.model.forward = forward

  ForegroundModel.__init__ = observed_init
  sys.argv = [str(ROOT / 'engine/main.py'), '--job', str(job_path or directory / 'job.json'),
              '--out', str(output_path or directory / 'result')]
  return engine_main()


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--output', type=Path, required=True)
  parser.add_argument('--worker', action='store_true')
  parser.add_argument('--job', type=Path)
  parser.add_argument('--out', type=Path)
  args = parser.parse_args()
  directory = args.output.resolve()
  if args.worker:
    return worker(directory, args.job, args.out)
  directory.mkdir(parents=True, exist_ok=False)
  snapshot = json.loads((ROOT / 'tests/fixtures/v2/normal-v2.json').read_text('utf-8'))
  # 纯不透明原图强制走真实模型，不走透明范围捷径。
  snapshot['original']['data'] = base64.b64encode(bytes([180, 80, 40, 255]) * 12).decode('ascii')
  cancel_path = directory / 'cancel'
  (directory / 'job.json').write_text(json.dumps({'action': 'v2:recognition', 'payload': {
    'snapshot': snapshot, 'keepBackground': False, 'protectionPolicy': 'preserve'},
    'cancelPath': str(cancel_path)}), encoding='utf-8')
  started = time.monotonic()
  env = dict(os.environ, PYTHONUTF8='1', HF_HUB_OFFLINE='1',
             RELIEF_BIREFNET_DIRECTORY=str(ROOT / 'model-runtime/birefnet-hr'))
  with (directory / 'worker.log').open('wb') as log:
    process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', '--output', str(directory)],
      env=env, stdout=log, stderr=subprocess.STDOUT)
    cancelled_at = None
    try:
      while process.poll() is None:
        if time.monotonic() - started > 120:
          raise TimeoutError('GPU 验证超过 120 秒')
        if cancelled_at is None and (directory / 'forward-start.json').exists():
          if (directory / 'forward-finished').exists():
            raise AssertionError('取消探针错过前向窗口，不能算推理中取消')
          cancel_path.write_text('cancel', encoding='utf-8')
          cancelled_at = time.monotonic()
          cancelled_ns = time.monotonic_ns()
        time.sleep(.005)
      if process.wait() != 0:
        raise RuntimeError('GPU 引擎失败，见 worker.log')
      result = json.loads((directory / 'result/result.json').read_text('utf-8'))
      if cancelled_at is None or result['status'] != 'cancelled':
        raise AssertionError('必须在真实前向窗口发出取消并收到 cancelled')
      if not (directory / 'forward-finished').is_file():
        raise AssertionError('必须证明真实 CUDA 前向计算完成，而非跳过推理')
      if cancelled_ns >= int((directory / 'forward-finished').read_text('utf-8')):
        raise AssertionError('取消晚于前向完成，不计为推理中取消')
      report = json.loads((directory / 'forward-start.json').read_text('utf-8'))
      report.update(status=result['status'], processExited=True,
        cancelSeconds=round(time.monotonic() - cancelled_at, 3),
        totalSeconds=round(time.monotonic() - started, 3),
        scope='BiRefNet real CUDA forward cooperative cancellation; not SAM, package or quality acceptance')
      (directory / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
      print(json.dumps(report, ensure_ascii=False))
    finally:
      if process.poll() is None:
        process.kill()
      process.wait()
  return 0


if __name__ == '__main__':
  sys.exit(main())
