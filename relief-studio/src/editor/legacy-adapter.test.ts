import { expect, it } from 'vitest';
import { makeFixture } from '../contracts/mock';
import { legacyEdit, toLegacy } from './legacy-adapter';

it('改色后分配或合并区域保留已编辑颜色', () => {
  const snapshot = makeFixture(); snapshot.colors[8] = 222;
  const view = toLegacy(snapshot, 'image'); view.labels[2] = 1;
  expect(legacyEdit(snapshot, view).colors[8]).toBe(222);
});

it('跨区域擦除同时清高度并保护范围，补回保留原始颜色，不填透明孔', () => {
  const snapshot = makeFixture(), view = toLegacy(snapshot, 'image');
  view.labels[2] = 0; view.labels[3] = 0;
  const erased = legacyEdit(snapshot, view);
  expect(Array.from(erased.heights.slice(2, 4))).toEqual([0, 0]);
  expect(erased.protection[2] & 5).toBe(5);
  const restore = toLegacy(erased, 'image'); restore.labels[2] = 1; restore.labels[0] = 1;
  const restored = legacyEdit(erased, restore);
  expect(restored.labels[0]).toBe(0); expect(restored.heights[2]).toBe(0);
  expect(restored.protection[2]).toBe(7);
  expect(restored.colors.slice(8, 12)).toEqual(snapshot.original.slice(8, 12));
});
