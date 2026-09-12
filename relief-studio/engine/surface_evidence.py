"""由局部背景估计投影与柔光，不对黑白图案套用浅色材质规则。"""
import cv2
import numpy as np


def background_effects(rgb, probability, valid):
  lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
  light = lab[:, :, 0]
  chroma = np.linalg.norm(lab[:, :, 1:]-128, axis=2)
  foreground = (probability > .9) & valid
  background = (probability < .1) & valid
  empty = np.zeros(valid.shape, bool)
  if foreground.sum() < 20 or background.sum() < 20:
    return empty
  # 仅对明显比背景更亮的有色材质启用，黑字、深色图案保持原有分割。
  colored = foreground & (chroma > 18)
  if colored.sum() < foreground.sum()*.45:
    return empty
  bg_level = float(np.median(light[background]))
  fg_level = float(np.percentile(light[colored], 65))
  if fg_level < bg_level+45:
    return empty
  # 深于背景的投影不作为浅色材质；实体内面由后续实体分支保留。
  shadow = light < min(bg_level-5, fg_level*.4)
  # 独立的高置信深色组件可能是黑字或图案，不能因邻近金色主体而当作投影。
  count, parts = cv2.connectedComponents(foreground.astype(np.uint8), connectivity=8)
  areas = np.bincount(parts.ravel(), minlength=count)
  dark_areas = np.bincount(parts[shadow & foreground], minlength=count)
  protected_ids = np.flatnonzero((dark_areas >= areas*.7) & (areas > 0))
  protected_ids = protected_ids[protected_ids != 0]
  protected = np.isin(parts, protected_ids)
  # 同一亮色组件内部完全封闭的黑色印刷/暗纹也必须保留。投影通常延伸到
  # 组件外轮廓，封闭细节则不会接触填充轮廓的边界。
  for part_id in range(1, count):
    own = parts == part_id
    contours, _ = cv2.findContours(own.astype(np.uint8), cv2.RETR_EXTERNAL,
      cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros(own.shape, np.uint8)
    cv2.drawContours(filled, contours, -1, 1, cv2.FILLED)
    boundary = filled.astype(bool) & ~(
      cv2.erode(filled, np.ones((3, 3), np.uint8), iterations=1,
        borderType=cv2.BORDER_CONSTANT, borderValue=0) > 0)
    dark_count, dark_parts = cv2.connectedComponents(
      (shadow & own).astype(np.uint8), connectivity=8)
    for dark_id in range(1, dark_count):
      detail = dark_parts == dark_id
      if not (detail & boundary).any():
        protected |= detail
  # 在背景样本中重建平滑照明场，识别与周围光晕颜色相同的假连接。
  sigma = max(3., min(16., min(valid.shape)/12))
  weight = cv2.GaussianBlur(background.astype(np.float32),(0,0),sigma)
  field = cv2.GaussianBlur(rgb.astype(np.float32)*background[:, :, None],(0,0),sigma)
  field /= np.maximum(weight[:, :, None],1e-5)
  distance = np.linalg.norm(rgb.astype(np.float32)-field,axis=2)
  glow = (weight > .08) & (distance < 24) & (light < fg_level*.85)
  return (shadow | glow) & valid & ~protected
