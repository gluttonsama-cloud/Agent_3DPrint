"""白底标志分色去背景对照，以及多选/漏选可视化；不修改产品算法。"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
from relief import encode_image, segment


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--results', type=Path, required=True)
  args = parser.parse_args()
  report = json.loads((args.results / 'report.json').read_text('utf-8'))
  expected = {f'{name}-{variant}' for name in ('wikimedia','commons-text')
              for variant in ('transparent','white','jpeg-q55')} | {'neon-photo'}
  if report.get('completed') is False or len(report['cases']) != 7 or {item['name'] for item in report['cases']} != expected:
    raise ValueError('七个样例尚未全部完成；不生成完整对照报告')
  validation = []
  for item in report['cases']:
    folder = args.results / item['name']
    rgba = np.array(Image.open(folder/'input.png').convert('RGBA'))
    mask = np.array(Image.open(folder/'subject-mask.png')) > 0
    height = np.array(Image.open(folder/'export/height.png'))
    expected_height = np.where(mask & (rgba[:,:,3] > 0),10,0)
    files = sorted((folder/'export/layers').glob('*.png'))
    correct = np.array_equal(height, expected_height) and len(files) == int(expected_height.max())
    for index, file in enumerate(files, 1):
      correct &= np.array_equal(np.array(Image.open(file)), np.where(expected_height >= index,255,0))
    if not correct:
      raise ValueError(f'{item["name"]} 导出不符合指定高度')
    validation.append({'name':item['name'],'expectedHeightAndEveryLayer':True})
  (args.results/'export-validation.json').write_text(json.dumps(validation,indent=2),'utf-8')
  summaries, rows = [], []
  for item in report['cases']:
    if item['transform'] not in ('white', 'jpeg-q55'):
      continue
    folder = args.results / item['name']
    rgba = np.array(Image.open(folder / 'input.png').convert('RGBA'))
    truth = np.array(Image.open(folder / 'source-alpha-reference.png')) > 0
    predicted = np.array(Image.open(folder / 'subject-mask.png')) > 0
    project = segment({'image': encode_image(rgba), 'colors': 'auto', 'tolerance': 12})
    colors = np.array([[int(region['color'][i:i+2], 16) for i in (1,3,5)]
                       for region in project['regions']])
    # 此对照明确知道输入为白底；通过颜色中心选背景，不使用参考掩膜指导选择。
    background = int(((255-colors)**2).sum(1).argmin()) + 1
    labels = np.array(project['labels']).reshape(truth.shape)
    baseline = (labels != background) & (labels != 0)
    tp = int((baseline & truth).sum())
    metrics = {'name': item['name'], 'assumption': 'white background; remove nearest-white color region',
               'backgroundRegion': background, 'colorIoU': tp/max(1,int((baseline|truth).sum())),
               'colorRecall': tp/max(1,int(truth.sum())),
               'colorPrecision': tp/max(1,int(baseline.sum())), 'aiIoU': item['alphaIoU']}
    summaries.append(metrics)
    Image.fromarray(baseline.astype(np.uint8)*255).save(folder / 'color-background-removed.png')
    panels = [rgba[:,:,:3]]
    for mask in (predicted, baseline):
      panel = np.full_like(rgba[:,:,:3], 238)
      panel[truth & mask] = [63,95,69]
      panel[mask & ~truth] = [223,86,64]
      panel[truth & ~mask] = [49,119,211]
      panels.append(panel)
    row = Image.new('RGB', (1080,340), '#fafaf5')
    ImageDraw.Draw(row).text((10,8), f'{item["name"]} | AI IoU {item["alphaIoU"]:.4f} | color IoU {metrics["colorIoU"]:.4f}', fill='#263d2a')
    for col, panel in enumerate(panels):
      tile = Image.fromarray(panel)
      tile.thumbnail((340,300))
      row.paste(tile,(col*360+(360-tile.width)//2,32+(300-tile.height)//2))
    rows.append(row)
  (args.results / 'white-background-comparison.json').write_text(json.dumps(summaries,indent=2),'utf-8')
  sheet = Image.new('RGB',(1080,340*len(rows)+32),'#fafaf5')
  ImageDraw.Draw(sheet).text((10,8),'INPUT / AI / COLOR. Green=correct; red=extra; blue=missing. Source-alpha reference.',fill='#263d2a')
  for index,row in enumerate(rows):
    sheet.paste(row,(0,index*340+32))
  sheet.save(args.results/'errors-comparison.png')
  print(json.dumps(summaries,indent=2))


if __name__ == '__main__':
  main()
