import type { CapabilityService, EditPatch, HeightRequest, OperationResult,
  ProjectSnapshot, VersionStamp } from './index';
import { heightBlock } from './patch';

export interface MockOptions {
  scenario?: 'success' | 'delayed' | 'cancelled' | 'failure' | 'stale';
  delayMs?: number;
}
export function makeFixture(): ProjectSnapshot {
  const original = new Uint8Array(48);
  for (let i = 0; i < 12; i++) original.set([i * 20, 120, 200, 255], i * 4);
  original[3] = 0;
  return {
    version: 2, sessionId: 'fixture-v2', revision: 0, name: '4x3 合同样例',
    width: 4, height: 3, sizeMm: [4, 3], original, colors: original.slice(),
    labels: new Uint16Array([0, 1, 2, 3, 4, 0, 2, 3, 4, 1, 2, 3]),
    heights: new Uint16Array([0, 0, 3, 6, 10, 0, 3, 6, 10, 0, 3, 6]),
    protection: new Uint8Array([0, 1, 2, 4, 7, 5, 0, 0, 0, 0, 0, 0]),
    regions: [0, 3, 6, 10].map((defaultLayers, i) => ({
      id: i + 1, name: `区域 ${i + 1}`, color: '#0078c8', defaultLayers,
    })),
    heightMapping: { kind: 'design', mmPerLayer: 0.1 },
    device: { id: 'generic-unverified', name: '通用未验证配置', verified: false,
      whitePolarity: 'unknown', automaticWhite: 'unknown', colorSpace: 'RGB', iccPath: null },
  };
}

async function simulate<T>(base: VersionStamp, options: MockOptions,
  produce: () => T, signal?: AbortSignal): Promise<OperationResult<T>> {
  const stamp = { sessionId: base.sessionId, revision: base.revision };
  if (options.scenario === 'delayed' && !signal?.aborted) {
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, options.delayMs ?? 200);
      signal?.addEventListener('abort', finish, { once: true });
      if (signal?.aborted) finish();
    });
  }
  if (signal?.aborted || options.scenario === 'cancelled') return { status: 'cancelled', base: stamp };
  if (options.scenario === 'failure') {
    return { status: 'error', base: stamp, code: 'MOCK_FAILURE', message: '模拟算法失败，保留当前工程' };
  }
  try { return { status: 'success', base: stamp, value: produce() }; }
  catch (error) {
    return { status: 'error', base: stamp, code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : String(error) };
  }
}

export async function runMockHeight(input: HeightRequest, options: MockOptions = {},
  signal?: AbortSignal): Promise<OperationResult<EditPatch>> {
  const request = structuredClone(input);
  const { snapshot, selection, operation } = request;
  const base = { sessionId: snapshot.sessionId, revision: snapshot.revision };
  const resultBase = options.scenario === 'stale' ? { ...base, sessionId: `${base.sessionId}:old` } : base;
  return simulate(resultBase, options, () => {
    if (selection && (selection.width !== snapshot.width || selection.height !== snapshot.height ||
        selection.data.length !== snapshot.width * snapshot.height ||
        selection.data.some(value => value !== 0 && value !== 1))) throw new Error('invalid selection');
    if (operation.kind !== 'set' && operation.kind !== 'uniform') {
      throw new Error('mock height supports set/uniform only');
    }
    if (!Number.isInteger(operation.layers) || operation.layers < 0 || operation.layers > 256) {
      throw new Error('layers must be an integer in 0..256');
    }
    const after = snapshot.heights.slice();
    after.forEach((_, i) => {
      if (snapshot.labels[i] && (!selection || selection.data[i]) &&
          (operation.kind === 'set' || !(snapshot.protection[i] & 4))) after[i] = operation.layers;
    });
    return { base: resultBase, description: '模拟高度候选',
      blocks: heightBlock(snapshot.heights, after) };
  }, signal);
}

/** 识别返回空补丁，导出不写文件；只用于 B 验证状态流程。 */
export function createMockService(options: MockOptions = {}): CapabilityService {
  const stamp = (snapshot: ProjectSnapshot): VersionStamp => ({
    sessionId: snapshot.sessionId + (options.scenario === 'stale' ? ':old' : ''),
    revision: snapshot.revision,
  });
  return {
    height: (input, signal) => runMockHeight(input, options, signal),
    recognition: (input, signal) => {
      const base = stamp(input.snapshot);
      return simulate(base, options, () => ({ base, description: '模拟识别：无栅格修改', blocks: [] }), signal);
    },
    export: (input, signal) => {
      const base = stamp(input.snapshot);
      const outputDirectory = input.outputDirectory;
      return simulate(base, options, () => ({ outputDirectory, files: [], simulated: true,
        checks: [{ code: 'MOCK_ONLY', status: 'warning', message: '模拟结果，未生成文件' }] }), signal);
    },
  };
}
