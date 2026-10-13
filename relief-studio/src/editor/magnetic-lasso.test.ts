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
    const path = magneticSegment(image, [28, 12], [28, 52], 8);
    expect(path.every(point => point[0] >= 23 && point[0] <= 24)).toBe(true);
    expect(magneticPoint(image, [50, 30], 8)).toEqual([50, 30]);
  }
});
