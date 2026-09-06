"""前景整体预测与点击局部掩膜；不按面积删字、不填孔洞。"""
import cv2
import numpy as np


def foreground_mask(probability, visible):
  if probability.shape != visible.shape or not np.isfinite(probability).all():
    raise ValueError('前景预测尺寸或数值无效')
  return (probability >= .5) & visible


def clicked_mask(masks, scores, x, y):
  available = [i for i in range(len(masks)) if masks[i, y, x]]
  if not available:
    raise ValueError('未识别到点击位置的图案，请换一个位置或使用画笔')
  best = max(available, key=lambda i: float(scores[i]))
  # 单次点击只编辑所在连通部分，避免预测中的远处碎片误改其他文字。
  _, components = cv2.connectedComponents(masks[best].astype(np.uint8), connectivity=8)
  return components == components[y, x]


class ForegroundModel:
  def __init__(self, directory):
    import torch
    from vendor.birefnet.birefnet import BiRefNet
    self.torch = torch
    self.model = BiRefNet.from_pretrained(
      str(directory), local_files_only=True).eval().cuda().half()

  def predict(self, rgb):
    from torchvision import transforms
    from PIL import Image
    torch = self.torch
    transform = transforms.Compose([
      transforms.Resize((2048, 2048)), transforms.ToTensor(),
      transforms.Normalize([.485, .456, .406], [.229, .224, .225]),
    ])
    tensor = transform(Image.fromarray(rgb)).unsqueeze(0).cuda().half()
    with torch.inference_mode():
      probability = self.model(tensor)[-1].sigmoid().float()
      probability = torch.nn.functional.interpolate(probability, size=rgb.shape[:2],
        mode='bilinear', align_corners=False)
    return probability[0, 0].cpu().numpy()
