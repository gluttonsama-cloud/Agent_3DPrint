import { expect, it } from 'vitest';
import { createCapabilityService, type NativeV2 } from './capability-service';
import { makeFixture } from './contracts/mock';
import { encodeRaster } from './contracts/raster-codec';

it('重新识别将选区、主体与排除蒙版编码为正式栅格协议', async () => {
  const snapshot = makeFixture();
  const data = new Uint8Array(snapshot.width * snapshot.height); data[2] = 1;
  const mask = { width: snapshot.width, height: snapshot.height, data };
  let payload: Record<string, unknown> | undefined;
  const recognition: NativeV2['recognition'] = async request => {
    payload = request.payload;
    return { requestId: request.requestId, result: { status: 'cancelled', base: snapshot } };
  };
  const native = { recognition } as NativeV2;
  await createCapabilityService(native).recognition({ snapshot, selection: mask,
    subjectMask: mask, excludedMask: mask, keepBackground: false, protectionPolicy: 'preserve' });
  for (const key of ['selection', 'subjectMask', 'excludedMask'])
    expect(payload?.[key]).toEqual({ ...mask, data: encodeRaster(data) });
});

it('重新识别取消后迟到的成功候选仍被丢弃', async () => {
  const controller = new AbortController(), snapshot = makeFixture();
  let cancellations = 0;
  const recognition: NativeV2['recognition'] = async request => {
      controller.abort();
      return { requestId: request.requestId, result: { status: 'success', base: snapshot,
        value: { base: snapshot, description: 'late', blocks: [] } } };
  };
  const native: NativeV2 = { recognition, height: recognition, export: recognition, save: recognition,
    open: recognition, migrate: recognition, import: recognition, progress: async () => null,
    cancel: async () => { cancellations++; } };
  const result = await createCapabilityService(native).recognition({ snapshot,
    keepBackground: false, protectionPolicy: 'preserve' }, controller.signal);
  expect(result.status).toBe('cancelled');
  expect(cancellations).toBe(1);
});

it('height 等待返回时取消，不提交迟到的成功候选', async () => {
  const controller = new AbortController();
  const snapshot = makeFixture();
  const height: NativeV2['height'] = async request => {
    controller.abort();
    return { requestId: request.requestId, result: { status: 'success', base: snapshot,
      value: { base: { sessionId: snapshot.sessionId, revision: 0 }, description: 'late',
        blocks: [{ field: 'heights', offset: 2, before: encodeRaster(new Uint16Array([3])),
          after: encodeRaster(new Uint16Array([6])) }] } } };
  };
  const native: NativeV2 = { height, recognition: height, export: height, save: height,
    open: height, migrate: height, import: height, cancel: async () => {}, progress: async () => null };
  const result = await createCapabilityService(native).height({ snapshot,
    operation: { kind: 'set', layers: 6 } }, controller.signal);
  expect(result.status).toBe('cancelled');
  expect(snapshot.heights[2]).toBe(3);
});
