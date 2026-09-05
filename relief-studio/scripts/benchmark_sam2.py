"""SAM 2.1 tiny 原生 Windows CPU 可行性实验；参考掩膜不是人工真值。"""
import hashlib
import json
import threading
import time
from pathlib import Path

import numpy as np
import psutil
import torch
from PIL import Image
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

ROOT = Path(__file__).resolve().parents[1]


def main():
  torch.set_num_threads(4)
  model_path = ROOT/'artifacts/sam2.1_hiera_tiny.pt'
  project = json.loads((ROOT/'samples/sample-project.json').read_text('utf-8'))
  labels = np.array(project['labels']).reshape(project['height'],project['width'])
  with Image.open(ROOT/'samples/cropped-logo.png') as source:
    rgba = np.array(source.convert('RGBA'))
  rgb = rgba[:,:,:3].copy()
  rgb[rgba[:,:,3] == 0] = 255
  peak = [0]
  done = threading.Event()
  def sample_memory():
    process = psutil.Process()
    while not done.wait(0.02):
      peak[0] = max(peak[0], process.memory_info().rss)
  monitor = threading.Thread(target=sample_memory, daemon=True)
  monitor.start()
  try:
    start = time.perf_counter()
    model = build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml',str(model_path),device='cpu',
                      apply_postprocessing=False)
    predictor = SAM2ImagePredictor(model)
    load_seconds = time.perf_counter()-start
    # 从算法参考区域采样提示，协议固定；不冒充人类点击计时。
    positive = np.argwhere(labels == 3)
    negative = np.argwhere((labels == 1) | (labels == 2))
    positive = positive[np.linspace(0,len(positive)-1,24,dtype=int)]
    negative = negative[np.linspace(0,len(negative)-1,24,dtype=int)]
    points = np.concatenate([positive,negative])[:,::-1].astype(np.float32)
    point_labels = np.array([1]*24+[0]*24)
    runs = []
    with torch.inference_mode():
      for _ in range(3):
        start = time.perf_counter()
        predictor.set_image(rgb)
        encoded = time.perf_counter()
        masks,scores,_ = predictor.predict(point_coords=points,point_labels=point_labels,
                                           multimask_output=False)
        ended = time.perf_counter()
        runs.append({'encodeSeconds':round(encoded-start,4),
                     'predictSeconds':round(ended-encoded,4),'totalSeconds':round(ended-start,4)})
    mask = masks[0].astype(bool)
    reference = labels == 3
    union = np.logical_or(mask,reference).sum()
    agreement = float(np.logical_and(mask,reference).sum()/max(1,union))
    Image.fromarray(mask.astype(np.uint8)*255).save(ROOT/'artifacts/sam2-white-mask.png')
    result = {'model':'SAM 2.1 Hiera tiny','sourceCommit':'2b90b9f5ceec907a1c18123530e92e794ad901a4',
      'checkpointSHA256':hashlib.sha256(model_path.read_bytes()).hexdigest(),
      'torch':torch.__version__,'device':'cpu','threads':4,'imagePixels':list(labels.shape[::-1]),
      'modelLoadSeconds':round(load_seconds,4),'trials':runs,'peakRssMB':round(peak[0]/1024**2,2),
      'vramMB':0,'positivePoints':24,'negativePoints':24,'modelScore':float(scores[0]),
      'agreementIoUWithAlgorithmReference':round(agreement,4),'humanGroundTruth':False,
      'humanCorrectionSeconds':None,'laborSavingProven':False,'cloudCalls':0,
      'notes':'单图的可运行性及参考一致度实验，未测人工修正时间，不代表产品分割精度。'}
    (ROOT/'artifacts/sam2-benchmark.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result))
  finally:
    done.set(); monitor.join()


if __name__ == '__main__':
  main()
