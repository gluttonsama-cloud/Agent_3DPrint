import { describe, expect, it } from 'vitest';
import { fitScale, zoomAt } from './viewport';

describe('画布导航', () => {
  it('已平移的画布连续缩放后，鼠标仍指向同一个像素', () => {
    let camera = { scale: 0.75, x: -83, y: 31 };
    const point = { x: 129, y: -62 };
    const image = { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale };
    for (const scale of [1, 2.5, 16, 0.05, 0.75]) {
      camera = zoomAt(camera, scale, point.x, point.y);
      expect((point.x - camera.x) / camera.scale).toBeCloseTo(image.x);
      expect((point.y - camera.y) / camera.scale).toBeCloseTo(image.y);
    }
  });
  it('按真实像素比例限制缩放并适配长宽图', () => {
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 100).scale).toBe(16);
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 0).scale).toBe(0.05);
    expect(fitScale(800, 600, 1600, 400)).toBeCloseTo(736 / 1600);
    expect(fitScale(800, 600, 400, 1600)).toBeCloseTo(536 / 1600);
  });
});
