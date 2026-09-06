"""真实 GPU 初选与局部提示计时；输出算法掩膜，不冒充人工真值。"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'engine'))
from relief import encode_image, decode_image, export_project
from subject_worker import SubjectWorker

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]
rgba = np.array(Image.open(args.source).convert('RGBA'))
source = encode_image(rgba)
start = time.perf_counter()
worker = SubjectWorker(str(root/'artifacts/sam2.1_hiera_tiny.pt'))
load = time.perf_counter()-start
result = worker.run({'action':'propose','image':source})
mask = np.zeros(rgba.shape[:2], dtype=bool)
for item in result['candidates']:
  decoded = decode_image(item['mask'])[:, :, 3] > 0
  if item['suggested']:
    mask |= decoded
  Image.fromarray(decoded.astype(np.uint8)*255).save(out/f"candidate-{item['id']}.png")
Image.fromarray(mask.astype(np.uint8)*255).save(out/'automatic-mask.png')
preview = rgba.copy()
preview[~mask,:3] = (preview[~mask,:3]*.1+np.array([130,137,123])*.9).astype(np.uint8)
Image.fromarray(preview).save(out/'automatic-preview.png')
# 固定局部点仅用于当前测试图片计时，不参与产品初选或通用算法。
points = [{'x':int(rgba.shape[1]*.49),'y':int(rgba.shape[0]*.51),'label':1}]
runs=[]
for _ in range(3):
  predicted=worker.run({'action':'predict','image':source,'points':points})
  runs.append(predicted['elapsedSeconds'])
Image.fromarray(decode_image(predicted['mask'])[:,:,3]).save(out/'point-mask.png')
report={'model':'SAM 2.1 Hiera tiny','device':str(worker.torch.cuda.get_device_name()),
        'torch':worker.torch.__version__,'coldLoadSeconds':load,'automaticSeconds':result['elapsedSeconds'],
        'candidates':len(result['candidates']),'selected':sum(c['suggested'] for c in result['candidates']),
        'warmPointSeconds':runs,'peakVramMB':result['peakVramMB'],
        'humanGroundTruth':False,'humanCorrectionSeconds':None,'iou':None}
(out/'benchmark.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
(out/'candidates.json').write_text(json.dumps(result),'utf-8')
project={'version':1,'name':'复杂效果图·自动初选','image':source,'width':rgba.shape[1],'height':rgba.shape[0],
 'sizeMm':[55,55],'labels':np.where(rgba[:,:,3]>0,np.where(mask,2,1),0).ravel().tolist(),
 'regions':[{'id':1,'name':'平面背景','color':'#82897b','layers':0},{'id':2,'name':'浮雕主体','color':'#d9b477','layers':10}]}
export_project(project,out/'export')
print(json.dumps(report,ensure_ascii=True))
