import { describe, expect, it } from 'vitest';
import { makeFixture, runMockHeight } from '../contracts/mock';
import { EditorStore, diffSnapshot, heightCandidate } from './store';

describe('D1 唯一历史入口', () => {
  it('RGB 整片改色不会为每个像素分配历史对象', () => {
    const source = makeFixture();
    source.colors = new Uint8Array(256 * 256 * 4).fill(255);
    const next = structuredClone(source);
    for (let i = 0; i < next.colors.length; i += 4) next.colors.set([10, 20, 30], i);
    const patch = diffSnapshot(source, next, '整片改色');
    expect(patch.blocks.length).toBeLessThanOrEqual(64);
    const restored = source.colors.slice();
    for (const block of patch.blocks) restored.set(block.after, block.offset);
    expect(restored).toEqual(next.colors);
  });
  it('模拟高度提交同时设置人工保护，撤销一起还原', async () => {
    const store = new EditorStore(makeFixture());
    const original = store.snapshot.protection.slice();
    const request = { snapshot: store.snapshot, operation: { kind: 'set' as const, layers: 7 } };
    const result = await runMockHeight(request);
    if (result.status !== 'success') throw Error('fixture');
    store.accept({ ...result, value: heightCandidate(request, result.value) });
    expect(store.snapshot.protection[6] & 4).toBe(4);
    expect(store.undoCount).toBe(1); store.undo(); expect(store.snapshot.protection).toEqual(original);
  });
  it('原子提交所有字段和属性，撤销重做递增版本并精确恢复', () => {
    const source = makeFixture(), store = new EditorStore(source);
    const savedId = store.contentId;
    const next = structuredClone(store.snapshot);
    next.labels[2] = 0; next.heights[2] = 0; next.protection[2] |= 5;
    next.colors[8] = 17; next.regions[0].name = '新名称'; next.device.name = '测试设备';
    store.commitPatch(diffSnapshot(store.snapshot, next, '跨字段修改'));
    expect(store.snapshot.revision).toBe(1);
    expect(store.undoCount).toBe(1);
    store.undo();
    expect(store.contentId).toBe(savedId);
    for (const key of ['colors', 'labels', 'heights', 'protection', 'regions', 'device'] as const)
      expect(store.snapshot[key]).toEqual(source[key]);
    expect(store.snapshot.revision).toBe(2);
    store.redo(); expect(store.snapshot.heights).toEqual(next.heights);
    expect(store.snapshot.revision).toBe(3);
  });
  it('提交、撤销、重做、换图后旧候选均不能应用', async () => {
    const store = new EditorStore(makeFixture());
    const request = () => runMockHeight({ snapshot: store.snapshot, operation: { kind: 'set', layers: 7 } });
    const first = await request();
    if (first.status !== 'success') throw Error('fixture');
    store.commitPatch(first.value);
    expect(store.accept(first)).toBe('stale');
    const beforeUndo = await request(); store.undo(); expect(store.accept(beforeUndo)).toBe('stale');
    const beforeRedo = await request(); store.redo(); expect(store.accept(beforeRedo)).toBe('stale');
    const beforeSwitch = await request(); store.replace(makeFixture());
    expect(store.accept(beforeSwitch)).toBe('stale');
  });
  it('取消后迟到成功、错误、预览与空修改均不进入历史', async () => {
    const store = new EditorStore(makeFixture()), original = store.snapshot;
    const result = await runMockHeight({ snapshot: original, operation: { kind: 'set', layers: 8 } });
    const controller = new AbortController(); controller.abort();
    expect(store.accept(result, controller.signal)).toBe('cancelled');
    expect(store.accept({ status: 'error', base: original, code: 'FAIL', message: '失败' })).toBe('error');
    store.preview(result.status === 'success' ? result.value : null);
    expect(store.snapshot).toBe(original); expect(store.undoCount).toBe(0);
    store.preview(null); store.commitPatch(diffSnapshot(original, original, '空修改'));
    expect(store.undoCount).toBe(0);
  });
  it('非法补丁和单次超预算在提交前拒绝，历史累计受预算限制', () => {
    const store = new EditorStore(makeFixture(), 16);
    const next = structuredClone(store.snapshot); next.heights[2] = 4;
    const patch = diffSnapshot(store.snapshot, next, '高度');
    store.commitPatch(patch); expect(store.historyBytes).toBe(4);
    const invalid = diffSnapshot(store.snapshot, next, '非法');
    invalid.blocks = [{ field: 'labels', offset: 2, before: new Uint16Array([2]), after: new Uint16Array([0]) }];
    expect(() => store.commitPatch(invalid)).toThrow(); expect(store.undoCount).toBe(1);
    const huge = structuredClone(store.snapshot); huge.colors.fill(100);
    expect(() => store.commitPatch(diffSnapshot(store.snapshot, huge, '过大'))).toThrow('历史预算');
    expect(store.undoCount).toBe(1);
    for (let i = 5; i < 20; i++) {
      const update = structuredClone(store.snapshot); update.heights[2] = i;
      store.commitPatch(diffSnapshot(store.snapshot, update, '高度'));
    }
    expect(store.historyBytes).toBeLessThanOrEqual(16);
  });
});
