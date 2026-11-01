"""核对真实工程的分色策略；历史正高度范围仅作固定主体，不作为识别真值。"""
import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'engine'))
from relief import decode_image, segment


def baseline_segment(engine, job):
  # 独立进程加载基线，避免 Python 模块缓存混用两个版本。
  code = ('import json,sys; from relief import segment; '
          'job=json.loads(sys.stdin.buffer.read()); '
          'sys.stdout.buffer.write(json.dumps(segment(job), ensure_ascii=True).encode())')
  result = subprocess.run([sys.executable, '-c', code], cwd=engine,
                          input=json.dumps(job).encode(), capture_output=True,
                          check=True, timeout=120)
  return json.loads(result.stdout)


def palette_image(project):
  labels = np.asarray(project['labels']).reshape(project['height'], project['width'])
  rgb = np.full((*labels.shape, 3), 225, dtype=np.uint8)
  for region in project['regions']:
    rgb[labels == region['id']] = tuple(bytes.fromhex(region['color'][1:]))
  return Image.fromarray(rgb)


def verify(source, baseline, output, index):
  raw = source.read_bytes()
  legacy = json.loads(raw)
  rgba = decode_image(legacy['image'])
  labels = np.asarray(legacy['labels']).reshape(rgba.shape[:2])
  raised = [region['id'] for region in legacy['regions'] if region['layers'] > 0]
  mask = np.isin(labels, raised) & (rgba[:, :, 3] > 0)
  valid = (labels > 0) & (rgba[:, :, 3] > 0)
  job = {'image': legacy['image'], 'colors': 'auto', 'tolerance': 12,
         'sizeMm': legacy['sizeMm'], 'name': source.stem,
         'subjectMask': mask.astype(int).ravel().tolist(),
         'validMask': valid.astype(int).ravel().tolist(), 'subjectLayers': 10}
  old = baseline_segment(baseline / 'engine', job)
  started = time.perf_counter()
  current = segment(job)
  elapsed = time.perf_counter() - started
  merged = segment({**job, 'mergeMaterialShades': True})
  if merged != old:
    raise AssertionError('显式开启明暗合并后应逐字段重现基线')
  for result in (old, current, merged):
    actual = np.asarray(result['labels']).reshape(mask.shape)
    np.testing.assert_array_equal(actual > 1, mask)
    np.testing.assert_array_equal(actual > 0, valid)
    np.testing.assert_array_equal(decode_image(result['image']), rgba)
    if any(region['layers'] != (0 if region['id'] == 1 else 10)
           for region in result['regions']):
      raise AssertionError('分色策略不能改变测试设定的主体层数')
  panels = [('Source', Image.fromarray(rgba).convert('RGB')),
            ('Baseline: merged', palette_image(old)),
            ('Default: separate', palette_image(current)),
            ('Opt-in: merged', palette_image(merged))]
  chart = Image.new('RGB', (1280, 350), 'white')
  draw = ImageDraw.Draw(chart)
  for column, (title, panel) in enumerate(panels):
    panel.thumbnail((320, 320))
    chart.paste(panel, (column * 320, 30))
    draw.text((column * 320 + 8, 8), title, fill='black')
  chart.save(output / f'{index}-comparison.png')
  return {'source': str(source.resolve()), 'sha256': hashlib.sha256(raw).hexdigest(),
          'size': [legacy['width'], legacy['height']],
          'subjectPixels': int(mask.sum()),
          'subjectRegions': {name: sum(r['id'] != 1 for r in result['regions'])
                             for name, result in [('baseline', old), ('default', current),
                                                  ('optIn', merged)]},
          'defaultElapsedSeconds': round(elapsed, 3),
          'optInMatchesBaselineExactly': True, 'subjectAndPrintRangeExact': True,
          'originalRgbaExact': True, 'testSubjectLayersExact': True}


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--baseline', type=Path, required=True)
  parser.add_argument('--project', type=Path, action='append', required=True)
  parser.add_argument('--out', type=Path, required=True)
  args = parser.parse_args()
  args.out.mkdir(parents=True, exist_ok=False)
  report = {'scope': '固定历史主体范围的 CPU 分色回归；非 GPU 识别准确率或设备验证',
            'baseline': str(args.baseline.resolve()),
            'baselineReliefSha256': hashlib.sha256((args.baseline / 'engine/relief.py').read_bytes()).hexdigest(),
            'currentReliefSha256': hashlib.sha256((ROOT / 'engine/relief.py').read_bytes()).hexdigest(),
            'subjectMaskSource': 'historical positive-height regions',
            'subjectLayers': 10, 'tolerance': 12, 'cases': []}
  for index, source in enumerate(args.project, 1):
    row = verify(source, args.baseline, args.out, index)
    report['cases'].append(row)
    (args.out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps(row, ensure_ascii=True), flush=True)


if __name__ == '__main__':
  main()
