"""本地 SAM 常驻进程；stdin/stdout JSONL，仅加载可信随包模型。"""
import argparse
import contextlib
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
from relief import decode_image, encode_image
from foreground import ForegroundModel, foreground_mask, clicked_mask


class SubjectWorker:
  def __init__(self, checkpoint):
    import torch
    if not torch.cuda.is_available():
      raise RuntimeError('未检测到可用 CUDA GPU。自动分色仍可使用。')
    self.torch = torch
    self.checkpoint = checkpoint
    self.foreground = None
    self.predictor = None
    self.predictor_digest = None
    self.digest = None
    self.rgba = None

  def image(self, data):
    digest = hashlib.sha256(data.encode()).hexdigest()
    if digest != self.digest:
      self.rgba = decode_image(data)
      rgb = self.rgba[:, :, :3].copy()
      rgb[self.rgba[:, :, 3] == 0] = 255
      self.digest = digest
    return self.rgba

  def run(self, job):
    started = time.perf_counter()
    with self.torch.inference_mode():
      rgba = self.image(job['image'])
      visible = rgba[:, :, 3] > 0
      valid = job.get('validMask')
      if valid is not None:
        if len(valid) != visible.size or any(type(v) is not int or v not in (0, 1) for v in valid):
          raise ValueError('有效范围无效')
        visible &= np.array(valid, dtype=bool).reshape(visible.shape)
      if job['action'] == 'propose':
        if self.foreground is None:
          directory = Path(self.checkpoint).parent/'birefnet-hr'
          if not (directory/'model.safetensors').is_file():
            raise RuntimeError('缺少高精度主体模型，请更新 model-runtime 模型包')
          self.foreground = ForegroundModel(directory)
        rgb = rgba[:, :, :3].copy()
        rgb[~visible] = 255
        probability = self.foreground.predict(rgb)
        result = {'mask': self.encode(foreground_mask(probability, visible)),
                  'model': 'BiRefNet_HR'}
      elif job['action'] == 'predict':
        points = job.get('points', [])
        if not 1 <= len(points) <= 256:
          raise ValueError('需要 1 至 256 个提示点')
        for point in points:
          if (point.get('label') not in (0, 1) or not all(type(point.get(k)) in (int, float)
              and np.isfinite(point[k]) for k in ('x', 'y')) or
              not 0 <= point['x'] < rgba.shape[1] or not 0 <= point['y'] < rgba.shape[0]):
            raise ValueError('提示点超出图片范围')
        if self.predictor is None:
          from sam2.build_sam import build_sam2
          from sam2.sam2_image_predictor import SAM2ImagePredictor
          model = build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml', self.checkpoint,
                            device='cuda', apply_postprocessing=False)
          self.predictor = SAM2ImagePredictor(model)
        with self.torch.autocast('cuda', dtype=self.torch.bfloat16):
          if self.predictor_digest != self.digest:
            rgb = rgba[:, :, :3].copy()
            rgb[rgba[:, :, 3] == 0] = 255
            self.predictor.set_image(rgb)
            self.predictor_digest = self.digest
          masks, scores, _ = self.predictor.predict(
            point_coords=np.array([[p['x'], p['y']] for p in points], dtype=np.float32),
            point_labels=np.array([p['label'] for p in points]), multimask_output=True)
        if len(points) == 1 and points[0]['label'] == 1:
          mask = clicked_mask(masks > 0, scores, int(points[0]['x']), int(points[0]['y']))
        else:
          mask = masks[int(np.argmax(scores))] > 0
        result = {'mask': self.encode(mask & visible)}
      else:
        raise ValueError('未知主体操作')
      self.torch.cuda.synchronize()
      return {**result, 'elapsedSeconds': time.perf_counter()-started,
              'peakVramMB': self.torch.cuda.max_memory_allocated()/1024**2}

  @staticmethod
  def encode(mask):
    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = 255
    rgba[:, :, 3] = mask.astype(np.uint8)*255
    return encode_image(rgba)


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--checkpoint', required=True)
  args = parser.parse_args()
  worker = None
  for line in sys.stdin:
    job = {}
    try:
      if len(line) > 64_000_000:
        raise ValueError('任务过大')
      job = json.loads(line)
      with contextlib.redirect_stdout(sys.stderr):
        if worker is None:
          worker = SubjectWorker(args.checkpoint)
        result = worker.run(job)
      response = {'id': job.get('id'), 'ok': True, **result}
    except Exception as error:
      response = {'id': job.get('id'), 'ok': False, 'error': str(error)}
    print(json.dumps(response), flush=True)


if __name__ == '__main__':
  main()
