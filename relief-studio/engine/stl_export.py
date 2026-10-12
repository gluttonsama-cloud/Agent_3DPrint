"""将工程高度图原尺寸导出为封闭的二进制 STL。"""
import math
import json
import shutil
import struct
import tempfile
from pathlib import Path

import numpy as np

from relief import validate_project


MAX_TRIANGLES = 25_000_000  # 二进制 STL 约 1.25 GB
TRIANGLE = struct.Struct('<12fH')


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


def _repair_diagonal_contacts(levels):
  repaired = levels.copy()
  operations = 0
  while True:
    first, second = _diagonal_contacts(repaired)
    positions = np.argwhere(first | second)
    if not len(positions):
      return repaired
    for y, x in positions:
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


class _Writer:
  def __init__(self, output):
    self.output = output
    self.buffer = bytearray()
    self.count = 0
    output.write(b'Relief Studio binary STL'.ljust(80, b'\0'))
    output.write(b'\0' * 4)

  def triangle(self, normal, a, b, c):
    self.buffer.extend(TRIANGLE.pack(*normal, *a, *b, *c, 0))
    self.count += 1
    if self.count > MAX_TRIANGLES:
      raise ValueError('STL 三角面过多；请减少工程尺寸或区域复杂度')
    if len(self.buffer) >= 1_000_000:
      self.output.write(self.buffer)
      self.buffer.clear()

  def quad(self, normal, a, b, c, d):
    self.triangle(normal, a, b, c)
    self.triangle(normal, a, c, d)

  def finish(self):
    self.output.write(self.buffer)
    self.output.seek(80)
    self.output.write(struct.pack('<I', self.count))


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


def _write_mesh(output, heights, size):
  rows, cols = heights.shape
  xs = [float(np.float32(size[0] * i / cols)) for i in range(cols+1)]
  ys = [float(np.float32(size[1] * j / rows)) for j in range(rows+1)]
  if any(a >= b for a, b in zip(xs, xs[1:])) or any(a >= b for a, b in zip(ys, ys[1:])):
    raise ValueError('成品尺寸相对像素网格过小，超出 STL 浮点精度')
  if np.all(heights == heights[0, 0]):
    z, x1, y1 = float(heights[0, 0]), xs[-1], ys[-1]
    writer = _Writer(output)
    writer.quad((0,0,1), (0,0,z), (x1,0,z), (x1,y1,z), (0,y1,z))
    writer.quad((0,0,-1), (0,0,0), (0,y1,0), (x1,y1,0), (x1,0,0))
    writer.quad((0,-1,0), (0,0,0), (x1,0,0), (x1,0,z), (0,0,z))
    writer.quad((0,1,0), (0,y1,0), (0,y1,z), (x1,y1,z), (x1,y1,0))
    writer.quad((-1,0,0), (0,0,0), (0,0,z), (0,y1,z), (0,y1,0))
    writer.quad((1,0,0), (x1,0,0), (x1,y1,0), (x1,y1,z), (x1,0,z))
    writer.finish()
    return writer.count
  padded = np.pad(heights, 1)
  writer = _Writer(output)
  for y in range(rows):
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
  writer.finish()
  return writer.count


def export_stl(project, destination, options):
  """输出新目录中的 model.stl，并返回路径与网格统计。"""
  _, labels = validate_project(project)
  if not isinstance(options, dict):
    raise ValueError('STL 参数必须为对象')
  layer = _number(options.get('layerHeightMm'), '层高', 0.001, 10)
  base = _number(options.get('baseThicknessMm', 0), '底板厚度', 0, 100, allow_zero=True)
  repair = options.get('repairDiagonalContacts', False)
  if type(repair) is not bool:
    raise ValueError('对角接触修复选项必须为布尔值')
  if base + layer * max(region['layers'] for region in project['regions']) > 10000:
    raise ValueError('STL 总高度不能超过 10000 mm')
  levels = np.zeros(labels.shape, dtype=np.uint16)
  for region in project['regions']:
    levels[labels == region['id']] = region['layers']
  changed_pixels = 0
  added_volume = 0.0
  if repair:
    original_levels = levels
    levels = _repair_diagonal_contacts(levels)
    changed_pixels = int(np.count_nonzero(levels != original_levels))
    added_volume = (float(np.sum(levels.astype(np.int32)-original_levels.astype(np.int32)))
                    * layer * project['sizeMm'][0] * project['sizeMm'][1] / levels.size)
  heights = np.asarray(base + levels.astype(np.float64) * layer, dtype=np.float32)
  if not np.any(heights):
    raise ValueError('没有正高度可导出的几何体')
  used = np.unique(levels)
  precise = np.float32(base + used.astype(np.float64) * layer)
  if base > 0:
    precise = np.r_[np.float32(0), precise]
  if np.any(np.diff(precise) <= 0):
    raise ValueError('层高在当前底板厚度下超出 STL 浮点精度')
  _check_diagonal_contacts(heights)
  destination = Path(destination).resolve()
  if destination.exists():
    raise ValueError('输出目录已存在，请选择新目录以免覆盖数据')
  destination.parent.mkdir(parents=True, exist_ok=True)
  stage = Path(tempfile.mkdtemp(prefix='.stl-', dir=destination.parent))
  try:
    with (stage/'model.stl').open('w+b') as output:
      triangles = _write_mesh(output, heights[::-1, :], project['sizeMm'])
    metadata = {'triangles': triangles, 'sizeMm': [*project['sizeMm'], float(heights.max())],
                'repairedPixels': changed_pixels, 'addedVolumeMm3': added_volume}
    (stage/'mesh-info.json').write_text(json.dumps(metadata, ensure_ascii=False), encoding='utf-8')
    stage.rename(destination)
  except BaseException:
    shutil.rmtree(stage)
    raise
  return {'path': str(destination/'model.stl'), **metadata}
