import { expect, it } from 'vitest';
import { polygonSelection, trimRegion } from './trim';
import type { Project } from './types';
const project: Project = {
  version: 1,
  name: 'test',
  image: 'original',
  width: 3,
  height: 2,
  sizeMm: [55, 55],
  labels: [1, 1, 2, 1, 2, 0],
  regions: [
    { id: 1, name: '层1', color: '#ffffff', layers: 10 },
    { id: 2, name: '层2', color: '#000000', layers: 5 },
  ],
};
it('清除与保留互补，只改当前层并保留原图和高度', () => {
  const clear = trimRegion(project, 1, [0, 2], 'clear');
  const keep = trimRegion(project, 1, [0, 2], 'keep');
  expect(clear.labels).toEqual([0, 1, 2, 1, 2, 0]);
  expect(keep.labels).toEqual([1, 0, 2, 0, 2, 0]);
  expect(keep.image).toBe(project.image);
  expect(keep.regions).toBe(project.regions);
  expect(project.labels).toEqual([1, 1, 2, 1, 2, 0]);
  expect(trimRegion(project, 1, [], 'keep')).toBe(project);
  expect(trimRegion(project, 99, [0], 'clear')).toBe(project);
});
it('框选按像素中心且凹多边形不会填平凹口', () => {
  expect(
    polygonSelection(
      [
        [-1, -1],
        [2, -1],
        [2, 2],
        [-1, 2],
      ],
      3,
      3,
    ),
  ).toEqual([0, 1, 3, 4]);
  expect(
    polygonSelection(
      [
        [0, 0],
        [3, 0],
        [3, 1],
        [1, 1],
        [1, 3],
        [0, 3],
      ],
      3,
      3,
    ),
  ).toEqual([0, 1, 2, 3, 6]);
  expect(
    polygonSelection(
      [
        [0, 0],
        [1, 1],
      ],
      3,
      3,
    ),
  ).toEqual([]);
});
