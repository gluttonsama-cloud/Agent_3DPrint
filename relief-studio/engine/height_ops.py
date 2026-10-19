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


def bevel_heights(source, labels, target, radius, cancelled):
  result = source.astype('float64')
  if not target.any():
    return result
  surface = np.pad(np.where(labels != 0, source, 0), 1)
  center = surface[1:-1, 1:-1]
  # 只处理有平坦内部的台面，保留细线和已经成坡的逐像素高度。
  interior = ((center > 0) & (center == surface[:-2, 1:-1]) &
              (center == surface[2:, 1:-1]) & (center == surface[1:-1, :-2]) &
              (center == surface[1:-1, 2:]))
  contours, _ = cv2.findContours(interior.astype('uint8'), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
  visited = surface.astype('int32')
  flood_mask = np.zeros((surface.shape[0]+2, surface.shape[1]+2), dtype='uint8')
  writable = np.pad(target, 1)
  output = np.pad(result, 1)
  cross = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype='uint8')
  for index, contour in enumerate(contours):
    check_cancel(cancelled)
    x, y = (contour[0, 0]+1).tolist()
    level = int(visited[y, x])
    if level <= 0:
      continue
    marker = -index-1
    _, _, _, (left, top, width, height) = cv2.floodFill(visited, flood_mask, (x, y), marker, flags=4)
    area = np.s_[top-1:top+height+1, left-1:left+width+1]
    plateau = visited[area] == marker
    mask = plateau & writable[area]
    if not mask.any():
      continue
    outline = (cv2.dilate(plateau.astype('uint8'), cross) != 0) & ~plateau
    lower = outline & (surface[area] < level)
    if not lower.any():
      continue
    # 同一台面统一朝最高邻接低面倒角，避免不同底面的最近点切换制造新陡壁。
    base = int(surface[area][lower].max())
    distance = cv2.distanceTransform((~lower).astype('uint8'), cv2.DIST_L2, 5)
    factor = np.minimum(1, distance/radius)
    output[area][mask] = np.maximum(1, base+(level-base)*factor[mask])
  return output[1:-1, 1:-1]


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
    roles = {}

    def propose(mask, layers):
      # 保留全部角色证据，不能让后遍历的字母孔洞覆盖先前判断。
      for label in np.unique(labels[mask]):
        roles.setdefault(int(label), set()).add(layers)
      proposals[mask] = layers
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
        propose(components == component, 3)
        for child_id in np.unique(labels[interior]):
          child = interior & (labels == child_id)
          child_distance = cv2.distanceTransform(np.pad(child.astype('uint8'), 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
          propose(child, 10 if float(child_distance.max())*2 <= 3 else 6)
    # 同一区域有相互矛盾的底面/装饰/细线判断时，整区保持现高。
    # 文字的封闭孔洞不能被当作可靠的立体语义；不改色、不填孔。
    ambiguous = [label for label, candidates in roles.items() if len(candidates) > 1]
    if ambiguous:
      proposals[np.isin(labels, ambiguous)] = -1
    suggested = proposals.ravel()
    change = target & (suggested >= 0)
    values[change] = np.minimum(maximum, suggested[change])
  else:
    radius = number(operation, 'radiusPx', 1, 128, True)
    if kind == 'bevel':
      values = bevel_heights(snapshot['heights'].reshape(shape), labels,
                            target.reshape(shape), radius, cancelled).ravel()
    for region_id in np.unique(labels) if kind == 'smooth' else ():
      if region_id == 0:
        continue
      check_cancel(cancelled)
      mask = (labels == region_id) & target.reshape(shape)
      if not mask.any():
        continue
      weight = mask.astype('float64')
      current = values.reshape(shape)
      kernel = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype='float64')
      counts = cv2.filter2D(weight, -1, kernel, borderType=cv2.BORDER_CONSTANT)
      region = (labels == region_id).astype('uint8')
      interior = cv2.erode(region, kernel.astype('uint8'), borderType=cv2.BORDER_CONSTANT, borderValue=0)
      # 只固定有二维内部支撑的轮廓；一像素细线仍做双向平均，不逐轮侵蚀。
      supported = cv2.dilate(interior, np.ones((3, 3), dtype='uint8')) != 0
      edge = mask & (interior == 0) & supported
      original = snapshot['heights'].reshape(shape)
      for _ in range(radius):
        check_cancel(cancelled)
        sums = cv2.filter2D(current*weight, -1, kernel, borderType=cv2.BORDER_CONSTANT)
        current[mask] = sums[mask]/counts[mask]
        # 固定轮廓端点，向区域内部平滑；选区边界和保护边界不算轮廓。
        current[edge] = original[edge]
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
    result['diagnostics'] = {'reason': '仅层级判断一致的闭合结构使用底面3/装饰6/细节10；冲突及未知区域保持现高',
                             'ambiguousRegionCount': len(ambiguous),
                             'classifiedPixels': int(change.sum()),
                             'unchangedUnknownPixels': int((target & (suggested < 0)).sum())}
  return result
