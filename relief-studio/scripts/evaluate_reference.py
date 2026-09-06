"""对人工确认的主体/争议区掩膜评估；没有确认信息时拒绝生成验收分数。"""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--prediction',required=True)
parser.add_argument('--reference',required=True,help='包含 humanConfirmed、reviewer、mask、uncertain 的 JSON')
args=parser.parse_args()
reference_path=Path(args.reference)
reference=json.loads(reference_path.read_text('utf-8'))
if reference.get('humanConfirmed') is not True or not reference.get('reviewer'):
  raise SystemExit('参考标注尚未由人工确认；不生成验收分数')
def read(name):
  return np.array(Image.open(reference_path.parent/name).convert('L'))>0
truth=read(reference['mask'])
uncertain=read(reference['uncertain'])
prediction=np.array(Image.open(args.prediction).convert('L'))>0
if truth.shape!=prediction.shape or uncertain.shape!=truth.shape:
  raise SystemExit('掩膜尺寸不一致')
valid=~uncertain
intersection=np.count_nonzero(prediction&truth&valid)
union=np.count_nonzero((prediction|truth)&valid)
print(json.dumps({'iou':intersection/union if union else 1.0,'uncertainPixels':int(uncertain.sum()),
                  'reviewer':reference['reviewer']}))
