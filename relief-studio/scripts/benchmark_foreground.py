"""同一原图比较自动主体与固定点击修正；不把抽查或模型结果当人工真值。"""
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root/'engine'))
from relief import decode_image, encode_image, export_project
from subject_worker import SubjectWorker

out = root/'artifacts/foreground-040'
out.mkdir(exist_ok=True)
rgba = np.array(Image.open('C:/Users/arthur/Downloads/微信图片_20260821172229_5_113.jpg').convert('RGBA'))
image = encode_image(rgba)
worker = SubjectWorker(str(root/'artifacts/sam2.1_hiera_tiny.pt'))
started = time.perf_counter()
result = worker.run({'action': 'propose', 'image': image})
mask = decode_image(result['mask'])[:, :, 3] > 0


def save(name, mask):
  Image.fromarray(mask.astype(np.uint8)*255).save(out/f'{name}-mask.png')
  rgb = rgba[:, :, :3].copy()
  rgb[~mask] = (rgb[~mask]*.1+np.array([130, 137, 123])*.9).astype(np.uint8)
  Image.fromarray(rgb).save(out/f'{name}-preview.png')


save('automatic', mask)
report = {'model': 'BiRefNet_HR', 'automaticSeconds': time.perf_counter()-started,
  'peakVramMB': result['peakVramMB'], 'device': worker.torch.cuda.get_device_name(),
  'humanGroundTruth': False, 'iou': None, 'humanCorrectionSeconds': None, 'corrections': []}
# 人工查看原图后给出的测试提示，不参与通用算法。
for x, y in [(505, 790), (923, 466), (794, 747)]:
  result = worker.run({'action': 'predict', 'image': image,
    'points': [{'x': x, 'y': y, 'label': 1}]})
  patch = decode_image(result['mask'])[:, :, 3] > 0
  mask |= patch
  report['corrections'].append({'x': x, 'y': y, 'seconds': result['elapsedSeconds']})
save('three-clicks', mask)
report['peakVramMB'] = result['peakVramMB']
project = {'version': 1, 'name': '主体提取对照·三次补选', 'image': image,
  'width': rgba.shape[1], 'height': rgba.shape[0], 'sizeMm': [55, 55],
  'labels': np.where(mask, 2, 1).ravel().tolist(),
  'regions': [{'id': 1, 'name': '平面背景', 'color': '#82897b', 'layers': 0},
              {'id': 2, 'name': '浮雕主体', 'color': '#d9b477', 'layers': 10}]}
(out/'sample.relief.json').write_text(json.dumps(project, ensure_ascii=False), 'utf-8')
(out/'benchmark.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(report, ensure_ascii=True))
