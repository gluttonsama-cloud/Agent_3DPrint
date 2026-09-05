"""从会议附件生成可复现的 55 mm 圆形徽标演示及分层包。"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'engine'))
from relief import encode_image, export_project, segment, write_json


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--source', required=True)
  parser.add_argument('--out', default=str(ROOT/'artifacts'/'sample-export'))
  args = parser.parse_args()
  samples = ROOT/'samples'
  samples.mkdir(exist_ok=True)
  source = Path(args.source)
  if source.resolve() != (samples/'source-logo.jpg').resolve():
    shutil.copyfile(source, samples/'source-logo.jpg')
  with Image.open(source) as image:
    # 会议附件实测裁剪框；外部说明文字不参与分区。
    crop = np.array(image.convert('RGBA').crop((105, 24, 515, 434)))
  y, x = np.indices(crop.shape[:2])
  inside = ((x-204.5)/204.0)**2 + ((y-204.5)/204.0)**2 <= 1
  crop[~inside, 3] = 0
  Image.fromarray(crop).save(samples/'cropped-logo.png')
  project = segment({'image': encode_image(crop), 'colors': 3,
                     'name': '科尔沁 · 55 mm 徽标', 'sizeMm': [55, 55]})
  for region, name in zip(project['regions'], ['黑色 · 低区', '金色 · 中间层', '白字 · 凸起']):
    region['name'] = name
  # 附件的外金环存在 JPEG 白色高光；按样例需求将外圈高光归为金色，非通用算法规则。
  labels = np.array(project['labels']).reshape(410,410)
  rim = ((x-204.5)**2+(y-204.5)**2 > 195**2) & (labels == 3)
  labels[rim] = 2
  project['labels'] = labels.ravel().tolist()
  write_json(samples/'sample-project.json', project)
  public = ROOT/'public'
  public.mkdir(exist_ok=True)
  shutil.copyfile(samples/'sample-project.json', public/'sample-project.json')
  destination = Path(args.out).resolve()
  if destination.exists():
    raise ValueError('样例输出已存在；保留现有交付，若需重新生成请选择独立输出流程')
  export_project(project, destination)
  write_json(samples/'provenance.json', {
    'source': '用户会议附件 57480ab26f6d719f3626210b1a75dd2f.jpg',
    'cropPixels': [105,24,410,410], 'ellipseCenter': [204.5,204.5],
    'ellipseRadius': 204, 'sizeMm': [55,55], 'heightLayers': [0,5,10],
    'sampleSpecificCorrection': {'outerRadiusThreshold':195,'whiteToGoldPixels':int(rim.sum())},
    'humanGroundTruth': False,
    'notes': '由算法生成的演示分区，尚未取得客户确认的像素级真值与实机高度校准。'
  })
  print(json.dumps({'ok':True,'export':str(destination)}))


if __name__ == '__main__':
  main()
