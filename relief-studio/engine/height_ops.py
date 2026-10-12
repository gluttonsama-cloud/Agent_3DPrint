"""只生成 v2 高度候选；结构建议不从颜色亮度猜测物理高度。"""
import math
import cv2
import numpy as np
from project_v2 import _metadata, _pixels, encode_raster


def check_cancel(cancelled):
  if cancelled():
    raise InterruptedError('操作已取消')


def selected(snapshot, selection):
  count, ids = _metadata(snapshot)
  _pixels(snapshot, count, ids)
  if selection is None:
    return np.ones(count, dtype=bool)
  if (not isinstance(selection, np.ndarray) or selection.dtype != np.uint8
      or selection.shape != (count,) or np.any(selection > 1)):
    raise ValueError('选区必须为同尺寸一维 uint8 0/1')
  return selection.astype(bool)


def patch(snapshot, changes, description):
  blocks = []
  for field, after in changes.items():
    before = snapshot[field]
    changed = np.flatnonzero(before != after)
    if changed.size:
      # 使用一个紧凑包围区间，避免细字产生数百万零碎块。
      left, right = int(changed[0]), int(changed[-1])+1
      blocks.append({'field': field, 'offset': left,
                     'before': encode_raster(before[left:right].copy()),
                     'after': encode_raster(after[left:right].copy())})
  return {'base': {'sessionId': snapshot['sessionId'], 'revision': snapshot['revision']},
          'description': description, 'blocks': blocks}


def number(operation, key, low, high, integer=False):
  value = operation.get(key)
  if (type(value) not in (int, float) or not math.isfinite(value)
      or not low <= value <= high or (integer and type(value) is not int)):
    raise ValueError(f'{key}: 参数无效')
  return value


def run_height(snapshot, operation, selection=None, cancelled=lambda: False):
  check_cancel(cancelled)
  target = selected(snapshot, selection) & (snapshot['labels'] != 0)
  if not isinstance(operation, dict):
    raise ValueError('高度操作无效')
  kind = operation.get('kind')
  if kind not in ('set', 'add', 'uniform', 'scale', 'suggest', 'bevel', 'smooth'):
    raise ValueError('未知高度操作')
  manual = kind in ('set', 'add')
  if not manual:
    target &= (snapshot['protection'] & 4) == 0
  values = snapshot['heights'].astype(np.float64)
  shape = (snapshot['height'], snapshot['width'])
  labels = snapshot['labels'].reshape(shape)
  if kind in ('set', 'uniform'):
    values[target] = number(operation, 'layers', 0, 256, True)
  elif kind == 'add':
    values[target] += number(operation, 'delta', -256, 256, True)
  elif kind == 'scale':
    values[target] *= number(operation, 'factor', 0, 256)
  elif kind == 'suggest':
    maximum = number(operation, 'maxLayers', 0, 256, True)
    proposals = np.full(shape, -1, dtype='int16')
    # 只使用明确闭合包含关系：外层底面 3，内部装饰 6，内部细线 10。
    # 没有包含证据的孤立色块、文字与同色断开部分均保持现高。
    for region_id in np.unique(labels):
      if region_id == 0:
        continue
      check_cancel(cancelled)
      count, components, stats, _ = cv2.connectedComponentsWithStats(
        (labels == region_id).astype('uint8'), connectivity=8)
      distance = cv2.distanceTransform(np.pad((labels == region_id).astype('uint8'), 1),
                                      cv2.DIST_L2, 5)[1:-1, 1:-1]
      contours, hierarchy = cv2.findContours((labels == region_id).astype('uint8'),
                                             cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
      if hierarchy is None:
        continue
      for index, relation in enumerate(hierarchy[0]):
        if relation[3] < 0:
          continue
        check_cancel(cancelled)
        enclosed = np.zeros(shape, dtype='uint8')
        cv2.drawContours(enclosed, contours, index, 1, -1)
        interior = (enclosed != 0) & (labels != region_id)
        # 孔洞中有非打印空白时，无法确认完整底面，保持原高度。
        if not interior.any() or np.any(labels[interior] == 0):
          continue
        outer_point = contours[relation[3]][0, 0]
        component = int(components[outer_point[1], outer_point[0]])
        if stats[component, cv2.CC_STAT_AREA] < 16 or float(distance[components == component].max()) < 2:
          continue
        proposals[components == component] = 3
        for child_id in np.unique(labels[interior]):
          child = interior & (labels == child_id)
          child_distance = cv2.distanceTransform(np.pad(child.astype('uint8'), 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
          proposals[child] = 10 if float(child_distance.max())*2 <= 3 else 6
    suggested = proposals.ravel()
    change = target & (suggested >= 0)
    values[change] = np.minimum(maximum, suggested[change])
  else:
    radius = number(operation, 'radiusPx', 1, 128, True)
    for region_id in np.unique(labels):
      if region_id == 0:
        continue
      check_cancel(cancelled)
      mask = (labels == region_id) & target.reshape(shape)
      if not mask.any():
        continue
      if kind == 'bevel':
        distance = cv2.distanceTransform(np.pad(mask.astype('uint8'), 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
        # 最外层至少保留一层；零层仍为零，不扩大范围或填孔。
        factor = np.minimum(1, distance/radius)
        current = values.reshape(shape)
        current[mask] = np.where(current[mask] > 0, np.maximum(1, current[mask]*factor[mask]), 0)
      else:
        weight = mask.astype('float64')
        current = values.reshape(shape)
        kernel = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype='float64')
        counts = cv2.filter2D(weight, -1, kernel, borderType=cv2.BORDER_CONSTANT)
        for _ in range(radius):
          check_cancel(cancelled)
          sums = cv2.filter2D(current*weight, -1, kernel, borderType=cv2.BORDER_CONSTANT)
          current[mask] = sums[mask]/counts[mask]
  heights = np.clip(np.floor(values+.5), 0, 256).astype('uint16')
  changes = {'heights': heights}
  if manual:
    protection = snapshot['protection'].copy()
    protection[target] |= 4
    changes['protection'] = protection
  # 标定曲线不足时拒绝整个候选，禁止静默外推。
  mapping = snapshot['heightMapping']
  if mapping['kind'] == 'calibrated' and int(heights.max()) >= len(mapping['mmByLayer']):
    raise ValueError('高度超出标定范围')
  check_cancel(cancelled)
  result = patch(snapshot, changes, f'高度操作：{kind}')
  if kind == 'suggest':
    result['diagnostics'] = {'reason': '仅明确闭合包含结构使用底面3/装饰6/细节10；未知结构保持现高',
                             'classifiedPixels': int(change.sum()),
                             'unchangedUnknownPixels': int((target & (suggested < 0)).sum())}
  return result
