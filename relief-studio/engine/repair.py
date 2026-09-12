"""选定区域的保守轮廓修整；零标签和第三方区域均锁定。"""
import cv2
import numpy as np

from relief import integer, validate_project


def repair_project(job):
  project = job.get('project')
  validate_project(project)
  target = job.get('target')
  background = job.get('background')
  ids = {r['id'] for r in project['regions']}
  if type(target) is not int or type(background) is not int or target not in ids or background not in ids or target == background:
    raise ValueError('请选择不同的修整区域与相邻底层区域')
  levels = {r['id']: r['layers'] for r in project['regions']}
  if levels[background] > levels[target]:
    raise ValueError('修整背景不能高于目标区域，避免将背景误变为凸起')
  radius = integer(job.get('radius', 1), 1, 3, '修整半径')
  specks = integer(job.get('specks', 0), 0, 25, '碎点面积')
  symmetry = job.get('symmetry', False)
  if type(symmetry) is not bool:
    raise ValueError('对称选项无效')
  labels = np.array(project['labels'], dtype=np.uint16).reshape(project['height'], project['width'])
  original = labels == target
  if not original.any():
    raise ValueError('当前区域没有像素')
  # 保留原有封闭孔洞；不把字母 O、中文口等默认填实。
  _, inverse = cv2.connectedComponents((~original).astype(np.uint8), connectivity=4)
  outside = np.unique(np.concatenate([inverse[0], inverse[-1], inverse[:, 0], inverse[:, -1]]))
  holes = (~original) & ~np.isin(inverse, outside)
  kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius*2+1, radius*2+1))
  mask = original.astype(np.uint8)
  closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, borderType=cv2.BORDER_REPLICATE)
  opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel, borderType=cv2.BORDER_REPLICATE) > 0
  # 不让开运算整段删去细字：默认只移除靠近保留主体的小毛刺。
  near = cv2.dilate(opened.astype(np.uint8), kernel) > 0
  result = opened | (original & ~near)
  result[holes] = False
  editable = (labels == target) | (labels == background)
  result &= editable
  # 若去毛刺会切断某个原有笔画，恢复该连通部分；完整小点默认保留。
  original_count, original_parts = cv2.connectedComponents(mask, connectivity=8)
  result_count, result_parts = cv2.connectedComponents(result.astype(np.uint8), connectivity=8)
  overlap = original & result
  pairs = np.unique(original_parts[overlap].astype(np.int64)*result_count + result_parts[overlap])
  surviving = np.bincount(pairs//result_count, minlength=original_count)
  restore = np.flatnonzero(surviving != 1)
  restore = restore[restore != 0]
  result[np.isin(original_parts, restore)] = True
  symmetry_applied = False
  symmetry_score = None
  if symmetry:
    ys, xs = np.where(original)
    left, right = int(xs.min()), int(xs.max())+1
    section = result[:, left:right]
    mirror = section[:, ::-1]
    symmetry_score = float((section & mirror).sum()/max(1, (section | mirror).sum()))
    if symmetry_score >= .9:
      # 只补轮廓附近的少量差异；不重绘明显不对称部分。
      nearby = cv2.dilate(result.astype(np.uint8), kernel)[:, left:right] > 0
      result[:, left:right] = section | (mirror & nearby)
      symmetry_applied = True
  if specks:
    _, components, stats, _ = cv2.connectedComponentsWithStats(result.astype(np.uint8), connectivity=8)
    small = np.flatnonzero(stats[:, cv2.CC_STAT_AREA] <= specks)
    small = small[small != 0]
    result[np.isin(components, small)] = False
  result[holes] = False
  next_labels = labels.copy()
  next_labels[editable & result] = target
  next_labels[editable & ~result] = background
  added = int(((next_labels == target) & ~original).sum())
  removed = int(((next_labels != target) & original).sum())
  return {'project': {**project, 'labels': next_labels.ravel().tolist()},
          'added': added, 'removed': removed, 'symmetryApplied': symmetry_applied,
          'symmetryScore': symmetry_score}
