"""运行无框选、无人工提示的完整主体提取，保存实际结果。"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'engine'))
from relief import decode_image
from subject_worker import SubjectWorker

out = ROOT/'artifacts/automatic-optimization'
out.mkdir(exist_ok=True)
project = json.loads((ROOT/'artifacts/foreground-040/sample.relief.json').read_text('utf-8'))
worker = SubjectWorker(str(ROOT/'artifacts/sam2.1_hiera_tiny.pt'))
run = worker.run
def record(job):
  value = run(job)
  if job['action'] == 'predict':
    box = job['box']
    Image.fromarray(decode_image(value['mask'])).crop(tuple(box)).resize((448,728)).save(
      out/f"candidate-{box[0]}-{box[1]}.png")
  return value
worker.run = record
result = worker.run({'action':'propose','image':project['image']})
mask = decode_image(result['mask'])[:, :, 3] > 0
project['labels'] = np.where(mask,2,1).ravel().tolist()
project['name'] = '京瓷微喷 · 自动优化'
(out/'result.relief.json').write_text(json.dumps(project,ensure_ascii=False),'utf-8')
Image.fromarray(mask.astype(np.uint8)*255).save(out/'mask.png')
rgb = decode_image(project['image'])[:, :, :3]
rgb[~mask] = 45
Image.fromarray(rgb).save(out/'preview.png')
report = {k:v for k,v in result.items() if k!='mask'}
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
before_file = out/'before-effects-mask.png'
if before_file.exists():
  before = np.array(Image.open(before_file)) > 0
  original = decode_image(project['image'])[:, :, :3]
  for name,box in [('text',(365,900,918,1023)),('light',(380,515,450,590)),
    ('top',(510,265,790,310)),('drop',(480,750,535,817))]:
    tiles = []
    for caption,selection in [('SOURCE',None),('BEFORE',before),('AFTER',mask)]:
      pixels = original.copy()
      if selection is not None:
        pixels[~selection] = [130,137,123]
      crop = Image.fromarray(pixels).crop(box)
      zoom = 2 if name=='text' else 4
      crop = crop.resize((crop.width*zoom,crop.height*zoom),Image.Resampling.NEAREST)
      tile = Image.new('RGB',(crop.width,crop.height+25),'white')
      tile.paste(crop,(0,25))
      ImageDraw.Draw(tile).text((5,5),caption,fill='black')
      tiles.append(tile)
    sheet = Image.new('RGB',(tiles[0].width,tiles[0].height*3),'white')
    for index,tile in enumerate(tiles):
      sheet.paste(tile,(0,index*tile.height))
    sheet.save(out/f'{name}-effects-comparison.png')
