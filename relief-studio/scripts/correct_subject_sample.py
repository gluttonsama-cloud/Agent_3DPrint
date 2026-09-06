"""固定局部提示复现附件修正，非通用算法、非人工真值、非人工计时。"""
import argparse
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'engine'))
from relief import decode_image, encode_image, export_project
from subject_worker import SubjectWorker

parser=argparse.ArgumentParser()
parser.add_argument('--source',required=True)
parser.add_argument('--out',required=True)
args=parser.parse_args()
out=Path(args.out);out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1]
rgba=np.array(Image.open(args.source).convert('RGBA'));image=encode_image(rgba)
worker=SubjectWorker(str(root/'artifacts/sam2.1_hiera_tiny.pt'))
# 从附件视觉选定的不同实体内部点，坐标只存于本样例复现脚本。
points=[(627,653),(636,806),(540,573),(735,650),(838,452),(430,485),
 (430,915),(425,950),(390,995),(467,990),(551,916),(571,970),(605,1005),
 (662,934),(703,925),(707,981),(747,962),(853,918),(852,965),(869,993),
 (387,1060),(443,1050),(482,1050),(531,1050),(578,1066),(617,1060),(673,1061),
 (729,1065),(757,1068),(800,1068),(832,1095),(865,1062),(899,1068),
 (876,663),(506,791),(386,627),(640,748),(921,466),(793,745)]
mask=np.zeros(rgba.shape[:2],dtype=bool);runs=[]
for index,(x,y) in enumerate(points):
  result=worker.run({'action':'predict','image':image,'points':[{'x':x,'y':y,'label':1}]})
  part=decode_image(result['mask'])[:,:,3]>0
  Image.fromarray(part.astype(np.uint8)*255).save(out/f'part-{index+1}.png')
  mask|=part;runs.append(result['elapsedSeconds'])
preview=rgba.copy();preview[~mask,:3]=(preview[~mask,:3]*.1+np.array([130,137,123])*.9).astype(np.uint8)
Image.fromarray(preview).save(out/'corrected-preview.png')
Image.fromarray(mask.astype(np.uint8)*255).save(out/'corrected-mask.png')
project={'version':1,'name':'复杂图·局部提示修正','width':rgba.shape[1],'height':rgba.shape[0],
 'sizeMm':[55,55],'image':image,'labels':np.where(mask,2,1).ravel().tolist(),
 'regions':[{'id':1,'name':'平面背景','color':'#82897b','layers':0},{'id':2,'name':'浮雕主体','color':'#d9b477','layers':10}]}
export_project(project,out/'export')
(out/'protocol.json').write_text(json.dumps({'source':'agent-selected-point-prompts','points':points,
 'runs':runs,'humanGroundTruth':False,'humanCorrectionSeconds':None,'iou':None},indent=2),'utf-8')
print('Saved',out)
