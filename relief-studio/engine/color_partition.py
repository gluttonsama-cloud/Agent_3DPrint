"""全图加权 Lab 分色，颜色标签不携带高度。"""
import cv2
import numpy as np


def alpha_edge_colors(rgba, visible):
  """仅为分色修正近邻透明边缘的 RGB；不改原图或孤立的半透明细节。"""
  rgb = rgba[:, :, :3].copy()
  solid = visible & (rgba[:, :, 3] == 255)
  partial = visible & (rgba[:, :, 3] < 255)
  if not solid.any() or not partial.any():
    return rgb
  distance, nearest = cv2.distanceTransformWithLabels(
    (~solid).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
  _, components = cv2.connectedComponents(visible.astype(np.uint8), connectivity=4)
  colors = np.zeros((nearest.max()+1, 3), dtype=np.uint8)
  owners = np.zeros(nearest.max()+1, dtype=np.int32)
  colors[nearest[solid]] = rgb[solid]
  owners[nearest[solid]] = components[solid]
  edge = partial & (distance <= 3) & (owners[nearest] == components)
  rgb[edge] = colors[nearest[edge]]
  return rgb


def partition(rgb, count, tolerance, interior=None):
  bins = (rgb[:, 0].astype(np.int32)//8)*1024 + (rgb[:, 1].astype(np.int32)//8)*32 + rgb[:, 2]//8
  weights = np.bincount(bins, minlength=32768)
  occupied = weights > 0
  samples = np.stack([np.bincount(bins, weights=rgb[:, c], minlength=32768)[occupied]
                      / weights[occupied] for c in range(3)], axis=1).astype(np.float32)
  weights = weights[occupied].astype(np.float64)
  lab = cv2.cvtColor((samples/255).reshape(1, -1, 3), cv2.COLOR_RGB2LAB)[0]
  k = min(count or 12, len(lab))
  centers = [lab[weights.argmax()]]
  while len(centers) < k:
    distance = ((lab[:, None]-np.array(centers))**2).sum(2).min(1)
    centers.append(lab[(distance*weights).argmax()])
  centers = np.array(centers)
  for _ in range(40):
    groups = ((lab[:, None]-centers)**2).sum(2).argmin(1)
    updated = centers.copy()
    for i in range(k):
      members = groups == i
      if members.any():
        updated[i] = np.average(lab[members], axis=0, weights=weights[members])
    if np.max(np.abs(updated-centers)) < 0.05:
      centers = updated
      break
    centers = updated
  if count is None:
    # 只合并感知接近的颜色；不按面积删除少量文字。
    while len(centers) > 1:
      distances = np.linalg.norm(centers[:, None]-centers, axis=2)
      np.fill_diagonal(distances, np.inf)
      a, b = np.unravel_index(distances.argmin(), distances.shape)
      if distances[a, b] > tolerance:
        break
      groups = ((lab[:, None]-centers)**2).sum(2).argmin(1)
      members = (groups == a) | (groups == b)
      centers[a] = np.average(lab[members], axis=0, weights=weights[members])
      centers = np.delete(centers, b, axis=0)
    if interior is not None:
      # 抗锯齿边缘的混合色不应单独成区；有平坦内部支撑的真实颜色始终保留。
      core = np.bincount(bins[interior], minlength=32768)[occupied]
      groups = ((lab[:, None]-centers)**2).sum(2).argmin(1)
      mass = np.array([weights[groups == i].sum() for i in range(len(centers))])
      keep = np.ones(len(centers), dtype=bool)
      for i in np.argsort(mass):
        if core[groups == i].sum() > mass[i]*0.1:
          continue
        anchors = [j for j in range(len(centers)) if mass[j] > mass[i]*1.2 and keep[j]]
        for a in anchors:
          for b in anchors:
            if a >= b:
              continue
            vector = centers[b]-centers[a]
            ratio = np.dot(centers[i]-centers[a], vector)/max(np.dot(vector, vector), 1e-6)
            residual = np.linalg.norm(centers[i]-(centers[a]+ratio*vector))
            if 0.06 < ratio < 0.94 and residual < tolerance:
              keep[i] = False
      centers = centers[keep]
  centers = centers[np.argsort(centers[:, 0])]
  labels = np.empty(len(rgb), dtype=np.uint16)
  for start in range(0, len(rgb), 65536):
    pixels = cv2.cvtColor((rgb[start:start+65536].astype(np.float32)/255).reshape(1,-1,3),
                          cv2.COLOR_RGB2LAB)[0]
    labels[start:start+len(pixels)] = ((pixels[:, None]-centers)**2).sum(2).argmin(1)+1
  palette = cv2.cvtColor(centers.reshape(1,-1,3), cv2.COLOR_LAB2RGB)[0]
  return labels, np.clip(np.rint(palette*255), 0, 255).astype(np.uint8)
