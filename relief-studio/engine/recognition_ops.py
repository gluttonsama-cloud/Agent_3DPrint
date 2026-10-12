"""v2 局部识别候选；透明范围优先，人工保护在原始工作坐标合并。"""
import copy
import base64
import io
import os
from pathlib import Path
import numpy as np
from height_ops import selected, patch, check_cancel
from project_v2 import encode_raster, _metadata, _pixels


def _predict(rgb):
  directory = Path(os.environ.get('RELIEF_BIREFNET_DIRECTORY',
                    str(Path(__file__).resolve().parents[1]/'model-runtime'/'birefnet-hr')))
  if not (directory/'model.safetensors').is_file():
    raise RuntimeError('缺少 BiRefNet 模型；请设置 RELIEF_BIREFNET_DIRECTORY，不使用模拟主体代替真实识别')
  from foreground import ForegroundModel
  return ForegroundModel(directory).predict(rgb)


def _sam_prompt(prompt, width, height):
  if not isinstance(prompt, dict) or set(prompt) - {'points', 'box'}:
    raise ValueError('SAM 提示字段无效')
  points, box = prompt.get('points', []), prompt.get('box')
  if not isinstance(points, list) or not (0 if box is not None else 1) <= len(points) <= 256:
    raise ValueError('SAM 提示需要点或框')
  for point in points:
    if (not isinstance(point, dict) or set(point) != {'x', 'y', 'label'}
        or type(point['label']) is not int or point['label'] not in (0, 1)
        or any(type(point[k]) not in (int, float) or not np.isfinite(point[k]) for k in ('x', 'y'))
        or not 0 <= point['x'] < width or not 0 <= point['y'] < height):
      raise ValueError('SAM 提示点超出工作图范围或无效')
  if box is not None:
    from foreground import selection_bounds
    selection_bounds(box, width, height)
  return {'points': copy.deepcopy(points), 'box': copy.deepcopy(box)}


def _sam(rgba, prompt):
  checkpoint = Path(os.environ.get('RELIEF_SAM_CHECKPOINT',
                    str(Path(__file__).resolve().parents[1]/'model-runtime'/'sam2.1_hiera_tiny.pt')))
  if not checkpoint.is_file():
    raise RuntimeError('缺少 SAM 模型；请设置 RELIEF_SAM_CHECKPOINT')
  from subject_worker import SubjectWorker
  from relief import encode_image, decode_image
  job = {'action': 'predict', 'image': encode_image(rgba), 'points': prompt['points']}
  if prompt['box'] is not None:
    job['box'] = prompt['box']
  result = SubjectWorker(str(checkpoint)).run(job)
  return decode_image(result['mask'])[:, :, 3] > 0


