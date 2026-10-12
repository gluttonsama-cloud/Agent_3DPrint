import { describe, expect, it } from 'vitest';
import { decodeRaster, encodeRaster } from './raster-codec';
import { createMockService, makeFixture, runMockHeight } from './mock';
import { applyCandidate } from './patch';
import normalText from '../../tests/fixtures/v2/normal-v2.json?raw';
import corruptText from '../../tests/fixtures/v2/corrupt-base64-v2.json?raw';
import type { EditPatch } from './index';

describe('v2 协议边界', () => {
  it('2048 蒙版与 RGBA 栅格解码不会耗尽正则调用栈', () => {
    for (const channels of [1, 4]) {
      const source = new Uint8Array(2048 * 2048 * channels).fill(173);
      source[source.length - 1] = 0;
      const restored = decodeRaster(encodeRaster(source), source.length);
      expect(restored.length).toBe(source.length);
      expect(restored.every((value, i) => value === source[i])).toBe(true);
    }
  });
  it('拒绝空白、错位填充和非规范尾位，允许合法的空栅格', () => {
    for (const data of [' A==', 'A===', 'AA=A', 'AB==', 'AA?='])
      expect(() => decodeRaster({ type: 'uint8', encoding: 'base64-le', data }, 1)).toThrow();
    expect(decodeRaster(encodeRaster(new Uint8Array()), 0).length).toBe(0);
  });
  it('拒绝运行时原图改写和属性越权注入', () => {
    const snapshot = makeFixture();
    for (const payload of [
      { blocks: [{ field: 'original', offset: 0, before: new Uint8Array([0]),
        after: new Uint8Array([10]) }] },
      { blocks: [], properties: { before: {}, after: { sessionId: 'hijacked' } } },
    ]) expect(() => applyCandidate(snapshot, { base: snapshot, description: '非法',
      ...payload } as unknown as EditPatch)).toThrow();
  });
  it('文件样例与运行时样例一致，损坏文件明确拒绝', () => {
    const normal = JSON.parse(normalText);
    const fixture = makeFixture();
    for (const field of ['original', 'colors', 'labels', 'heights', 'protection'] as const) {
      expect(decodeRaster(normal[field], fixture[field].length)).toEqual(fixture[field]);
    }
    expect(() => decodeRaster(JSON.parse(corruptText).heights, 12)).toThrow();
  });
  it('识别和导出 mock 明确无文件产物，自动均高遵守高度保护', async () => {
    const snapshot = makeFixture();
    const service = createMockService();
    const result = await service.height({ snapshot, operation: { kind: 'uniform', layers: 1 } });
    if (result.status !== 'success') throw new Error('missing result');
    const applied = applyCandidate(snapshot, result.value);
    expect(applied.heights[3]).toBe(6);
    expect(applied.heights[4]).toBe(10);
    expect(applied.heights[2]).toBe(1);
    const recognition = await service.recognition({ snapshot, keepBackground: false,
      protectionPolicy: 'preserve' });
    expect(recognition.status).toBe('success');
    const exported = await service.export({ snapshot, device: snapshot.device,
      formats: ['png'], obj: false, outputDirectory: 'mock-only' });
    if (exported.status !== 'success') throw new Error('missing result');
    expect(exported.value.simulated).toBe(true);
    expect(exported.value.files).toHaveLength(0);
  });
  it('不合法补丁不会部分修改原快照', () => {
    const snapshot = makeFixture();
    const before = structuredClone(snapshot);
    expect(() => applyCandidate(snapshot, { base: snapshot, description: '坏补丁', blocks: [
      { field: 'heights', offset: 2, before: new Uint16Array([3]), after: new Uint16Array([5]) },
      { field: 'labels', offset: 4, before: new Uint16Array([4]), after: new Uint16Array([0]) },
    ] })).toThrow(/invariants/);
    expect(snapshot).toEqual(before);
  });
  it('小端栅格包含 256 层且往返不丢失', () => {
    const encoded = encodeRaster(new Uint16Array([0, 3, 256]));
    expect(encoded).toEqual({ type: 'uint16', encoding: 'base64-le', data: 'AAADAAAB' });
    expect(Array.from(decodeRaster(encoded, 3))).toEqual([0, 3, 256]);
  });
  it('拒绝损坏编码、错误类型、错误长度和非法大小', () => {
    for (const value of [
      { type: 'uint16', encoding: 'base64-le', data: '!' },
      { type: 'uint32', encoding: 'base64-le', data: 'AAAA' },
      { type: 'uint16', encoding: 'base64-le', data: 'AA==' },
    ]) expect(() => decodeRaster(value, 1)).toThrow();
    expect(() => decodeRaster(encodeRaster(new Uint8Array([1])), -1)).toThrow();
  });
  it('候选原子应用和反向应用保留其他栅格，revision 始终递增', async () => {
    const source = makeFixture();
    const result = await runMockHeight({
      snapshot: source, selection: { width: 4, height: 3, data: new Uint8Array(12).fill(1) },
      operation: { kind: 'set', layers: 6 },
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('mock failed');
    const after = applyCandidate(source, result.value);
    expect(source.heights[2]).toBe(3);
    expect(after.heights[0]).toBe(0);
    expect(after.heights[1]).toBe(6);
    expect(after.revision).toBe(1);
    const undo = applyCandidate(after, {
      ...result.value, base: { sessionId: after.sessionId, revision: after.revision },
      blocks: result.value.blocks.map(b => ({ ...b, before: b.after, after: b.before })),
    });
    expect(undo.heights).toEqual(source.heights);
    expect(undo.labels).toEqual(source.labels);
    expect(undo.colors).toEqual(source.colors);
    expect(undo.protection).toEqual(source.protection);
    expect(undo.revision).toBe(2);
    expect(() => applyCandidate(undo, result.value)).toThrow(/stale/);
  });
  it('延迟、失败、取消和过期场景可供 B 独立验证', async () => {
    const input = { snapshot: makeFixture(), operation: { kind: 'set' as const, layers: 10 } };
    expect((await runMockHeight(input, { scenario: 'failure' })).status).toBe('error');
    expect((await runMockHeight(input, { scenario: 'cancelled' })).status).toBe('cancelled');
    const stale = await runMockHeight(input, { scenario: 'stale' });
    if (stale.status !== 'success') throw new Error('missing stale candidate');
    expect(() => applyCandidate(input.snapshot, stale.value)).toThrow(/stale/);
    const controller = new AbortController();
    const pending = runMockHeight(input, { scenario: 'delayed', delayMs: 20 }, controller.signal);
    controller.abort();
    expect((await pending).status).toBe('cancelled');
    expect((await runMockHeight(input, { scenario: 'delayed', delayMs: 1 })).status)
      .toBe('success');
  });
  it('延迟任务捕获请求版本且空选区不变成全图', async () => {
    const source = makeFixture();
    const pending = runMockHeight({ snapshot: source, operation: { kind: 'set', layers: 6 } },
      { scenario: 'delayed', delayMs: 1 });
    source.revision++;
    const result = await pending;
    if (result.status !== 'success') throw new Error('missing result');
    expect(result.value.base.revision).toBe(0);
    expect(() => applyCandidate(source, result.value)).toThrow(/stale/);
    const empty = await runMockHeight({ snapshot: makeFixture(),
      selection: { width: 4, height: 3, data: new Uint8Array(12) },
      operation: { kind: 'set', layers: 6 } });
    if (empty.status !== 'success') throw new Error('missing result');
    expect(empty.value.blocks).toHaveLength(0);
  });
});
