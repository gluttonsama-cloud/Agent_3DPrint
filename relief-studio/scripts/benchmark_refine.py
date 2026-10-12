"""人工确定区域对照；未标注边缘不计为正确或错误。"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'engine'))
from relief import decode_image
from subject_worker import SubjectWorker


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--out', type=Path, required=True)
  parser.add_argument('--project', type=Path, default=ROOT/'artifacts/foreground-040/sample.relief.json')
  parser.add_argument('--checkpoint', type=Path, default=ROOT/'model-runtime/sam2.1_hiera_tiny.pt')
  args = parser.parse_args()
  args.out.mkdir(parents=True, exist_ok=False)
  reference = json.loads((ROOT/'samples/refine-reference.json').read_text('utf-8'))
  project = json.loads(args.project.read_text('utf-8'))
  source = decode_image(project['image'])
  if list(source.shape[1::-1]) != reference['size']:
    raise ValueError('源图尺寸与局部标注不一致')
  if hashlib.sha256(source.tobytes()).hexdigest() != reference['sourceRgbaSha256']:
    raise ValueError('源图内容与局部标注不一致')
  with args.checkpoint.open('rb') as checkpoint_file:
    checkpoint_hash = hashlib.file_digest(checkpoint_file, 'sha256').hexdigest()
  worker = SubjectWorker(str(args.checkpoint))
  (args.out/'provenance.json').write_text(json.dumps({
    'project': str(args.project.resolve()),
    'projectSha256': hashlib.sha256(args.project.read_bytes()).hexdigest(),
    'referenceSha256': hashlib.sha256((ROOT/'samples/refine-reference.json').read_bytes()).hexdigest(),
    'sourceRgbaSha256': hashlib.sha256(source.tobytes()).hexdigest(),
    'checkpoint': str(args.checkpoint.resolve()), 'checkpointSha256': checkpoint_hash,
    'scope': 'existing partial interior annotations; not full contour ground truth',
  }, indent=2), 'utf-8')
  rows = []
  for case in reference['cases']:
    annotation = Image.new('L', tuple(reference['size']), 128)
    draw = ImageDraw.Draw(annotation)
    for kind, value in [('foreground', 255), ('background', 0)]:
      for left, top, right, bottom in case.get(kind+'Boxes', []):
        draw.rectangle((left, top, right-1, bottom-1), fill=value)
      for polygon in case.get(kind+'Polygons', []):
        draw.polygon([tuple(p) for p in polygon], fill=value)
    annotation.save(args.out/(case['name']+'-reference.png'))
    result = worker.run({'action':'refine', 'project':project, 'box':case['box'],
      'target':2, 'background':1, 'mode':case['mode'], 'hints':[0]*(project['width']*project['height'])})
    mask = decode_image(result['mask'])[:, :, 3] > 0
    ref = np.array(annotation)
    missed = (ref == 255) & ~mask
    extra = (ref == 0) & mask
    row = {'name':case['name'], 'missed':int(missed.sum()), 'extra':int(extra.sum()),
      'foregroundReferencePixels':int((ref==255).sum()), 'backgroundReferencePixels':int((ref==0).sum()),
      'added':result['added'], 'removed':result['removed'], 'uncertain':result['uncertain'],
      'seconds':result['elapsedSeconds'], 'fullContourGroundTruth':False}
    rows.append(row)
    print(json.dumps(row), flush=True)
    for key in ['mask','addedMask','removedMask','uncertainMask']:
      Image.fromarray(decode_image(result[key])).save(args.out/(case['name']+'-'+key+'.png'))
    rgb = source.copy()
    rgb[~mask,:3] = (rgb[~mask,:3]*.12+120*.88).astype(np.uint8)
    rgb[missed,:3] = [0,120,255]
    rgb[extra,:3] = [255,0,0]
    Image.fromarray(rgb).crop(tuple(case['box'])).resize(
      ((case['box'][2]-case['box'][0])*2,(case['box'][3]-case['box'][1])*2)).save(args.out/(case['name']+'-preview.png'))
    (args.out/(case['name']+'.relief.json')).write_text(json.dumps(result['project']), 'utf-8')
  (args.out/'report.json').write_text(json.dumps(rows,indent=2), 'utf-8')


if __name__ == '__main__':
  main()
