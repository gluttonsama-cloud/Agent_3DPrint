"""封闭 OBJ 流式写出；索引仅缓存仍可能被下一行使用的边界。"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from height_mesh import checkpoint, prepare_heights, write_height_mesh

MAX_TRIANGLES = 25_000_000
MAX_BYTES = 1024**3
HEADER = 'mtllib relief.mtl\n'
MATERIALS = ('newmtl relief\nKd 1 1 1\nmap_Kd texture.png\n'
             '\nnewmtl base\nKd 1 1 1\n')


class _Writer:
  def __init__(self, size, overhead, stream=None):
    self.size, self.stream = size, stream
    self.count = self.vertices = self.uvs = 0
    self.rows = {}
    self.material = None
    self.bytes = overhead
    self.write(HEADER)

  def write(self, value):
    self.bytes += len(value)
    if self.bytes > MAX_BYTES:
      raise ValueError('封闭 OBJ 超过 1 GiB 文件上限；请显式降低输入采样')
    if self.stream is not None:
      self.stream.write(value)

  def vertex(self, point):
    x, y, z = point
    vertices, uvs = self.rows.setdefault(y, ({}, {}))
    key = (x, z)
    index = vertices.get(key)
    if index is None:
      self.vertices += 1
      index = vertices[key] = self.vertices
      self.write(f'v {x:.12g} {y:.12g} {z:.12g}\n')
    uv = uvs.get(x)
    if uv is None:
      self.uvs += 1
      uv = uvs[x] = self.uvs
      self.write(f'vt {x/self.size[0]:.12g} {y/self.size[1]:.12g}\n')
    return f'{index}/{uv}'

  def triangle(self, normal, a, b, c):
    self.count += 1
    if self.count > MAX_TRIANGLES:
      raise ValueError('封闭 OBJ 超过 2500 万三角面上限；请显式降低输入采样')
    # 只有朝上的表面使用彩图；侧壁及封闭底面保持无贴图材质。
    material = 'relief' if normal[2] > 0 else 'base'
    if material != self.material:
      self.write(f'usemtl {material}\n')
      self.material = material
    self.write('f ' + ' '.join(self.vertex(point) for point in (a, b, c)) + '\n')

  def quad(self, normal, a, b, c, d):
    self.triangle(normal, a, b, c)
    self.triangle(normal, a, c, d)

  def end_row(self, y):
    self.rows = {key: value for key, value in self.rows.items() if key > y}


def export_solid_obj(snapshot, directory, options, cancelled, progress):
  heights, info = prepare_heights(snapshot, options, default_base=1, cancelled=cancelled)
  size = snapshot['sizeMm']
  source = {'sessionId': snapshot['sessionId'], 'revision': snapshot['revision']}
  # 标识文本不限长，必须计算真实 UTF-8 字节；其余固定字段与 PNG 开销另留上界。
  metadata_bytes = len(json.dumps({**info, 'source': source}, ensure_ascii=False).encode('utf-8'))
  overhead = snapshot['width'] * snapshot['height'] * 8 + metadata_bytes + 65536
  counter = _Writer(size, overhead)
  write_height_mesh(counter, heights[::-1], size, cancelled, progress)
  checkpoint(cancelled)
  directory = Path(directory)
  directory.mkdir(parents=True, exist_ok=True)
  names = ['relief.obj', 'relief.mtl', 'texture.png', 'obj-meta.json']
  if any((directory/name).exists() for name in names):
    raise FileExistsError('OBJ 目标文件已存在')
  try:
    with (directory/names[0]).open('w', encoding='utf-8', newline='\n') as stream:
      writer = _Writer(size, overhead, stream)
      write_height_mesh(writer, heights[::-1], size, cancelled, progress)
    checkpoint(cancelled)
    rgba = snapshot['colors'].reshape(snapshot['height'], snapshot['width'], 4)
    alpha = rgba[:, :, 3:4].astype(np.float64) / 255
    texture = np.rint(rgba[:, :, :3]*alpha + 255*(1-alpha)).astype(np.uint8)
    texture[snapshot['labels'].reshape(heights.shape) == 0] = 255
    # 白底 RGB 纹理使无彩色覆盖的底板仍可见，包括统一高度盒子。
    Image.fromarray(texture).save(directory/names[2])
    (directory/names[1]).write_text(MATERIALS, encoding='utf-8')
    metadata = {**info, 'units': 'mm', 'zAxis': 'up', 'triangles': writer.count,
                'vertices': writer.vertices, 'estimatedBytes': counter.bytes,
                'sizeMm': [*size, float(heights.max())],
                'sampling': [snapshot['width'], snapshot['height']],
                'source': source, 'textureScope': 'top-only'}
    (directory/names[3]).write_text(json.dumps(metadata, ensure_ascii=False), encoding='utf-8')
    if sum((directory/name).stat().st_size for name in names) > MAX_BYTES:
      raise ValueError('封闭 OBJ 超过 1 GiB 文件上限')
    checkpoint(cancelled)
    checks = []
    if info['repairedPixels']:
      checks.append({'code': 'OBJ_GEOMETRY_REPAIRED', 'status': 'warning',
                     'message': f"仅 OBJ 修复 {info['repairedPixels']} 个角点像素连接，"
                                f"新增体积 {info['addedVolumeMm3']:.6g} mm³；工程和打印母版不变"})
    return {'files': names, 'triangles': writer.count, 'estimatedBytes': counter.bytes, 'checks': checks}
  except BaseException:
    for name in names:
      (directory/name).unlink(missing_ok=True)
    raise
