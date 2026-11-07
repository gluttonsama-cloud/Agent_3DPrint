type SizeMm = [number, number];

export function initialSizeMm(width: number, height: number): SizeMm {
  const scale = Math.max(55 / Math.max(width, height), 0.1 / Math.min(width, height));
  return [width * scale, height * scale];
}

export function resizeMm(size: SizeMm, axis: number, value: number, locked: boolean): SizeMm {
  const next: SizeMm = [...size];
  next[axis] = value;
  if (locked) next[1 - axis] = size[1 - axis] * value / size[axis];
  if (next.some((length, index) => (locked || index === axis) &&
      (!Number.isFinite(length) || length < 0.1 || length > 10000)))
    throw new Error('联动后的宽高均需在 0.1–10000 mm 内，请调整尺寸或解除比例锁定。');
  return next;
}
