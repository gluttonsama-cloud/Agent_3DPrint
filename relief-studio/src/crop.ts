export type CropRect = [number, number, number, number];
export type CropState = { rect: CropRect; circle: boolean; locked: boolean };
export type Handle = 'nw' | 'ne' | 'sw' | 'se';
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function workSize(width: number, height: number): [number, number] {
  const scale = Math.min(1, 2048 / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}
export function moveCrop(r: CropRect, dx: number, dy: number, width: number, height: number): CropRect {
  return [clamp(r[0] + dx, 0, width - r[2]), clamp(r[1] + dy, 0, height - r[3]), r[2], r[3]];
}
export function resizeCrop(r: CropRect, handle: Handle, x: number, y: number,
  width: number, height: number, locked: boolean): CropRect {
  const left = handle.includes('w'), top = handle.includes('n');
  const ax = left ? r[0] + r[2] : r[0], ay = top ? r[1] + r[3] : r[1];
  const maxW = left ? ax : width - ax, maxH = top ? ay : height - ay;
  let w = clamp(left ? ax - x : x - ax, 1, maxW);
  let h = clamp(top ? ay - y : y - ay, 1, maxH);
  if (locked) {
    const ratio = r[2] / r[3];
    if (Math.abs(h / r[3] - 1) > Math.abs(w / r[2] - 1)) w = h * ratio;
    w = Math.min(Math.max(w, ratio), maxW, maxH * ratio);
    h = w / ratio;
  }
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  return [left ? ax - w : ax, top ? ay - h : ay, w, h];
}
