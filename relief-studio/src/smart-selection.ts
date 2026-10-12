/** 原图与可复用的颜色、透明度方向边缘强度。 */
export interface SelectionImage {
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly edgeX: Float32Array;
  readonly edgeY: Float32Array;
}

type Point = [number, number];

function colorDistance(rgba: Uint8ClampedArray, a: number, b: number): number {
  const dr = rgba[a] - rgba[b];
  const dg = rgba[a + 1] - rgba[b + 1];
  const db = rgba[a + 2] - rgba[b + 2];
  // 平方差保留等亮度颜色之间的区别，避免仅按灰度选区串色。
  return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
}

function referencePixel(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  tolerance: number,
  allowed?: Uint8Array,
): number {
  const origin = y * width + x;
  const seedByte = origin * 4;
  const neighbors: number[] = [];
  for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
    for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
      const index = ny * width + nx;
      if (index === origin || (allowed && !allowed[index])) continue;
      const byte = index * 4;
      if (
        rgba[byte + 3] === 0 ||
        Math.abs(rgba[byte + 3] - rgba[seedByte + 3]) > Math.max(12, tolerance * 2)
      ) {
        continue;
      }
      neighbors.push(byte);
    }
  }
  if (neighbors.length < 5) return seedByte;
  const clusterLimit = Math.max(8, Math.min(24, tolerance)) ** 2;
  let seedMatches = 0;
  for (const byte of neighbors) {
    if (colorDistance(rgba, seedByte, byte) <= clusterLimit) seedMatches++;
  }
  // 有任何相似邻居时保持细线/文字的点击颜色；仅修正孤立噪点。
  if (seedMatches > 0) return seedByte;
  let best = seedByte;
  let bestMatches = 0;
  for (const candidate of neighbors) {
    let matches = 0;
    for (const other of neighbors) {
      if (colorDistance(rgba, candidate, other) <= clusterLimit) matches++;
    }
    if (matches > bestMatches) {
      bestMatches = matches;
      best = candidate;
    }
  }
  return bestMatches >= 5 ? best : seedByte;
}

export function buildSelectionImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): SelectionImage {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    rgba.length < width * height * 4
  ) {
    throw new RangeError('Invalid selection image dimensions or RGBA data');
  }
  const edgeX = new Float32Array(width * height);
  const edgeY = new Float32Array(width * height);
  // 中心差分只需一次线性扫描；alpha 边界与等亮度色边界同样可吸附。
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const left = (i - 1) * 4;
      const right = (i + 1) * 4;
      const top = (i - width) * 4;
      const bottom = (i + width) * 4;
      const ax = rgba[left + 3] - rgba[right + 3];
      const ay = rgba[top + 3] - rgba[bottom + 3];
      edgeX[i] = Math.sqrt(colorDistance(rgba, left, right) + 0.65 * ax * ax);
      edgeY[i] = Math.sqrt(colorDistance(rgba, top, bottom) + 0.65 * ay * ay);
    }
  }
  return { rgba, width, height, edgeX, edgeY };
}

/** 四邻域连通选取，仅遍历当前允许范围内的不透明像素。 */
export function smartSelect(
  image: SelectionImage,
  seed: Point,
  tolerance: number,
  allowed?: Uint8Array,
): number[] {
  const { rgba, width, height } = image;
  const x = Math.floor(seed[0]);
  const y = Math.floor(seed[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height)
    return [];
  const size = width * height;
  const origin = y * width + x;
  if (rgba[origin * 4 + 3] === 0 || (allowed && !allowed[origin])) return [];
  const limit = Number.isFinite(tolerance) ? Math.max(1, Math.min(80, tolerance)) : 24;
  const limitSquared = limit * limit;
  const alphaLimit = Math.max(12, limit * 2);
  const seedByte = referencePixel(rgba, width, height, x, y, limit, allowed);
  const seedAlpha = rgba[origin * 4 + 3];
  const seen = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 1;
  queue[0] = origin;
  seen[origin] = 1;

  const visit = (index: number) => {
    if (seen[index]) return;
    seen[index] = 1;
    if (allowed && !allowed[index]) return;
    const byte = index * 4;
    const alpha = rgba[byte + 3];
    if (alpha === 0 || Math.abs(alpha - seedAlpha) > alphaLimit) return;
    if (colorDistance(rgba, seedByte, byte) > limitSquared) return;
    queue[tail++] = index;
  };

  while (head < tail) {
    const i = queue[head++];
    const px = i % width;
    if (px > 0) visit(i - 1);
    if (px + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < size) visit(i + width);
  }
  return Array.from(queue.subarray(0, tail));
}

function edgeAt(image: SelectionImage, x: number, y: number, nx: number, ny: number): number {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 1 || iy < 1 || ix >= image.width - 1 || iy >= image.height - 1) return 0;
  const i = iy * image.width + ix;
  return Math.abs(nx) * image.edgeX[i] + Math.abs(ny) * image.edgeY[i];
}

