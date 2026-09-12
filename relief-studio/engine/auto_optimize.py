"""主体初选后自动局部精修；行内文字保孔，孤立小实体补暗面。"""
import cv2
import numpy as np

from refine import solid_mask, text_mask
from relief import decode_image


def optimize_subject(worker, rgba, visible, probability):
  initial = (probability >= .5) & visible
  result = initial.copy()
  count, components, stats, _ = cv2.connectedComponentsWithStats(
    initial.astype(np.uint8), connectivity=8)
  height, width = visible.shape
  objects = []
  for i in range(1, count):
    x, y, w, h, area = map(int, stats[i])
    # 小点保留原状，不删除标点；只精修有足够颜色样本的局部。
    if area >= 16 and w >= 3 and h >= 8:
      objects.append((i, x, y, w, h, area))
  # 密集纹理只处理最大的 128 个候选，其余保留初选，避免平方级扫描失控。
  objects = sorted(objects, key=lambda item:item[5], reverse=True)[:128]
  uncertain = np.zeros_like(initial)
  solid_calls = 0
  decisions = []
  for i, x, y, w, h, area in objects:
    margin = max(6, min(32, round(max(w, h)*.4)))
    left, top = max(0, x-margin), max(0, y-margin)
    right, bottom = min(width, x+w+margin), min(height, y+h+margin)
    region = np.s_[top:bottom, left:right]
    valid = visible[region]
    hints = np.zeros(valid.shape, np.uint8)
    local = result[region].copy()
    # 邻近且基线/高度相近的组件按文字处理，不对 C、O、标点自动填实。
    row_neighbor = any(j != i and .45 <= hh/max(h, 1) <= 2.2 and
      abs(yy+hh-y-h) < max(h, hh)*.35 and
      max(0, max(x, xx)-min(x+w, xx+ww)) < max(h, hh)*1.8
      for j, xx, yy, ww, hh, _ in objects)
    try:
      patch, pending = text_mask(rgba[region][:, :, :3], probability[region], valid, hints)
    except ValueError:
      patch, pending = local, np.zeros_like(local)
    # 仅对孤立的小型竖向对象尝试完整轮廓；大 LOGO 与文字不走填洞。
    solid_candidate = (not row_neighbor and 1.1 < h/max(w, 1) < 5 and
      max(w, h) < min(width, height)*.15 and area < w*h*.65 and solid_calls < 24)
    if solid_candidate:
      own_mask = (components[region] == i).astype(np.uint8)
      contours, hierarchy = cv2.findContours(own_mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
      # 已有封闭孔洞的对象保留孔洞，不把单独的 O 或镂空装饰当实体。
      if hierarchy is not None and any(hierarchy[0,k,3] >= 0 and cv2.contourArea(c) >= 4
        for k,c in enumerate(contours)):
        solid_candidate = False
    if solid_candidate:
      ys, xs = np.where(components[region] == i)
      seed = len(xs)//2
      try:
        prediction = worker.run({'action':'predict', 'image':worker.source_data,
          'box':[left, top, right, bottom],
          'points':[{'x':int(xs[seed])+left,'y':int(ys[seed])+top,'label':1}]})
      except ValueError as error:
        decisions.append({'box':[left,top,right,bottom],'skipped':str(error)})
        solid_calls += 1
        continue
      sam = decode_image(prediction['mask'])[region][:, :, 3] > 0
      own = components[region] == i
      # 框预测可能同时返回旁边的装饰，只保留覆盖当前亮边的连通实体。
      sam_count, sam_parts = cv2.connectedComponents(sam.astype(np.uint8), connectivity=8)
      overlaps = np.bincount(sam_parts[own], minlength=sam_count)
      overlaps[0] = 0
      sam = sam_parts == int(overlaps.argmax()) if overlaps.any() else np.zeros_like(sam)
      # 不接受跳到旁边大对象或触及框边的预测。
      overlap = int((sam & own).sum())/max(1, int(own.sum()))
      decisions.append({'box':[left,top,right,bottom],'overlap':overlap,
        'edge':bool(sam[0].any() or sam[-1].any() or sam[:,0].any() or sam[:,-1].any()),
        'area':int(sam.sum())})
      if overlap > .65:
        filled, fill_pending = solid_mask(sam, valid, hints, rgba[region][:, :, :3])
        other = initial[region] & ~own & (stats[components[region], cv2.CC_STAT_AREA] >= max(16, area*.25))
        touches = filled[0].any() or filled[-1].any() or filled[:,0].any() or filled[:,-1].any()
        interior = rgba[region][:, :, :3][filled & ~initial[region]]
        shaded = len(interior) > 3 and float(interior.mean(axis=1).std()) > 8
        # 少量投影触边不应否决整个暗面；只拒绝占满框的底板候选。
        if shaded and (not touches or filled.sum() < filled.size*.45) and (filled & other).sum() <= max(2, other.sum()*.02):
          patch = filled | (patch & ~sam)
          pending |= fill_pending
      solid_calls += 1
    # 框边和其他主体由各自的局部负责，避免重叠框互相擦除。
    editable = (components[region] == 0) | (components[region] == i)
    result[region][editable] = patch[editable]
    uncertain[region] |= pending & editable
  result &= visible
  return result, {'added':int((result & ~initial).sum()),
    'removed':int((initial & ~result).sum()), 'uncertain':int(uncertain.sum()),
    'objects':len(objects), 'solidCandidates':solid_calls, 'decisions':decisions}
