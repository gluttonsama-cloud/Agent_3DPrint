"""原图引导的局部精确提取；文字保空，实体填暗面，提示是硬约束。"""
import cv2
import numpy as np

from foreground import ForegroundModel, selection_bounds
from relief import decode_image, validate_project
from surface_evidence import background_effects


def text_mask(rgb, probability, valid, hints):
  if probability.shape != valid.shape or not np.isfinite(probability).all():
    raise ValueError('前景概率无效')
  lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
  fg_samples = lab[((probability > .9) | (hints == 1)) & (hints != 2) & valid]
  bg_samples = lab[((probability < .1) | (hints == 2)) & (hints != 1) & valid]
  if not len(fg_samples) or not len(bg_samples):
    raise ValueError('当前范围缺少明确的主体或背景，请扩大框选或添加提示')
  # 多色前景用少量聚类描述；不按单一亮度把暗金笔画当背景。
  def distance(samples):
    samples = samples[::max(1, len(samples)//10000)].copy()
    cv2.setRNGSeed(19)
    _, _, centers = cv2.kmeans(samples, min(4, len(samples)), None,
      (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 30, .1), 1, cv2.KMEANS_PP_CENTERS)
    return np.min(np.sum((lab[:, :, None]-centers)**2, axis=3), axis=2)
  foreground_distance, background_distance = distance(fg_samples), distance(bg_samples)
  color = background_distance/(foreground_distance+background_distance+1e-6)
  trimap = np.where(color > .5, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
  trimap[(probability > .9) & (color > .8)] = cv2.GC_FGD
  trimap[(probability < .1) & (color < .2)] = cv2.GC_BGD
  effects = background_effects(rgb, probability, valid)
  trimap[effects] = cv2.GC_BGD
  # 用户提示优先于自动概率，且每次重算都保留。
  trimap[hints == 1] = cv2.GC_FGD
  trimap[hints == 2] = cv2.GC_BGD
  trimap[~valid] = cv2.GC_BGD
  if not np.any(trimap == cv2.GC_FGD) or not np.any(trimap == cv2.GC_BGD):
    raise ValueError('请分别标记一处保留笔画和排除背景')
  cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), trimap, None,
    np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 5, cv2.GC_INIT_WITH_MASK)
  result = ((trimap == cv2.GC_FGD) | (trimap == cv2.GC_PR_FGD)) & valid
  result[hints == 1] = True
  result[hints == 2] = False
  result &= valid
  uncertain = (np.abs(color-.5) < .2) | ((probability >= .5) != result)
  uncertain &= valid & (hints == 0)
  return result, uncertain


def solid_mask(mask, valid, hints, rgb=None):
  contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
  result = np.zeros(mask.shape, np.uint8)
  cv2.drawContours(result, contours, -1, 1, cv2.FILLED)
  result = result.astype(bool) & valid
  uncertain = result & ~mask
  if rgb is not None and result.any():
    kernel = np.ones((3, 3), np.uint8)
    core = cv2.erode(result.astype(np.uint8), kernel, iterations=3,
      borderType=cv2.BORDER_CONSTANT, borderValue=0) > 0
    trimap = np.where(result, cv2.GC_PR_FGD, cv2.GC_BGD).astype(np.uint8)
    trimap[core] = cv2.GC_FGD
    trimap[hints == 1] = cv2.GC_FGD
    trimap[hints == 2] = cv2.GC_BGD
    trimap[~valid] = cv2.GC_BGD
    if np.any(trimap == cv2.GC_FGD) and np.any(trimap == cv2.GC_BGD):
      cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), trimap, None,
        np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 5, cv2.GC_INIT_WITH_MASK)
      adjusted = (trimap == cv2.GC_FGD) | (trimap == cv2.GC_PR_FGD)
      uncertain |= adjusted != result
      result = adjusted
  result[hints == 1] = True
  result[hints == 2] = False
  result &= valid
  uncertain &= valid & (hints == 0)
  return result, uncertain


def refine_project(worker, job):
  project = job.get('project')
  validate_project(project)
  mode = job.get('mode')
  if mode not in ('text', 'solid'):
    raise ValueError('未知精确提取模式')
  ids = {r['id'] for r in project['regions']}
  target, background = job.get('target'), job.get('background')
  if type(target) is not int or type(background) is not int or target not in ids or background not in ids or target == background:
    raise ValueError('请选择不同的主体和背景区域')
  width, height = project['width'], project['height']
  if job.get('box') is None:
    raise ValueError('请框选处理范围')
  left, top, right, bottom = selection_bounds(job['box'], width, height)
  labels = np.array(project['labels'], np.uint16).reshape(height, width)
  editable = (labels == target) | (labels == background)
  raw_hints = job.get('hints')
  if not isinstance(raw_hints, list) or len(raw_hints) != width*height or any(type(v) is not int or v not in (0, 1, 2) for v in raw_hints):
    raise ValueError('提示掩膜无效')
  hints = np.array(raw_hints, np.uint8).reshape(height, width)[top:bottom, left:right]
  valid = editable[top:bottom, left:right]
  if not valid.any():
    raise ValueError('框内没有可编辑像素')
  rgba = worker.image(project['image'])
  if mode == 'text':
    if worker.foreground is None:
      from pathlib import Path
      worker.foreground = ForegroundModel(Path(worker.checkpoint).parent/'birefnet-hr')
    if getattr(worker, 'refine_probability_digest', None) != worker.digest:
      rgb = rgba[:, :, :3].copy()
      rgb[rgba[:, :, 3] == 0] = 255
      worker.refine_probability = worker.foreground.predict(rgb)
      worker.refine_probability_digest = worker.digest
    mask, uncertain = text_mask(rgba[top:bottom, left:right, :3],
      worker.refine_probability[top:bottom, left:right], valid, hints)
  else:
    predicted = worker.run({'action': 'predict', 'image': project['image'], 'box': job['box']})
    mask = decode_image(predicted['mask'])[top:bottom, left:right, 3] > 0
    mask, uncertain = solid_mask(mask, valid, hints, rgba[top:bottom, left:right, :3])
  candidate = labels == target
  local = candidate[top:bottom, left:right]
  local[valid] = mask[valid]
  added, removed = candidate & (labels != target), ~candidate & (labels == target)
  uncertain_full = np.zeros_like(candidate)
  uncertain_full[top:bottom, left:right] = uncertain
  count, components, stats, _ = cv2.connectedComponentsWithStats((added | removed).astype(np.uint8), connectivity=8)
  order = sorted(range(1, count), key=lambda i: int(stats[i, cv2.CC_STAT_AREA]), reverse=True)
  changes = [[int(v) for v in stats[i, :4]] for i in order]
  next_labels = labels.copy()
  next_labels[added] = target
  next_labels[removed] = background
  return {'project': {**project, 'labels': next_labels.ravel().tolist()},
    'mask': worker.encode(candidate), 'addedMask': worker.encode(added),
    'removedMask': worker.encode(removed), 'uncertainMask': worker.encode(uncertain_full),
    'added': int(added.sum()), 'removed': int(removed.sum()),
    'uncertain': int(uncertain.sum()), 'changes': changes, 'changeCount': count-1}
