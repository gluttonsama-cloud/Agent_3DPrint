"""从自动初选生成可复核交付；提示后的结果与无提示结果分开保存。"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'engine'))
from relief import decode_image, export_project
from subject_worker import SubjectWorker


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--out', type=Path, required=True)
  args = parser.parse_args()
  args.out.mkdir(parents=True, exist_ok=False)
  project = json.loads((ROOT/'artifacts/foreground-040/sample.relief.json').read_text('utf-8'))
  initial_image = Image.open(ROOT/'artifacts/foreground-040/automatic-mask.png')
  initial = np.array(initial_image.getchannel('A') if 'A' in initial_image.getbands()
    else initial_image.convert('L'))
  # 支持二值灰度与透明通道掩膜；保留原工程的不打印范围。
  old = np.array(project['labels']).reshape(project['height'], project['width'])
  labels = np.where(initial > 0, 2, 1).astype(np.uint16)
  labels[old == 0] = 0
  project['labels'] = labels.ravel().tolist()
  (args.out/'before.relief.json').write_text(json.dumps(project), 'utf-8')
  source = decode_image(project['image'])
  reference = json.loads((ROOT/'samples/refine-reference.json').read_text('utf-8'))
  worker = SubjectWorker(str(ROOT/'artifacts/sam2.1_hiera_tiny.pt'))
  report = []
  for case in reference['cases']:
    before = np.array(project['labels']).reshape(labels.shape) == 2
    request = {'action':'refine', 'project':project, 'box':case['box'],
      'target':2, 'background':1, 'mode':case['mode'], 'hints':[0]*labels.size}
    result = worker.run(request)
    automatic = result
    if case['name'] == 'drop':
      # 原图独立参考的尖端像素，不因自动结果漏选而删除标注。
      request['hints'][759*project['width']+505] = 1
      result = worker.run(request)
    after = decode_image(result['mask'])[:, :, 3] > 0
    auto = decode_image(automatic['mask'])[:, :, 3] > 0
    annotation = Image.new('L', (project['width'], project['height']), 128)
    draw = ImageDraw.Draw(annotation)
    for kind, value in [('foreground',255),('background',0)]:
      for l,t,r,b in case.get(kind+'Boxes',[]):
        draw.rectangle((l,t,r-1,b-1),fill=value)
      for polygon in case.get(kind+'Polygons',[]):
        draw.polygon([tuple(p) for p in polygon],fill=value)
    truth = np.array(annotation)
    metrics = lambda mask: {'missed':int(((truth==255)&~mask).sum()),
      'extra':int(((truth==0)&mask).sum())}
    row = {'name':case['name'],'before':metrics(before),'automatic':metrics(auto),
      'reviewed':metrics(after),'hintPixels':int(case['name']=='drop'),
      'added':result['added'],'removed':result['removed'],'uncertain':result['uncertain'],
      'fullContourGroundTruth':False}
    report.append(row)
    print(json.dumps(row),flush=True)
    for name, value in [('automatic',automatic),('reviewed',result)]:
      Image.fromarray(decode_image(value['mask'])).save(args.out/f"{case['name']}-{name}.png")
    Image.fromarray(decode_image(result['uncertainMask'])).save(args.out/f"{case['name']}-uncertain.png")
    panels = []
    for title, mask in [('BEFORE',before),('AFTER',after),('DIFF: + GREEN / - RED',after)]:
      rgb = source[:, :, :3].copy()
      rgb[~mask] = 45
      if title.startswith('DIFF'):
        rgb = (source[:, :, :3]*.28).astype(np.uint8)
        rgb[after & ~before] = [0,230,145]
        rgb[before & ~after] = [255,55,80]
      tile = Image.fromarray(rgb).crop(tuple(case['box']))
      zoom = 6 if case['name']=='drop' else 2
      tile = tile.resize((tile.width*zoom,tile.height*zoom),Image.Resampling.NEAREST)
      panel = Image.new('RGB',(tile.width,tile.height+30),(245,245,240))
      panel.paste(tile,(0,30))
      ImageDraw.Draw(panel).text((8,8),title,fill='black')
      panels.append(panel)
    sheet = Image.new('RGB',(panels[0].width,max(p.height for p in panels)*3))
    for i,panel in enumerate(panels):
      sheet.paste(panel,(0,i*panel.height))
    sheet.save(args.out/f"{case['name']}-comparison.png")
    project = result['project']
  (args.out/'reviewed.relief.json').write_text(json.dumps(project),'utf-8')
  export_project(project,args.out/'export')
  height = np.array(Image.open(args.out/'export/height.png'))
  summed = np.zeros_like(height,dtype=np.uint32)
  previous = np.ones_like(height,dtype=bool)
  for file in sorted((args.out/'export/layers').glob('*.png')):
    layer = np.array(Image.open(file)) > 0
    assert not (layer & ~previous).any(), '累计层不包含于下层'
    summed += layer
    previous = layer
  np.testing.assert_array_equal(summed,height)
  reopened = json.loads((args.out/'export/project.json').read_text('utf-8'))
  assert reopened == project
  (args.out/'report.json').write_text(json.dumps({'cases':report,
    'exportLayersMatchHeight':True,'exportProjectMatches':True,
    'pending':'未标注的轮廓边缘不属于完整真值；黄色不确定掩膜仍需复核。'},
    ensure_ascii=False,indent=2),'utf-8')


if __name__ == '__main__':
  main()
