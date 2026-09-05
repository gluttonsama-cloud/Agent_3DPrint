"""浮雕中间数据：图案颜色与累计堆叠高度相互独立。"""
import base64
import io
import json
import math
import re
import shutil
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

MAX_SIDE = 2048
MAX_PIXELS = 4_194_304
MAX_LAYERS = 256


def integer(value, minimum, maximum, name):
  if type(value) is not int or not minimum <= value <= maximum:
    raise ValueError(f'{name} 必须是 {minimum} 至 {maximum} 的整数')
  return value


def dimensions(width, height):
  integer(width, 1, MAX_SIDE, '宽度')
  integer(height, 1, MAX_SIDE, '高度')
  if width * height > MAX_PIXELS:
    raise ValueError('图片像素过多')


def physical_size(value):
  if not isinstance(value, list) or len(value) != 2:
    raise ValueError('成品尺寸必须包含宽、高')
  for size in value:
    if type(size) not in (int, float) or not math.isfinite(size) or not 0 < size <= 10000:
      raise ValueError('成品尺寸必须为 0 至 10000 mm 之间的有限数值')


def decode_image(value):
  if not isinstance(value, str) or len(value) > 32_000_000:
    raise ValueError('图片数据无效或过大')
  parts = value.split(',', 1)
  if len(parts) != 2 or parts[0] not in ('data:image/png;base64', 'data:image/jpeg;base64'):
    raise ValueError('只支持 PNG/JPEG 数据')
  try:
    blob = base64.b64decode(parts[1], validate=True)
    with Image.open(io.BytesIO(blob)) as image:
      dimensions(*image.size)
      if image.format not in ('PNG', 'JPEG'):
        raise ValueError('图片格式与声明不符')
      return np.array(image.convert('RGBA'))
  except (OSError, SyntaxError) as error:
    raise ValueError('无法读取图片') from error


def encode_image(rgba):
  stream = io.BytesIO()
  Image.fromarray(rgba).save(stream, format='PNG')
  return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode('ascii')