/** 将闭合轨迹吸附到附近原图边缘，并约束相邻位移以减少抖动。 */
export function snapOutline(image: SelectionImage, points: Point[], radius: number): Point[] {
  if (points.length < 3 || !Number.isFinite(radius) || radius < 1) return points.map((p) => [...p]);
  const duplicateEnd =
    points.length > 3 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1];
  const count = points.length - Number(duplicateEnd);
  const reach = Math.min(24, Math.floor(radius));
  if (count < 3 || reach < 1) return points.map((p) => [...p]);
  const states = reach * 2 + 1;
  const normals: Point[] = new Array(count);
  const unary = new Float32Array(count * states);
  const back = new Int16Array(count * states);
  const previous = new Float32Array(states);
  const current = new Float32Array(states);
  for (let i = 0; i < count; i++) {
    const before = points[(i + count - 1) % count];
    const after = points[(i + 1) % count];
    const dx = after[0] - before[0];
    const dy = after[1] - before[1];
    const length = Math.hypot(dx, dy);
    const nx = length > 0.01 ? -dy / length : 0;
    const ny = length > 0.01 ? dx / length : 0;
    normals[i] = [nx, ny];
    for (let s = 0; s < states; s++) {
      const offset = s - reach;
      const edge = edgeAt(image, points[i][0] + nx * offset, points[i][1] + ny * offset, nx, ny);
      // 弱边缘不胜过原轨迹；位移与相邻点位移共同抑制尖刺。
      unary[i * states + s] =
        Math.min(edge, 90) * 0.35 - 1.8 * Math.abs(offset) - 0.08 * offset * offset;
    }
  }
  for (let s = 0; s < states; s++) previous[s] = unary[s];
  for (let i = 1; i < count; i++) {
    for (let s = 0; s < states; s++) {
      let best = -Infinity;
      let bestPrev = reach;
      for (let p = 0; p < states; p++) {
        const delta = s - p;
        const score = previous[p] - 2.5 * Math.abs(delta) - 0.45 * delta * delta;
        if (score > best) {
          best = score;
          bestPrev = p;
        }
      }
      current[s] = best + unary[i * states + s];
      back[i * states + s] = bestPrev;
    }
    previous.set(current);
  }
  let state = reach;
  let best = -Infinity;
  for (let s = 0; s < states; s++) {
    const score = previous[s] - 2.5 * Math.abs(s - reach);
    if (score > best) {
      best = score;
      state = s;
    }
  }
  const offsets = new Int16Array(count);
  for (let i = count - 1; i >= 0; i--) {
    offsets[i] = state - reach;
    if (i > 0) state = back[i * states + state];
  }
  const snapped: Point[] = points.slice(0, count).map((point, i) => {
    // 多边形顶点位于像素边界；右/下边界必须保留 width/height 才覆盖最后一列/行。
    const x =
      point[0] <= 0
        ? 0
        : point[0] >= image.width
          ? image.width
          : Math.max(0, Math.min(image.width, point[0] + normals[i][0] * offsets[i]));
    const y =
      point[1] <= 0
        ? 0
        : point[1] >= image.height
          ? image.height
          : Math.max(0, Math.min(image.height, point[1] + normals[i][1] * offsets[i]));
    return [x, y];
  });
  if (duplicateEnd) snapped.push([...snapped[0]]);
  return snapped;
}
