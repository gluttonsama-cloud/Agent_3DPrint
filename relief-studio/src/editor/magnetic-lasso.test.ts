import { expect, it } from 'vitest';
import { buildSelectionImage } from '../smart-selection';
import { magneticPoint, magneticSegment } from './magnetic-lasso';

it('磁性轨迹吸附真实颜色与透明边界，平坦区域不凭空找边', () => {
  for (const alpha of [false, true]) {
    const rgba = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const value = x < 24 ? 0 : 255;
      rgba.set(alpha ? [100, 100, 100, value] : [value, value, value, 255], (y * 64 + x) * 4);
    }
    const image = buildSelectionImage(rgba, 64, 64);
    expect(magneticPoint(image, [28, 30], 8)[0]).toBe(24);
    const path = magneticSegment(image, [24, 12], [28, 52], 8);
    expect(path.every(point => point[0] >= 23 && point[0] <= 24)).toBe(true);
    expect(magneticPoint(image, [50, 30], 8)).toEqual([50, 30]);
  }
});

it('固定点之间沿连续直角轮廓寻路，不切角或形成自交回环', () => {
  const rgba = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const value = x >= 32 && y >= 32 ? 0 : 255;
    rgba.set([value, value, value, 255], (y * 64 + x) * 4);
  }
  const result = magneticSegment(buildSelectionImage(rgba, 64, 64), [32, 52], [52, 28], 12);
  expect(result.length).toBeGreaterThan(30);
  expect(result.every(([x, y]) => Math.abs(x - 32) <= 1 || Math.abs(y - 32) <= 1)).toBe(true);
  expect(new Set(result.map(p => p.join(','))).size).toBe(result.length);
});

it('固定点不再次漂移，图像最右和最下边界不缩进一像素', () => {
  const image = buildSelectionImage(new Uint8ClampedArray(64 * 64 * 4), 64, 64);
  for (let y = 0; y < 64; y++) { image.edgeX[y * 64 + 23] = 85; image.edgeX[y * 64 + 27] = 120; }
  const fixed = magneticPoint(image, [20, 20], 12);
  const next = magneticSegment(image, fixed, [20, 40], 12);
  expect(Math.hypot(next[0][0] - fixed[0], next[0][1] - fixed[1])).toBeLessThanOrEqual(Math.SQRT2);
  expect(magneticSegment(image, [64, 0], [64, 64], 12).at(-1)).toEqual([64, 64]);
  expect(magneticSegment(image, [64, 64], [0, 64], 12).at(-1)).toEqual([0, 64]);
});
