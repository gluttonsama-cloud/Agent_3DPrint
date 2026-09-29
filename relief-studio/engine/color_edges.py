"""用局部可靠颜色约束过渡像素，不删除小组件或修改主体范围。"""
import cv2
import numpy as np


def refine_color_edges(rgb, labels, palette):
  if len(palette) < 2:
    return labels
  visible = labels > 0
  kernel = np.ones((3, 3), np.uint8)
  centers = cv2.cvtColor((palette.astype(np.float32)/255).reshape(1, -1, 3),
                        cv2.COLOR_RGB2LAB)[0]
  separation = np.linalg.norm(centers[:, None]-centers, axis=2)
  np.fill_diagonal(separation, np.inf)
  # 近似色容易把过渡像素当作另一色区；高对比图案保留原有稳定规则。
  similar_colors = bool(separation.min() < 30)
  spread = cv2.dilate(rgb, kernel).astype(np.int16)-cv2.erode(rgb, kernel)
  flat = spread.max(axis=2) <= 12
  pixels = rgb.astype(np.float32)
  seeds = []
  protected = np.zeros(labels.shape, dtype=bool)
  for index, color in enumerate(palette, 1):
    own = labels == index
    # 真实细线、单像素标点只要颜色明确也可作种子，无最小面积限制。
    close = np.max(np.abs(pixels-color), axis=2) <= (6 if similar_colors else 32)
    core = cv2.erode(own.astype(np.uint8), kernel,
                     borderType=cv2.BORDER_CONSTANT, borderValue=0) > 0
    seed = own & (close | (core if similar_colors else flat & core))
    seeds.append(seed)
    protected |= seed
  uncertain = visible & ~protected
  if not uncertain.any():
    return labels
  best = np.full(labels.shape, np.inf, dtype=np.float32)
  candidate = labels.copy()
  lab = cv2.cvtColor(pixels/255, cv2.COLOR_RGB2LAB)
  for index, seed in enumerate(seeds, 1):
    if not seed.any():
      continue
    if similar_colors:
      spatial, nearest = cv2.distanceTransformWithLabels(
        (~seed).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
      colors = np.zeros((int(nearest.max())+1, 3), dtype=np.float32)
      colors[nearest[seed]] = lab[seed]
      # 渐变区域使用近邻种子的真实颜色，并优先保持局部连续性。
      nearby = spatial <= 3
      distance = np.sum((lab-colors[nearest])**2, axis=2) + 30*spatial**2
    else:
      nearby = cv2.dilate(seed.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
      distance = np.sum((lab-centers[index-1])**2, axis=2)
    choose = uncertain & nearby & (distance < best)
    candidate[choose] = index
    best[choose] = distance[choose]
  return candidate
