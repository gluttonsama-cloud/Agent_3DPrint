"""将 v1/v2 工程实际高度原尺寸导出为封闭二进制 STL。"""
import json
import shutil
import struct
import tempfile
from pathlib import Path
from height_mesh import prepare_heights, write_height_mesh

MAX_TRIANGLES = 25_000_000
TRIANGLE = struct.Struct('<12fH')


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

  def end_row(self, y):
    pass

  def finish(self):
    self.output.write(self.buffer)
    self.output.seek(80)
    self.output.write(struct.pack('<I', self.count))


def export_stl(project, destination, options):
  """输出新目录中的 model.stl，并返回路径与网格统计。"""
  from project_v2 import decode_project, migrate_v1
  if project.get('version') == 2:
    snapshot = decode_project(project)
  else:
    if not isinstance(options, dict) or 'layerHeightMm' not in options:
      raise ValueError('旧版工程必须提供层高')
    snapshot = migrate_v1(project)
  heights, info = prepare_heights(snapshot, options)
  destination = Path(destination).resolve()
  if destination.exists():
    raise ValueError('输出目录已存在，请选择新目录以免覆盖数据')
  destination.parent.mkdir(parents=True, exist_ok=True)
  stage = Path(tempfile.mkdtemp(prefix='.stl-', dir=destination.parent))
  try:
    with (stage/'model.stl').open('w+b') as output:
      writer = _Writer(output)
      triangles = write_height_mesh(writer, heights[::-1, :], snapshot['sizeMm'])
      writer.finish()
    metadata = {'triangles': triangles, 'sizeMm': [*snapshot['sizeMm'], float(heights.max())], **info}
    (stage/'mesh-info.json').write_text(json.dumps(metadata, ensure_ascii=False), encoding='utf-8')
    stage.rename(destination)
  except BaseException:
    shutil.rmtree(stage)
    raise
  return {'path': str(destination/'model.stl'), **metadata}
