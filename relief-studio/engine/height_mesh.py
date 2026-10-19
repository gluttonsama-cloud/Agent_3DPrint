"""共享的毫米高度准备与封闭像素网格三角化。"""
import math
import numpy as np


def checkpoint(cancelled):
  if cancelled():
    raise InterruptedError('模型输出已取消')


def _number(value, name, minimum, maximum, allow_zero=False):
  if (type(value) not in (int, float) or not math.isfinite(value)
      or value < minimum or (not allow_zero and value == 0) or value > maximum):
    raise ValueError(f'{name} 必须是有限的有效毫米数值')
  return float(value)


def _diagonal_contacts(heights):
  # 高度切片若只在对角相接，实体边界会在该顶点产生非流形接触。
  padded = np.pad(heights, 1)
  a = padded[:-1, :-1]
  b = padded[:-1, 1:]
  c = padded[1:, :-1]
  d = padded[1:, 1:]
  first = np.minimum(a, d) > np.maximum(b, c)
  second = np.minimum(b, c) > np.maximum(a, d)
  return first, second


def _check_diagonal_contacts(heights):
  first, second = _diagonal_contacts(heights)
  if np.any(first | second):
    raise ValueError('高度图包含仅在对角接触的区域；请启用角点修复或手动调整后再导出 STL')


def _repair_diagonal_contacts(levels, cancelled=lambda: False):
  repaired = levels.copy()
  operations = 0
  while True:
    checkpoint(cancelled)
    first, second = _diagonal_contacts(repaired)
    positions = np.argwhere(first | second)
    if not len(positions):
      return repaired
    for index, (y, x) in enumerate(positions):
      if index % 1024 == 0:
        checkpoint(cancelled)
      a, b = int(repaired[y-1, x-1]), int(repaired[y-1, x])
      c, d = int(repaired[y, x-1]), int(repaired[y, x])
      if min(a, d) > max(b, c):
        candidates = ((y-1, x), (y, x-1))
        target = min(a, d)
      elif min(b, c) > max(a, d):
        candidates = ((y-1, x-1), (y, x))
        target = min(b, c)
      else:
        continue
      # 优先提升已经较高的格子，以尽可能少地增加体积。
      chosen = max(candidates, key=lambda point: int(repaired[point]))
      if repaired[chosen] < target:
        repaired[chosen] = target
        operations += 1
        if operations > 1_000_000:
          raise ValueError('对角接触过多，无法在安全范围内修复 STL')


def _corner_levels(padded, y, x):
  return (padded[y, x], padded[y, x+1], padded[y+1, x], padded[y+1, x+1])


def prepare_heights(snapshot, options, *, default_base=0, cancelled=lambda: False):
  if not isinstance(options, dict):
    raise ValueError('模型参数必须为对象')
  checkpoint(cancelled)
  base = _number(options.get('baseThicknessMm', default_base), '底板厚度', 0, 100, allow_zero=True)
  repair = options.get('repairDiagonalContacts', False)
  if type(repair) is not bool:
    raise ValueError('对角接触修复选项必须为布尔值')
  with np.errstate(over='ignore'):
    finite_size = np.isfinite(np.asarray(snapshot['sizeMm'], dtype=np.float32)).all()
  if not finite_size:
    raise ValueError('模型尺寸超出有限浮点坐标范围')
  levels = snapshot['heights'].reshape(snapshot['height'], snapshot['width'])
  mapping = snapshot['heightMapping']
  if mapping['kind'] == 'calibrated':
    if 'layerHeightMm' in options:
      raise ValueError('标定工程使用自身曲线，不能同时指定统一层高')
    effective = mapping.copy()
    actual = np.asarray(mapping['mmByLayer'], dtype=np.float64)[levels]
  else:
    layer = _number(options.get('layerHeightMm', mapping['mmPerLayer']), '层高', .001, 10)
    effective = {'kind': 'design', 'mmPerLayer': layer}
    actual = levels.astype(np.float64) * layer
  actual = actual + base
  if not np.isfinite(actual).all() or actual.max() > 10000:
    raise ValueError('模型总高度不能超过 10000 mm')
  unique, inverse = np.unique(actual, return_inverse=True)
  physical = np.unique(np.r_[0., unique])
  if np.any(np.diff(physical.astype(np.float32)) <= 0):
    raise ValueError('层高在当前底板厚度下超出模型浮点精度')
  ranks = inverse.reshape(levels.shape).astype(np.uint16)
  if repair:
    # ranks 的零级可能是正厚底板，修复只在内部角点发生。
    ranks = _repair_diagonal_contacts(ranks, cancelled)
  repaired = unique[ranks]
  changed = int(np.count_nonzero(repaired != actual))
  added = float(np.sum(repaired-actual)) * snapshot['sizeMm'][0] * snapshot['sizeMm'][1] / levels.size
  heights = repaired.astype(np.float32)
  if not np.any(heights):
    raise ValueError('没有正高度可导出的几何体')
  _check_diagonal_contacts(heights)
  return heights, {'closedSolid': True, 'baseThicknessMm': base, 'repairedPixels': changed,
                   'addedVolumeMm3': added, 'heightMapping': effective,
                   'sourceHeightMapping': mapping}


