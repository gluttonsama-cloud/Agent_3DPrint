import { expect, it } from 'vitest';
import { moveCrop, resizeCrop, workSize } from './crop';

it('移动裁剪框不改变大小且限制在原图内', () => {
  expect(moveCrop([10, 20, 500, 658], 4000, -100, 4000, 4000)).toEqual([3500, 0, 500, 658]);
});
it('角点缩放和比例锁定保持固定对角', () => {
  expect(resizeCrop([100, 100, 200, 100], 'se', 500, 400, 1000, 1000, false)).toEqual([100, 100, 400, 300]);
  expect(resizeCrop([100, 100, 200, 100], 'se', 500, 400, 1000, 1000, true)).toEqual([100, 100, 600, 300]);
  expect(resizeCrop([100, 100, 200, 100], 'nw', 0, 0, 1000, 1000, true)).toEqual([0, 50, 300, 150]);
  expect(resizeCrop([100, 100, 200, 100], 'se', 300, 250, 1000, 1000, true)).toEqual([100, 100, 300, 150]);
});
it('在裁剪后限制工作尺寸，小主体保留原始像素', () => {
  expect(workSize(500, 658)).toEqual([500, 658]);
  expect(workSize(4000, 2000)).toEqual([2048, 1024]);
});
