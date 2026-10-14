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
  const start = from;
  const end = magneticPoint(image, to, radius);
  if ((from[0] === to[0] && (to[0] === 0 || to[0] === image.width)) ||
      (from[1] === to[1] && (to[1] === 0 || to[1] === image.height))) return [to];
  const margin = Math.ceil(radius);
  const left = Math.max(0, Math.floor(Math.min(start[0], end[0]) - margin));
  const top = Math.max(0, Math.floor(Math.min(start[1], end[1]) - margin));
  const right = Math.min(image.width - 1, Math.ceil(Math.max(start[0], end[0]) + margin));
  const bottom = Math.min(image.height - 1, Math.ceil(Math.max(start[1], end[1]) + margin));
  const width = right - left + 1, height = bottom - top + 1;
  // 有界最短路径沿连续边缘行进，避免逐点吸附生成回环和毛刺。
  if (width * height <= 24000) {
    const costs = new Float32Array(width * height);
    let strongest = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const pixel = (top + y) * image.width + left + x;
      const strength = Math.min(1, Math.hypot(image.edgeX[pixel], image.edgeY[pixel]) / 100);
      strongest = Math.max(strongest, strength);
      costs[y * width + x] = 1 + 15 * (1 - strength);
    }
    // 无边缘区域无需图搜索，直接保留固定点到鼠标的待确认直线。
    if (strongest < 0.05) return [end];
    const index = (p: LassoPoint) => (Math.min(bottom, Math.round(p[1])) - top) * width + Math.min(right, Math.round(p[0])) - left;
    const source = index(start), target = index(end);
    const distances = new Float64Array(width * height).fill(Infinity);
    const previous = new Int32Array(width * height).fill(-1);
    const queue: { index: number; cost: number }[] = [];
    const push = (entry: { index: number; cost: number }) => {
      let i = queue.length; queue.push(entry);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (queue[parent].cost <= entry.cost) break;
        queue[i] = queue[parent]; i = parent;
      }
      queue[i] = entry;
    };
    const pop = () => {
      const result = queue[0], end = queue.pop()!;
      if (queue.length) {
        let i = 0;
        while (i * 2 + 1 < queue.length) {
          let child = i * 2 + 1;
          if (child + 1 < queue.length && queue[child + 1].cost < queue[child].cost) child++;
          if (queue[child].cost >= end.cost) break;
          queue[i] = queue[child]; i = child;
        }
        queue[i] = end;
      }
      return result;
    };
    distances[source] = 0; push({ index: source, cost: 0 });
    while (queue.length) {
      const current = pop();
      if (current.cost !== distances[current.index]) continue;
      if (current.index === target) break;
      const x = current.index % width, y = Math.floor(current.index / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        const next = (y + dy) * width + x + dx;
        const cost = current.cost + (dx && dy ? Math.SQRT2 : 1) * costs[next];
        if (cost >= distances[next]) continue;
        distances[next] = cost; previous[next] = current.index; push({ index: next, cost });
      }
    }
    const result: LassoPoint[] = [];
    for (let i = target; i !== source && i >= 0; i = previous[i]) result.push([left + i % width, top + Math.floor(i / width)]);
    result.reverse();
    if (end[0] === image.width || end[1] === image.height) result.push(end);
    return result;
  }
  // 大跨度移动仍有补点上限，正常描边通过自动固定点保持局部计算。
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.min(1024, Math.max(1, Math.ceil(distance / 2)));
  return Array.from({ length: steps }, (_, i) => magneticPoint(image,
    [from[0] + (to[0] - from[0]) * (i + 1) / steps, from[1] + (to[1] - from[1]) * (i + 1) / steps], radius));
}
