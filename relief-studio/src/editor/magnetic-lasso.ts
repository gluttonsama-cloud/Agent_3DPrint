import type { SelectionImage } from '../smart-selection';

export type LassoPoint = [number, number];

/** 局部吸附仅在鼠标附近寻找强边缘，弱纹理保持手绘位置。 */
export function magneticPoint(image: SelectionImage, point: LassoPoint, radius: number): LassoPoint {
  const reach = Math.max(1, Math.min(24, Math.round(radius)));
  const x = Math.max(0, Math.min(image.width, point[0]));
  const y = Math.max(0, Math.min(image.height, point[1]));
  let best = 0;
  let result: LassoPoint = [x, y];
  for (let yy = Math.max(1, Math.ceil(y - reach)); yy <= Math.min(image.height - 2, y + reach); yy++) {
    for (let xx = Math.max(1, Math.ceil(x - reach)); xx <= Math.min(image.width - 2, x + reach); xx++) {
      const distance = Math.hypot(xx - x, yy - y);
      if (distance > reach) continue;
      const i = yy * image.width + xx;
      const edge = Math.hypot(image.edgeX[i], image.edgeY[i]);
      const score = Math.min(edge, 120) * 0.3 - 5 - distance * 2 - distance * distance * 0.08;
      if (score > best) { best = score; result = [xx, yy]; }
    }
  }
  return result;
}

/** 对稀疏鼠标事件补点，避免快速移动时直接跨过轮廓。 */
export function magneticSegment(image: SelectionImage, from: LassoPoint, to: LassoPoint, radius: number): LassoPoint[] {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.min(1024, Math.max(1, Math.ceil(distance / 2)));
  return Array.from({ length: steps }, (_, i) => magneticPoint(image,
    [from[0] + (to[0] - from[0]) * (i + 1) / steps, from[1] + (to[1] - from[1]) * (i + 1) / steps], radius));
}
