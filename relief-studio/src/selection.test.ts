import { expect, it } from 'vitest';
import { combineSelection, regionSelection, selectionEdges } from './selection';

it('同色选区包含全部不相连像素，不修改区域或图案', () => {
  const labels = [1, 0, 2, 1, 2, 1];
  expect(regionSelection(labels, 1)).toEqual([0, 3, 5]);
  expect(regionSelection(labels, 0)).toEqual([]);
  expect(labels).toEqual([1, 0, 2, 1, 2, 1]);
});
it('替换、追加、减选可组合，结果不含重复像素', () => {
  expect(combineSelection([0, 2], [2, 3], 'replace')).toEqual([2, 3]);
  expect(combineSelection([0, 2], [2, 3], 'add')).toEqual([0, 2, 3]);
  expect(combineSelection([0, 2], [2, 3], 'subtract')).toEqual([0]);
});
it('轮廓仅描绘外边缘和孔洞，没有内部填充或相邻像素分界', () => {
  const edges = selectionEdges([0, 1], 2, 1);
  expect(edges).toHaveLength(6);
  expect(edges).not.toContainEqual([1, 0, 1, 1]);
  expect(selectionEdges([0, 1, 2, 3, 5, 6, 7, 8], 3, 3)).toHaveLength(16);
});
