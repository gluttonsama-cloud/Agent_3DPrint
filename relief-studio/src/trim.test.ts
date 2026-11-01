import { fromLegacy, legacyEdit, toLegacy } from './editor/legacy-adapter';
import { EditorStore, diffSnapshot } from './editor/store';
import { encodeProject, decodeProject } from './project-codec';
import { expect, it } from 'vitest';
import { polygonSelection, restoreSelection, trimRegion } from './trim';
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

it('增补仅填非透明未打印部分，显式跨区才覆盖邻区，重复操作无变化', () => {
  const original = Uint8Array.from({ length: 24 }, (_, i) => i === 23 ? 0 : 255);
  const cleared = trimRegion(project, 1, [0, 1], 'clear');
  const restored = restoreSelection(cleared, 1, [0, 1, 2, 5, -1, 99], original);
  expect(restored.labels).toEqual(project.labels);
  expect(restoreSelection(restored, 1, [0, 1, 2, 5], original)).toBe(restored);
  expect(restoreSelection(cleared, 1, [0, 2, 5], original, true).labels).toEqual([1, 0, 1, 1, 2, 0]);
  expect(restoreSelection(cleared, 99, [0], original)).toBe(cleared);
  expect(restoreSelection(cleared, 1, [], original)).toBe(cleared);
});

it('整区清除再增补使用原有适配器，颜色高度保护可撤销重做并编码重开', () => {
  const rgba = Uint8Array.from({ length: 24 }, (_, i) => i % 4 === 3 ? 255 : 80 + i);
  const initial = fromLegacy(project, rgba);
  initial.colors[0] = 222;
  const store = new EditorStore(initial);
  const commit = (next: Project) => store.commitPatch(diffSnapshot(store.snapshot, legacyEdit(store.snapshot, next), '选区修整'));
  commit(trimRegion(toLegacy(store.snapshot, 'image'), 1, [0, 1, 3], 'clear'));
  const cleared = structuredClone(store.snapshot);
  expect(Array.from(cleared.heights)).toEqual([0, 0, 5, 0, 5, 0]);
  commit(restoreSelection(toLegacy(store.snapshot, 'image'), 1, [0, 1, 2, 3], rgba));
  const restored = structuredClone(store.snapshot);
  expect(Array.from(restored.labels)).toEqual(project.labels);
  expect(Array.from(restored.heights)).toEqual([10, 10, 5, 10, 5, 0]);
  expect(restored.colors.slice(0, 4)).toEqual(rgba.slice(0, 4));
  expect(Array.from(restored.protection)).toEqual([7, 7, 0, 7, 0, 0]);
  store.undo();
  for (const field of ['labels', 'colors', 'heights', 'protection'] as const) expect(store.snapshot[field]).toEqual(cleared[field]);
  store.redo();
  const reopened = decodeProject(encodeProject(store.snapshot));
  for (const field of ['labels', 'colors', 'heights', 'protection'] as const) expect(reopened[field]).toEqual(restored[field]);
});