def _wall(writer, normal, start, end, lo, hi, start_levels, end_levels, horizontal):
  # 两端各自的高度断点不同；用拉链式三角化避免向另一端传播 T 接点。
  left = sorted({float(lo), float(hi), *(float(v) for v in start_levels if lo < v < hi)})
  right = sorted({float(lo), float(hi), *(float(v) for v in end_levels if lo < v < hi)})
  make_start = lambda z: (start[0], start[1], z)
  make_end = lambda z: (end[0], end[1], z)
  reverse = normal[1] > 0 if horizontal else normal[0] < 0

  def triangle(a, b, c):
    writer.triangle(normal, a, c, b) if reverse else writer.triangle(normal, a, b, c)

  i = j = 0
  while i < len(left)-1 or j < len(right)-1:
    a, b = make_start(left[i]), make_end(right[j])
    next_left = left[i+1] if i+1 < len(left) else float('inf')
    next_right = right[j+1] if j+1 < len(right) else float('inf')
    if next_left <= next_right:
      triangle(a, b, make_start(next_left))
      i += 1
    if next_right <= next_left:
      triangle(make_start(left[i]), b, make_end(next_right))
      j += 1


def write_height_mesh(writer, heights, size, cancelled=lambda: False, progress=lambda *args: None):
  rows, cols = heights.shape
  xs = [float(np.float32(size[0] * i / cols)) for i in range(cols+1)]
  ys = [float(np.float32(size[1] * j / rows)) for j in range(rows+1)]
  if not np.isfinite(xs).all() or not np.isfinite(ys).all() or not np.isfinite(heights).all():
    raise ValueError('模型尺寸超出有限浮点坐标范围')
  checkpoint(cancelled)
  if any(a >= b for a, b in zip(xs, xs[1:])) or any(a >= b for a, b in zip(ys, ys[1:])):
    raise ValueError('成品尺寸相对像素网格过小，超出 STL 浮点精度')
  if np.all(heights == heights[0, 0]):
    z, x1, y1 = float(heights[0, 0]), xs[-1], ys[-1]
    writer.quad((0,0,1), (0,0,z), (x1,0,z), (x1,y1,z), (0,y1,z))
    writer.quad((0,0,-1), (0,0,0), (0,y1,0), (x1,y1,0), (x1,0,0))
    writer.quad((0,-1,0), (0,0,0), (x1,0,0), (x1,0,z), (0,0,z))
    writer.quad((0,1,0), (0,y1,0), (0,y1,z), (x1,y1,z), (x1,y1,0))
    writer.quad((-1,0,0), (0,0,0), (0,0,z), (0,y1,z), (0,y1,0))
    writer.quad((1,0,0), (x1,0,0), (x1,y1,0), (x1,y1,z), (x1,0,z))
    return writer.count
  padded = np.pad(heights, 1)
  for y in range(rows):
    checkpoint(cancelled)
    for x in np.flatnonzero(heights[y]):
      z = float(heights[y, x])
      x0, x1, y0, y1 = xs[x], xs[x+1], ys[y], ys[y+1]
      writer.quad((0,0,1), (x0,y0,z), (x1,y0,z), (x1,y1,z), (x0,y1,z))
      writer.quad((0,0,-1), (x0,y0,0), (x0,y1,0), (x1,y1,0), (x1,y0,0))
      neighbors = (padded[y, x+1], padded[y+1, x],
                   padded[y+1, x+2], padded[y+2, x+1])
      if z > neighbors[0]:
        _wall(writer, (0,-1,0), (x0,y0), (x1,y0), neighbors[0], z,
              _corner_levels(padded,y,x), _corner_levels(padded,y,x+1), True)
      if z > neighbors[3]:
        _wall(writer, (0,1,0), (x0,y1), (x1,y1), neighbors[3], z,
              _corner_levels(padded,y+1,x), _corner_levels(padded,y+1,x+1), True)
      if z > neighbors[1]:
        _wall(writer, (-1,0,0), (x0,y0), (x0,y1), neighbors[1], z,
              _corner_levels(padded,y,x), _corner_levels(padded,y+1,x), False)
      if z > neighbors[2]:
        _wall(writer, (1,0,0), (x1,y0), (x1,y1), neighbors[2], z,
              _corner_levels(padded,y,x+1), _corner_levels(padded,y+1,x+1), False)
    writer.end_row(ys[y])
    progress(y+1, rows, "模型网格")
  return writer.count