def validate_project(project):
  if (not isinstance(project, dict) or type(project.get('version')) is not int
      or project.get('version') != 1):
    raise ValueError('不支持的工程版本')
  if not isinstance(project.get('name'), str) or len(project['name']) > 200:
    raise ValueError('工程名称无效')
  width, height = project.get('width'), project.get('height')
  dimensions(width, height)
  physical_size(project.get('sizeMm'))
  regions = project.get('regions')
  if not isinstance(regions, list) or not 1 <= len(regions) <= 32:
    raise ValueError('工程需要 1 至 32 个区域')
  ids = set()
  for region in regions:
    if not isinstance(region, dict):
      raise ValueError('区域格式无效')
    region_id = integer(region.get('id'), 1, 65535, '区域编号')
    if region_id in ids:
      raise ValueError('区域编号重复')
    ids.add(region_id)
    integer(region.get('layers'), 0, MAX_LAYERS, '堆叠层数')
    if not isinstance(region.get('name'), str) or len(region['name']) > 100:
      raise ValueError('区域名称无效')
    if not isinstance(region.get('color'), str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', region['color']):
      raise ValueError('区域颜色必须为十六进制 RGB')
  labels = project.get('labels')
  if not isinstance(labels, list) or len(labels) != width * height:
    raise ValueError('区域掩膜尺寸与图片不一致')
  valid_ids = ids | {0}
  if any(type(label) is not int or label not in valid_ids for label in labels):
    raise ValueError('掩膜引用未知区域')
  rgba = decode_image(project.get('image'))
  if rgba.shape[:2] != (height, width):
    raise ValueError('图像与工程尺寸不一致')
  label_array = np.array(labels, dtype=np.uint16).reshape(height, width)
  if np.any((rgba[:, :, 3] == 0) & (label_array != 0)):
    raise ValueError('透明像素不能分配打印区域')
  return rgba, label_array


def segment(job):
  rgba = decode_image(job.get('image'))
  colors = integer(job.get('colors', 3), 2, 12, '分区颜色数')
  size = job.get('sizeMm', [55, 55])
  physical_size(size)
  visible = rgba[:, :, 3] > 0
  rgb = rgba[:, :, :3][visible]
  if not len(rgb):
    raise ValueError('图片没有可打印像素')
  # 全图 5-bit RGB 直方图，每个非空色箱参与训练，避免步长抽样漏掉细笔画。
  bins = (rgb[:,0].astype(np.int32)//8)*1024 + (rgb[:,1].astype(np.int32)//8)*32 + rgb[:,2]//8
  counts = np.bincount(bins, minlength=32768)
  occupied = counts > 0
  sampled = np.stack([np.bincount(bins, weights=rgb[:,channel], minlength=32768)[occupied]
                       / counts[occupied] for channel in range(3)], axis=1).astype(np.float32)
  colors = min(colors, len(sampled))
  cv2.setRNGSeed(42)
  cv2.setNumThreads(1)
  weights = counts[occupied].astype(np.float64)
  centers = [sampled[weights.argmax()]]
  # 最远色初始化覆盖少量高对比文字；加权更新防止 JPEG 稀有杂色主导中心。
  while len(centers) < colors:
    distances = ((sampled[:,None,:]-np.array(centers)[None,:,:])**2).sum(axis=2).min(axis=1)
    centers.append(sampled[(distances * weights).argmax()])
  centers = np.array(centers,dtype=np.float32)
  for _ in range(40):
    assignments = ((sampled[:,None,:]-centers[None,:,:])**2).sum(axis=2).argmin(axis=1)
    updated = centers.copy()
    for index in range(colors):
      members = assignments == index
      if members.any():
        updated[index] = np.average(sampled[members],axis=0,weights=weights[members])
    converged = np.max(np.abs(updated-centers)) < 0.2
    centers = updated
    if converged:
      break
  luminance = centers @ np.array([0.2126, 0.7152, 0.0722])
  centers = centers[np.argsort(luminance)]
  flat_labels = np.empty(len(rgb), dtype=np.uint16)
  for start in range(0, len(rgb), 65536):
    pixels = rgb[start:start+65536].astype(np.float32)
    distances = ((pixels[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
    flat_labels[start:start+len(pixels)] = distances.argmin(axis=1) + 1
  labels = np.zeros(visible.shape, dtype=np.uint16)
  labels[visible] = flat_labels
  regions = []
  for index, center in enumerate(centers):
    layers = round(index / max(1, colors-1) * 10)
    regions.append({'id': index+1, 'name': f'区域 {index+1}',
                    'color': '#' + ''.join(f'{int(round(c)):02x}' for c in center),
                    'layers': layers})
  project = {'version': 1, 'name': str(job.get('name', '未命名工程'))[:200],
             'width': rgba.shape[1], 'height': rgba.shape[0], 'sizeMm': size,
             'image': encode_image(rgba), 'labels': labels.ravel().tolist(), 'regions': regions}
  validate_project(project)
  return project


def write_json(path, data):
  path.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding='utf-8')


def export_project(project, destination):
  rgba, labels = validate_project(project)
  destination = Path(destination).resolve()
  if destination.exists():
    raise ValueError('输出目录已存在，请选择新目录以免覆盖数据')
  destination.parent.mkdir(parents=True, exist_ok=True)
  stage = Path(tempfile.mkdtemp(prefix='.relief-', dir=destination.parent))
  try:
    (stage/'layers').mkdir()
    (stage/'regions').mkdir()
    height = np.zeros(labels.shape, dtype=np.uint16)
    for region in project['regions']:
      selected = labels == region['id']
      height[selected] = region['layers']
      Image.fromarray(selected.astype(np.uint8)*255).save(stage/'regions'/f"{region['id']:04d}.png")
    rgba[labels == 0, 3] = 0
    Image.fromarray(rgba).save(stage/'color.png')
    Image.fromarray(height).save(stage/'height.png')
    max_height = int(height.max())
    for layer in range(1, max_height+1):
      Image.fromarray((height >= layer).astype(np.uint8)*255).save(stage/'layers'/f'{layer:04d}.png')
    write_json(stage/'project.json', project)
    write_json(stage/'manifest.json', {
      'version': 1, 'sizeMm': project['sizeMm'],
      'pixelSize': [project['width'], project['height']], 'origin': 'top-left',
      'axes': {'x': 'right', 'y': 'down', 'z': 'up'}, 'layerOrder': 'bottom-to-top',
      'layerCount': max_height, 'heightEncoding': 'uint16-layer-count',
      'maskEncoding': {'0': 'no-deposit', '255': 'deposit'},
      'calibrated': False, 'millimetersPerLayer': None,
      'colorManaged': False, 'printerReady': False,
      'notes': ['演示参数未校准；零高度区域仍可有彩色图案',
                '白墨、彩墨与光油层序须由设备适配确认', '金色为 RGB 预览，不代表金属工艺'],
      'regions': project['regions']
    })
    stage.rename(destination)
  except BaseException:
    shutil.rmtree(stage)
    raise
  return destination
