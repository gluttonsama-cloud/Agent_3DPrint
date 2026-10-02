import { expect, it } from 'vitest';
import { createCapabilityService, type NativeV2 } from './capability-service';
import { makeFixture } from './contracts/mock';
import { encodeRaster } from './contracts/raster-codec';

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
