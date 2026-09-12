"""公开图片小样本评估；透明通道作来源参考，不冒充人工精度验收。"""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'engine'))
from relief import decode_image, encode_image, export_project, segment
from subject_worker import SubjectWorker


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--inputs', type=Path, required=True)
  parser.add_argument('--out', type=Path, required=True)
  args = parser.parse_args()
  args.out.mkdir(parents=True, exist_ok=False)
  sources = [
    ('wikimedia', 'wikimedia.png', 'https://commons.wikimedia.org/wiki/File:Wikimedia-logo.svg',
     'Neolux; Zscout370; Dbenbenn', 'Public domain; Wikimedia trademark'),
    ('commons-text', 'commons-text.png', 'https://commons.wikimedia.org/wiki/File:Commons-logo-en.svg',
     'Wikimedia Foundation; Reidab; Pumbaa', 'CC BY-SA 3.0'),
    ('neon', 'neon.jpg', 'https://commons.wikimedia.org/wiki/File:Magnolia_Cafe_neon_sign_at_night.jpg',
     'Nhfruchter', 'CC BY-SA 4.0'),
  ]
  worker = SubjectWorker(str(ROOT / 'artifacts/sam2.1_hiera_tiny.pt'))
  report = {'device': worker.torch.cuda.get_device_name(), 'model': 'BiRefNet_HR',
            'humanGroundTruth': False, 'humanCorrectionSeconds': None, 'cases': [],
            'expectedCaseCount': 7, 'completed': False}
  (args.out / 'report.json').write_text(json.dumps(report, indent=2), 'utf-8')
  rows = []
  for name, filename, url, author, license_name in sources:
    source_path = args.inputs / filename
    image = Image.open(source_path).convert('RGBA')
    original_size = image.size
    image.thumbnail((960, 960), Image.Resampling.LANCZOS)
    variants = ['transparent', 'white', 'jpeg-q55'] if name != 'neon' else ['photo']
    for variant in variants:
      case = args.out / f'{name}-{variant}'
      case.mkdir()
      reference = np.array(image)[:, :, 3] >= 128 if name != 'neon' else None
      working = image.copy()
      if variant in ('white', 'jpeg-q55'):
        background = Image.new('RGBA', working.size, 'white')
        background.alpha_composite(working)
        working = background
      if variant == 'jpeg-q55':
        working.convert('RGB').save(case / 'input.jpg', quality=55)
        working = Image.open(case / 'input.jpg').convert('RGBA')
      working.save(case / 'input.png')
      rgba = np.array(working)
      data = encode_image(rgba)
      started = time.perf_counter()
      project = segment({'image': data, 'colors': 'auto', 'tolerance': 12,
                         'sizeMm': [55, 55], 'name': case.name})
      segment_seconds = time.perf_counter() - started
      labels = np.array(project['labels']).reshape(rgba.shape[:2])
      palette = np.array([[int(r['color'][i:i+2], 16) for i in (1, 3, 5)]
                          for r in project['regions']], dtype=np.uint8)
      colorized = np.full_like(rgba[:, :, :3], 245)
      colorized[labels > 0] = palette[labels[labels > 0] - 1]
      Image.fromarray(colorized).save(case / 'partition.png')
      worker.torch.cuda.reset_peak_memory_stats()
      started = time.perf_counter()
      prediction = worker.run({'action': 'propose', 'image': data})
      elapsed = time.perf_counter() - started
      mask = decode_image(prediction['mask'])[:, :, 3] > 0
      Image.fromarray(mask.astype(np.uint8)*255).save(case / 'subject-mask.png')
      preview = rgba[:, :, :3].copy()
      preview[~mask] = (preview[~mask]*.1 + np.array([130,137,123])*.9).astype(np.uint8)
      Image.fromarray(preview).save(case / 'subject-preview.png')
      item = {'name': case.name, 'source': url, 'author': author, 'license': license_name,
              'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
              'originalSize': original_size, 'workingSize': working.size,
              'transform': variant, 'regions': len(project['regions']),
              'segmentSeconds': segment_seconds, 'subjectSeconds': elapsed,
              'firstModelCall': not report['cases'], 'peakVramMB': prediction['peakVramMB'],
              'subjectFraction': float(mask.mean()), 'reference': None}
      if reference is not None:
        Image.fromarray(reference.astype(np.uint8)*255).save(case / 'source-alpha-reference.png')
        tp = int((mask & reference).sum())
        item['reference'] = 'source alpha >= 128; not operator-confirmed'
        item['inputAlphaConstrainsOutput'] = variant == 'transparent'
        item['alphaIoU'] = tp / max(1, int((mask | reference).sum()))
        item['alphaRecall'] = tp / max(1, int(reference.sum()))
        item['alphaPrecision'] = tp / max(1, int(mask.sum()))
        if name == 'commons-text':
          text_roi = np.zeros_like(reference)
          text_roi[round(reference.shape[0]*.76):] = True
          item['bottomTextRecall'] = int((mask & reference & text_roi).sum()) / max(1, int((reference & text_roi).sum()))
      # 几何链路另行核对，层数为测试赋值，不由识别器推断。
      export = {**project, 'labels': np.where(rgba[:,:,3] > 0, np.where(mask,2,1),0).ravel().tolist(),
                'regions': [{'id':1,'name':'Background','color':'#82897b','layers':0},
                            {'id':2,'name':'Subject','color':'#d9b477','layers':10}]}
      export_project(export, case / 'export')
      height = np.array(Image.open(case / 'export/height.png'))
      stack = np.zeros_like(height, dtype=np.uint16)
      previous = np.ones_like(mask)
      nested = True
      for file in sorted((case / 'export/layers').glob('*.png')):
        layer = np.array(Image.open(file)) > 0
        nested &= bool(np.all(~layer | previous))
        stack += layer
        previous = layer
      item['layerReconstruction'] = bool(np.array_equal(stack, height))
      item['nestedLayers'] = nested
      item['expectedHeight'] = bool(np.array_equal(height, np.where(mask & (rgba[:,:,3] > 0),10,0)))
      item['expectedLayerCount'] = len(list((case / 'export/layers').glob('*.png'))) == (10 if mask.any() else 0)
      item['colorPreserved'] = bool(np.array_equal(np.array(Image.open(case / 'export/color.png')), rgba))
      (case / 'result.json').write_text(json.dumps(item, indent=2), 'utf-8')
      report['cases'].append(item)
      (args.out / 'report.json').write_text(json.dumps(report, indent=2), 'utf-8')
      row = Image.new('RGB', (1080, 310), '#f4f4ee')
      draw = ImageDraw.Draw(row)
      draw.text((10, 6), f'{case.name} | regions={item["regions"]} | {elapsed:.2f}s', fill='#344434')
      for col, tile in enumerate([working, Image.fromarray(colorized), Image.fromarray(preview)]):
        backdrop = Image.new('RGBA', tile.size, 'white')
        backdrop.alpha_composite(tile.convert('RGBA'))
        tile = backdrop.convert('RGB')
        tile.thumbnail((340, 270))
        row.paste(tile, (col*360+(360-tile.width)//2, 32+(270-tile.height)//2))
      rows.append(row)
      print(json.dumps(item), flush=True)
  sheet = Image.new('RGB', (1080, 310*len(rows)), 'white')
  for index, row in enumerate(rows):
    sheet.paste(row, (0, index*310))
  sheet.save(args.out / 'comparison.jpg', quality=95)
  report['completed'] = len(report['cases']) == report['expectedCaseCount']
  (args.out / 'report.json').write_text(json.dumps(report, indent=2), 'utf-8')


if __name__ == '__main__':
  main()
