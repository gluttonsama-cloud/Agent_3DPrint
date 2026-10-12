import { expect, it } from 'vitest';
import { screenToImage } from './viewport';

it('缩放、滚动和平移后仍命中同一工作像素', () => {
  expect(screenToImage(50, 40, { left: 10, top: 20, width: 200, height: 100 }, 100, 50)).toEqual([
    20, 10,
  ]);
  expect(screenToImage(65, 70, { left: -15, top: 30, width: 400, height: 200 }, 100, 50)).toEqual([
    20, 10,
  ]);
});

it('点选夹在有效像素内，框选和套索允许选到最右最下边界', () => {
  const bounds = { left: 5, top: 10, width: 200, height: 100 };
  expect(screenToImage(-20, -30, bounds, 100, 50)).toEqual([0, 0]);
  expect(screenToImage(205, 110, bounds, 100, 50)).toEqual([99, 49]);
  expect(screenToImage(205, 110, bounds, 100, 50, true)).toEqual([100, 50]);
  expect(screenToImage(300, 200, bounds, 100, 50, true)).toEqual([100, 50]);
});

it('转换使用实际显示宽高，支持非整数显示比例', () => {
  const bounds = { left: 0.25, top: 4.75, width: 333.5, height: 100.5 };
  expect(screenToImage(0.25 + 333.5 / 2, 4.75 + 100.5 / 2, bounds, 2048, 512)).toEqual([1024, 256]);
  expect(() => screenToImage(1, 1, { ...bounds, width: 0 }, 10, 10)).toThrow();
});
