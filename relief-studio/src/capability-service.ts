import type { CapabilityService, EditPatch, OperationResult, ProjectSnapshot,
  HeightRequest, RecognitionRequest, ExportRequest, ExportResult } from './contracts';
import { decodeRaster, encodeRaster } from './contracts/raster-codec';
import { decodeProject, encodeProject } from './project-codec';

type Action = 'height' | 'recognition' | 'export' | 'save' | 'open' | 'migrate' | 'import';
interface WireRequest { requestId: string; payload: Record<string, unknown> }
interface WireResponse { requestId: string; result: OperationResult<unknown> }
export type Progress = { completed: number; total: number; message: string };
export type NativeV2 = Record<Action, (request: WireRequest) => Promise<WireResponse>> & {
  cancel(request: { requestId: string }): Promise<void>;
  progress(request: { requestId: string }): Promise<Progress | null>;
};
declare global { interface Window { reliefV2?: NativeV2 } }

export function decodePatch(value: unknown): EditPatch {
  const patch = value as EditPatch;
  if (!patch || !Array.isArray(patch.blocks) || !patch.base || typeof patch.description !== 'string')
    throw new Error('候选补丁格式无效');
  return { ...patch, blocks: patch.blocks.map(block => {
    if (!['labels', 'heights', 'colors', 'protection'].includes(block.field))
      throw new Error('候选字段无效');
    const before = block.before as unknown as { data: string; type: string };
    const after = block.after as unknown as { data: string; type: string };
    const kind = ['labels', 'heights'].includes(block.field) ? 'uint16' : 'uint8';
    if (before.type !== kind || after.type !== kind) throw new Error('候选栅格类型错误');
    const bytes = atob(before.data).length;
    return { ...block, before: decodeRaster(before, bytes / (kind === 'uint16' ? 2 : 1)),
      after: decodeRaster(after, bytes / (kind === 'uint16' ? 2 : 1)) };
  }) };
}

export function createCapabilityService(native: NativeV2, onProgress?: (value: Progress) => void) {
  async function call<T>(action: Action, payload: Record<string, unknown>,
    decode: (value: unknown) => T, signal?: AbortSignal): Promise<OperationResult<T>> {
    const requestId = crypto.randomUUID();
    const snapshot = payload.snapshot as ProjectSnapshot | undefined;
    const base = snapshot ? { sessionId: snapshot.sessionId, revision: snapshot.revision }
      : { sessionId: requestId, revision: 0 };
    if (signal?.aborted) return { status: 'cancelled', base };
    let active = true;
    const cancel = () => { void native.cancel({ requestId }).catch(() => {}); };
    const timer = onProgress ? setInterval(() => {
      void native.progress({ requestId }).then(value => { if (active && value) onProgress(value); }).catch(() => {});
    }, 150) : undefined;
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const response = await native[action]({ requestId, payload });
      if (response.requestId !== requestId) throw new Error('返回任务编号不匹配');
      if (signal?.aborted && ['height', 'recognition', 'import'].includes(action))
        return { status: 'cancelled', base };
      const result = response.result;
      if (result.status !== 'success') return result;
      return { ...result, value: decode(result.value) };
    } finally {
      active = false;
      clearInterval(timer); signal?.removeEventListener('abort', cancel);
    }
  }
  function input(request: HeightRequest | RecognitionRequest | ExportRequest) {
    return { ...request, snapshot: encodeProject(request.snapshot),
      ...('selection' in request && request.selection ? { selection: {
        ...request.selection, data: encodeRaster(request.selection.data),
      } } : {}) };
  }
  const service: CapabilityService = {
    height: (request, signal) => call('height', input(request), decodePatch, signal),
    recognition: (request, signal) => call('recognition', input(request), decodePatch, signal),
    export: (request, signal) => call('export', input(request), value => value as ExportResult, signal),
  };
  return { ...service,
    import: (imageDataUrl: string, sizeMm: [number, number], keepBackground = false,
      signal?: AbortSignal) => call('import', { imageDataUrl, sizeMm, keepBackground }, decodeProject, signal),
    save: (snapshot: ProjectSnapshot, path?: string) => call('save',
      { snapshot: encodeProject(snapshot), path }, value => value as { path: string }),
    open: (path?: string) => call('open', { path }, value => {
      const result = value as { snapshot: unknown; migrated: boolean; sourcePath: string };
      return { ...result, snapshot: decodeProject(result.snapshot) };
    }),
  };
}
