import type { EditPatch, ProjectSnapshot, RasterBlock } from './index';

/** 协议参考应用器；B 的历史系统拥有提交、预算核算及反向补丁。 */
export function applyCandidate(snapshot: ProjectSnapshot, patch: EditPatch): ProjectSnapshot {
  if (patch.base.sessionId !== snapshot.sessionId || patch.base.revision !== snapshot.revision) {
    throw new Error('stale candidate');
  }
  const ranges = new Map<string, [number, number][]>();
  for (const block of patch.blocks) {
    if (!['colors', 'labels', 'heights', 'protection'].includes(block.field)) {
      throw new Error('invalid patch field');
    }
    const target = snapshot[block.field];
    if (!target || !Number.isSafeInteger(block.offset) || block.offset < 0 ||
        block.before.constructor !== target.constructor ||
        block.after.constructor !== target.constructor ||
        block.before.length !== block.after.length ||
        block.offset + block.before.length > target.length) throw new Error('invalid patch block');
    const end = block.offset + block.before.length;
    const previous = ranges.get(block.field) ?? [];
    if (previous.some(([start, stop]) => block.offset < stop && end > start)) {
      throw new Error('overlapping patch blocks');
    }
    previous.push([block.offset, end]);
    ranges.set(block.field, previous);
    if (block.before.some((value, i) => target[block.offset + i] !== value)) {
      throw new Error('patch before mismatch');
    }
  }
  if (patch.properties) {
    const keys = ['regions', 'name', 'sizeMm', 'device', 'heightMapping'] as const;
    for (const side of [patch.properties.before, patch.properties.after]) {
      if (!side || Object.keys(side).length !== keys.length ||
          !keys.every(key => Object.hasOwn(side, key))) throw new Error('invalid patch properties');
    }
    if (keys.some(key => JSON.stringify(snapshot[key]) !==
        JSON.stringify(patch.properties!.before[key]))) throw new Error('patch properties mismatch');
  }
  const result = structuredClone(snapshot);
  for (const block of patch.blocks) result[block.field].set(block.after, block.offset);
  if (patch.properties) Object.assign(result, structuredClone(patch.properties.after));
  if (typeof result.name !== 'string' || result.sizeMm.length !== 2 ||
      result.sizeMm.some(value => !Number.isFinite(value) || value <= 0) ||
      result.regions.some(region => !Number.isInteger(region.id) || region.id < 1 ||
        region.id > 65535 || !Number.isInteger(region.defaultLayers) ||
        region.defaultLayers < 0 || region.defaultLayers > 256 ||
        typeof region.name !== 'string' || !/^#[0-9a-f]{6}$/i.test(region.color))) {
    throw new Error('invalid project properties');
  }
  const ids = new Set(result.regions.map(region => region.id));
  if (ids.size !== result.regions.length) throw new Error('duplicate region IDs');
  for (let i = 0; i < result.labels.length; i++) {
    if (result.heights[i] > 256 || result.protection[i] > 7 ||
        (result.labels[i] === 0 && result.heights[i] !== 0) ||
        (result.labels[i] !== 0 && (!ids.has(result.labels[i]) || result.original[i * 4 + 3] === 0))) {
      throw new Error('patch violates pixel invariants');
    }
  }
  result.revision = snapshot.revision + 1;
  return result;
}

export function heightBlock(before: Uint16Array, after: Uint16Array): RasterBlock[] {
  return before.some((value, i) => value !== after[i])
    ? [{ field: 'heights', offset: 0, before: before.slice(), after: after.slice() }] : [];
}