def recognize(snapshot, selection=None, *, keep_background=False,
              protection_policy='preserve', cancelled=lambda: False, predictor=None,
              prompt=None, sam_predictor=None):
  check_cancel(cancelled)
  target = selected(snapshot, selection)
  if type(keep_background) is not bool or protection_policy not in ('preserve', 'overwrite'):
    raise ValueError('识别参数无效')
  if not target.any():
    return patch(snapshot, {}, '自动识别：空选区')
  shape = (snapshot['height'], snapshot['width'])
  rgba = snapshot['original'].reshape(*shape, 4)
  visible = rgba[:, :, 3] > 0
  # 有透明通道时把已有可见范围当成明确主体，避免模型删细字。
  if prompt is not None:
    validated_prompt = _sam_prompt(prompt, snapshot['width'], snapshot['height'])
    predicted = (sam_predictor or _sam)(rgba.copy(), validated_prompt)
    if (not isinstance(predicted, np.ndarray) or predicted.shape != shape
        or not np.isfinite(predicted).all() or np.any((predicted < 0) | (predicted > 1))):
      raise ValueError('SAM 预测尺寸或数值无效')
    probability = predicted.astype('float32')
    source = 'injected-test-sam' if sam_predictor is not None else 'SAM2.1'
  elif np.any(~visible):
    probability = visible.astype('float32')
    source = 'alpha'
  else:
    ys, xs = np.nonzero(target.reshape(shape))
    left, right, top, bottom = int(xs.min()), int(xs.max())+1, int(ys.min()), int(ys.max())+1
    rgb = rgba[top:bottom, left:right, :3].copy()
    predicted = (predictor or _predict)(rgb)
    if (not isinstance(predicted, np.ndarray) or predicted.shape != rgb.shape[:2]
        or not np.isfinite(predicted).all() or np.any((predicted < 0) | (predicted > 1))):
      raise ValueError('主体预测尺寸或概率无效')
    probability = np.zeros(shape, dtype='float32')
    probability[top:bottom, left:right] = predicted
    source = 'injected-test-predictor' if predictor is not None else 'BiRefNet_HR'
  check_cancel(cancelled)
  foreground = (probability >= .5) & visible & target.reshape(shape)
  from relief import segment, encode_image
  # 复用现有 Lab 分色、抗锯齿边缘处理；v1 分色标签只作为临时候选。
  labels = snapshot['labels'].copy()
  heights = snapshot['heights'].copy()
  colors = snapshot['colors'].copy()
  labels[target] = 0
  heights[target] = 0
  regions = copy.deepcopy(snapshot['regions'])
  used = set()
  if foreground.any():
    result = segment({'image': encode_image(rgba), 'subjectMask': foreground.ravel().astype(int).tolist(),
                      'subjectLayers': 0, 'sizeMm': snapshot['sizeMm']})
    candidate = np.asarray(result['labels'], dtype='uint16')
    occupied = {region['id'] for region in regions}
    for region in result['regions']:
      mask = (candidate == region['id']) & target
      is_background = region['name'] == '平面背景'
      if not mask.any() or (is_background and not keep_background):
        continue
      overlaps, counts = np.unique(snapshot['labels'][mask], return_counts=True)
      choices = [(int(count), int(id_)) for id_, count in zip(overlaps, counts)
                 if id_ != 0 and int(id_) not in used]
      if choices:
        region_id = max(choices)[1]
        old_region = next(r for r in regions if r['id'] == region_id)
        default = old_region['defaultLayers']
      else:
        region_id = next((id_ for id_ in range(1, 65536) if id_ not in occupied), None)
        if region_id is None:
          raise ValueError('区域 ID 已耗尽')
        occupied.add(region_id)
        default = 0 if is_background else 10
        regions.append({'id': region_id, 'name': region['name'], 'color': region['color'], 'defaultLayers': default})
      used.add(region_id)
      labels[mask] = region_id
      heights[mask] = 0 if is_background else default
      # 已有打印像素保留局部高度，避免区域默认值吞掉人工或混合高度。
      existing = mask & (snapshot['labels'] != 0) & (not is_background)
      heights[existing] = snapshot['heights'][existing]
  elif keep_background:
    # 主体为空仍允许保留已有可见背景；零层不等于不打印。
    keep = target & visible.ravel()
    labels[keep] = snapshot['labels'][keep]
    missing = keep & (labels == 0)
    if missing.any():
      occupied = {region['id'] for region in regions}
      region_id = next((id_ for id_ in range(1, 65536) if id_ not in occupied), None)
      if region_id is None:
        raise ValueError('区域 ID 已耗尽')
      rgb = np.rint(np.mean(rgba.reshape(-1, 4)[missing, :3], axis=0)).astype('uint8')
      regions.append({'id': region_id, 'name': '平面背景',
                      'color': '#' + ''.join(f'{int(c):02x}' for c in rgb), 'defaultLayers': 0})
      labels[missing] = region_id
  colors.reshape(-1, 4)[target] = rgba.reshape(-1, 4)[target]
  uncertain = target & ((probability.ravel() > .35) & (probability.ravel() < .65))
  if protection_policy == 'preserve':
    protection = snapshot['protection']
    locked_range = target & ((protection & 1) != 0)
    locked_color = target & ((protection & 2) != 0)
    locked_height = target & ((protection & 4) != 0)
    labels[locked_range] = snapshot['labels'][locked_range]
    heights[locked_height] = snapshot['heights'][locked_height]
    colors.reshape(-1, 4)[locked_color] = snapshot['colors'].reshape(-1, 4)[locked_color]
    conflict = target & ((labels == 0) & (heights != 0))
    conflict |= locked_range & (labels == 0)
    # 耦合冲突保持原有标签和高度；保色位独立，不禁止范围改变。
    labels[conflict] = snapshot['labels'][conflict]
    heights[conflict] = snapshot['heights'][conflict]
    uncertain |= conflict
  heights[labels == 0] = 0
  labels[~visible.ravel()] = 0
  heights[~visible.ravel()] = 0
  next_snapshot = dict(snapshot, labels=labels, heights=heights, colors=colors, regions=regions)
  count, ids = _metadata(next_snapshot)
  _pixels(next_snapshot, count, ids)
  check_cancel(cancelled)
  output = patch(snapshot, {'labels': labels, 'heights': heights, 'colors': colors}, '自动识别')
  if regions != snapshot['regions']:
    keys = ('regions', 'name', 'sizeMm', 'device', 'heightMapping')
    output['properties'] = {'before': {k: copy.deepcopy(snapshot[k]) for k in keys},
                            'after': {k: copy.deepcopy(next_snapshot[k]) for k in keys}}
  output['diagnostics'] = {'source': source,
    'added': encode_raster(((labels != 0) & (snapshot['labels'] == 0)).astype('uint8')),
    'removed': encode_raster(((labels == 0) & (snapshot['labels'] != 0)).astype('uint8')),
    'uncertain': encode_raster(uncertain.astype('uint8'))}
  return output


