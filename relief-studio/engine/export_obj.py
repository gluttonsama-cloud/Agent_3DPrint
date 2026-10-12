"""原采样阶梯表面 OBJ；零层彩图保留为基准表面，不保证加工实体。"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from project_v2 import dumps_project

MAX_TRIANGLES = 2_000_000
MAX_BYTES = 512 * 1024**2


def export_obj(snapshot, directory, cancelled=lambda: False,
               progress=lambda completed, total, message: None):
  dumps_project(snapshot)
  width, height = snapshot['width'], snapshot['height']
  labels = snapshot['labels'].reshape(height, width) != 0
  heights = snapshot['heights'].reshape(height, width)
  mapping = snapshot['heightMapping']
  z = heights * 0.1 if mapping['kind'] == 'design' else np.asarray(mapping['mmByLayer'])[heights]
  # 合并每行连续同高顶面；邻接差值只输出一次，从较高面向较低面。
  def faces():
    for y in range(height):
      if cancelled():
        raise InterruptedError('OBJ 输出已取消')
      x = 0
      while x < width:
        if not labels[y, x]:
          x += 1
          continue
        end = x + 1
        while end < width and labels[y, end] and z[y, end] == z[y, x]:
          end += 1
        level = float(z[y, x])
        yield [(x, y + 1, level), (end, y + 1, level), (end, y, level), (x, y, level)]
        x = end
      for x in range(width):
        if not labels[y, x]:
          continue
        level = float(z[y, x])
        for dx, dy, edge in [(-1, 0, [(x,y),(x,y+1)]),
                             (1, 0, [(x+1,y+1),(x+1,y)]),
                             (0,-1, [(x+1,y),(x,y)]),
                             (0,1, [(x,y+1),(x+1,y+1)])]:
          nx, ny = x + dx, y + dy
          lower = float(z[ny,nx]) if 0 <= nx < width and 0 <= ny < height and labels[ny,nx] else 0.0
          if level > lower:
            a, b = edge
            yield [(*a,lower), (*b,lower), (*b,level), (*a,level)]
  count=0
  for _ in faces():
    count+=1
    if count*2>MAX_TRIANGLES or count*640+width*height*8>MAX_BYTES:
      raise ValueError('OBJ 预估超过 200 万三角面或 512 MiB；请显式降低输入采样')
  # 四个顶点/UV、两个面逐行写入；估算包含纹理和持久化副本。
  estimate = count * 640 + width * height * 8
  if count * 2 > MAX_TRIANGLES or estimate > MAX_BYTES:
    raise ValueError('OBJ 预估超过 200 万三角面或 512 MiB；请显式降低输入采样')
  directory = Path(directory)
  directory.mkdir(parents=True, exist_ok=True)
  names = ['relief.obj', 'relief.mtl', 'texture.png', 'obj-meta.json']
  if any((directory / name).exists() for name in names):
    raise FileExistsError('OBJ 目标文件已存在')
  try:
    with (directory / names[0]).open('w', encoding='utf-8', newline='\n') as stream:
      stream.write('mtllib relief.mtl\nusemtl relief\n')
      for index, face in enumerate(faces()):
        for x, y, level in face:
          stream.write(f'v {x * snapshot["sizeMm"][0] / width:.12g} {(height-y) * snapshot["sizeMm"][1] / height:.12g} {level:.12g}\n')
        for x, y, _ in face:
          stream.write(f'vt {x/width:.12g} {1-y/height:.12g}\n')
        vertices = [index * 4 + i for i in range(1,5)]
        for a,b,c in [(0,1,2),(0,2,3)]:
          stream.write('f ' + ' '.join(f'{vertices[i]}/{vertices[i]}' for i in (a,b,c)) + '\n')
        if index % 1024 == 0:
          progress(index, count, 'OBJ')
    if cancelled():
      raise InterruptedError('OBJ 输出已取消')
    texture = snapshot['colors'].reshape(height,width,4).copy()
    texture[~labels,3] = 0
    Image.fromarray(texture).save(directory / names[2])
    (directory / names[1]).write_text('newmtl relief\nKd 1 1 1\nmap_Kd texture.png\n', encoding='utf-8')
    (directory / names[3]).write_text(json.dumps({'units':'mm','zAxis':'up',
      'triangles':count*2,'estimatedBytes':estimate,'heightMapping':mapping,
      'sampling':[width,height], 'closedSolid':False,
      'source':{'sessionId':snapshot['sessionId'],'revision':snapshot['revision']}}, ensure_ascii=False), encoding='utf-8')
    return {'files':names,'triangles':count*2,'estimatedBytes':estimate}
  except BaseException:
    for name in names:
      (directory / name).unlink(missing_ok=True)
    raise
