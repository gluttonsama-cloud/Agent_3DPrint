"""生成可复跑的 A 能力样例与压力证据；不把算法分区当人工真值。"""
import argparse
import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'engine'))
from export_layers import export_bundle
from export_obj import export_obj
from height_ops import run_height
from project_v2 import decode_project, encode_project, migrate_v1, dumps_project, loads_project
from device_profile import calibration_chart, record_calibration


def inspect_bundle(snapshot, directory):
  actual = np.zeros((snapshot['height'], snapshot['width']), dtype=np.uint16)
  for image in sorted((directory / 'white').glob('*.png')):
    actual += (np.asarray(Image.open(image)) == 255).astype(np.uint16)
  np.testing.assert_array_equal(actual.ravel(), snapshot['heights'])
  coverage = np.asarray(Image.open(directory / 'coverage.png')).ravel() > 0
  np.testing.assert_array_equal(coverage, snapshot['labels'] != 0)
  colors = np.asarray(Image.open(directory / 'color.png')).reshape(-1, 4)
  np.testing.assert_array_equal(colors[coverage], snapshot['colors'].reshape(-1, 4)[coverage])
  return {'exactHeight': True, 'exactCoverage': True, 'zeroHeightColorPreserved': True}


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--output', required=True)
  parser.add_argument('--legacy-root', type=Path)
  args = parser.parse_args()
  output = Path(args.output).resolve()
  output.mkdir(parents=True, exist_ok=False)
  fixture = json.loads((ROOT / 'tests/fixtures/v2/normal-v2.json').read_text('utf-8'))
  report = {'platform': platform.platform(), 'python': platform.python_version(),
            'numpy': np.__version__, 'deviceVerified': False, 'runs': []}
  samples = [('small', decode_project(fixture))]
  if args.legacy_root:
    for name, relative in [('logo', 'samples/sample-project.json'),
                           ('metal', 'artifacts/foreground-040/sample.relief.json'),
                           ('flower', 'artifacts/flower-diagnosis/subject.relief.json')]:
      source = args.legacy_root / relative
      if not source.is_file():
        report['runs'].append({'name': name, 'missingSource': str(source)})
        continue
      raw = source.read_bytes()
      snapshot = migrate_v1(json.loads(raw.decode('utf-8')))
      samples.append((name, snapshot))
      report['runs'].append({'name': name, 'source': str(source),
        'sourceSha256': hashlib.sha256(raw).hexdigest(), 'humanGroundTruth': False})
  for name, snapshot in samples:
    started = time.perf_counter()
    destination = output / name
    export_bundle(snapshot, destination, formats=('png', 'jpg'))
    result = {'name': name, **inspect_bundle(snapshot, destination)}
    try:
      result['obj'] = export_obj(snapshot, destination)
    except ValueError as error:
      result['objLimit'] = str(error)
    result['seconds'] = round(time.perf_counter() - started, 3)
    report['runs'].append(result)
    print(json.dumps(result, ensure_ascii=False), flush=True)
  large = decode_project(fixture)
  side = 2048
  large.update(width=side, height=side, sizeMm=[204.8, 204.8])
  yy, xx = np.indices((side, side))
  labels = (xx // 512 + 1).astype(np.uint16)
  labels[(xx > 900) & (xx < 1100) & (yy > 900) & (yy < 1100)] = 0
  levels = np.array([0, 0, 3, 6, 10], dtype=np.uint16)
  rgba = np.zeros((side, side, 4), dtype=np.uint8)
  rgba[:, :, :3] = [180, 130, 70]; rgba[:, :, 3] = 255
  large.update(original=rgba.ravel().copy(), colors=rgba.ravel().copy(), labels=labels.ravel(),
               heights=levels[labels].ravel(), protection=np.zeros(side*side, dtype=np.uint8))
  started = time.perf_counter()
  serialized = dumps_project(large)
  restored = loads_project(serialized)
  np.testing.assert_array_equal(restored['heights'], large['heights'])
  large_run = {'name': '2048', 'jsonBytes': len(serialized.encode('utf-8')),
               'codecRoundtripSeconds': round(time.perf_counter() - started, 3)}
  # 正常压力图可重现；JSON 为忽略目录的实际公共样例，保留版本与坐标。
  (output / '2048-v2.json').write_text(serialized, encoding='utf-8')
  for operation in [{'kind': 'set', 'layers': 10}, {'kind': 'bevel', 'radiusPx': 2},
                    {'kind': 'smooth', 'radiusPx': 2}, {'kind': 'suggest', 'maxLayers': 10}]:
    started = time.perf_counter()
    candidate = run_height(large, operation)
    large_run[operation['kind'] + 'Seconds'] = round(time.perf_counter() - started, 3)
    large_run[operation['kind'] + 'Blocks'] = len(candidate['blocks'])
  started = time.perf_counter()
  export_bundle(large, output / '2048-output')
  large_run.update(inspect_bundle(large, output / '2048-output'))
  large_run['exportSeconds'] = round(time.perf_counter() - started, 3)
  fragmented = dict(large, labels=np.ones(side*side, dtype=np.uint16),
                    heights=((xx + yy) % 2).astype(np.uint16).ravel())
  (output / '2048-fragmented-v2.json').write_text(dumps_project(fragmented), encoding='utf-8')
  started = time.perf_counter()
  try:
    export_obj(fragmented, output / 'fragmented-obj')
    raise AssertionError('碎边网格应明确拒绝，而非偷偷简化')
  except ValueError as error:
    large_run['fragmentedRejection'] = str(error)
  large_run['fragmentedEstimateSeconds'] = round(time.perf_counter() - started, 3)
  chart = calibration_chart()
  Image.fromarray(chart).save(output / 'calibration-height.png')
  # 不填造实测值：只生成录入模板，绑定信息和测量值留空。
  (output / 'calibration-input-template.json').write_text(json.dumps({
    'deviceId': None, 'ink': None, 'material': None, 'settings': None,
    'layers': [0,1,2,4,8,16,32,64,128,256], 'measuredMillimeters': None,
    'verified': False}, indent=2), encoding='utf-8')
  report['runs'].append(large_run)
  (output / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
  print(json.dumps(large_run, ensure_ascii=False), flush=True)


if __name__ == '__main__':
  main()