def import_snapshot(image_data_url, size_mm, name='未命名工程', *, keep_background=False,
                    protection_policy='preserve', cancelled=lambda: False, predictor=None,
                    session_id=None, prompt=None, sam_predictor=None):
  """独立导入工作图；不访问当前工程，不替换调用者的现有状态。"""
  from relief import decode_image, physical_size
  from project_v2 import migrate_v1
  from uuid import uuid4
  check_cancel(cancelled)
  rgba = decode_image(image_data_url)
  # 新导入建立工作坐标前校正 EXIF 方向；旧 v1 解码语义保持原状。
  from PIL import Image, ImageOps
  with Image.open(io.BytesIO(base64.b64decode(image_data_url.split(',', 1)[1], validate=True))) as image:
    rgba = np.asarray(ImageOps.exif_transpose(image).convert('RGBA')).copy()
  physical_size(size_mm)
  if not isinstance(name, str):
    raise ValueError('工程名称无效')
  height, width = rgba.shape[:2]
  from relief import encode_image
  empty = {'version': 1, 'name': name, 'width': width, 'height': height,
           'sizeMm': list(size_mm), 'image': encode_image(rgba),
           'labels': [0]*(width*height),
           'regions': [{'id': 1, 'name': '导入占位', 'color': '#ffffff', 'layers': 0}]}
  snapshot = migrate_v1(empty, session_id=str(uuid4()) if session_id is None else session_id)
  snapshot['regions'] = []
  candidate = recognize(snapshot, keep_background=keep_background,
                        protection_policy=protection_policy, cancelled=cancelled, predictor=predictor,
                        prompt=prompt, sam_predictor=sam_predictor)
  from project_v2 import decode_raster
  for block in candidate['blocks']:
    field, offset = block['field'], block['offset']
    count = len(base64.b64decode(block['after']['data']))//snapshot[field].dtype.itemsize
    snapshot[field][offset:offset+count] = decode_raster(block['after'], block['after']['type'], count)
  if 'properties' in candidate:
    snapshot.update(candidate['properties']['after'])
  check_cancel(cancelled)
  return snapshot
