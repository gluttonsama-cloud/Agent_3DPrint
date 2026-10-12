import type { EditPatch, HeightRequest, OperationResult, ProjectProperties, ProjectSnapshot } from '../contracts';
import { LIMITS } from '../contracts';
import { applyCandidate } from '../contracts/patch';
import { validateSnapshot } from '../project-codec';

function properties(snapshot: ProjectSnapshot): ProjectProperties {
  const { regions, name, sizeMm, device, heightMapping } = snapshot;
  return structuredClone({ regions, name, sizeMm, device, heightMapping });
}

/** 变化合并到有限大小的块，避免 RGB 改色被不变的 alpha 切成数百万对象。 */
export function diffSnapshot(before: ProjectSnapshot, after: ProjectSnapshot, description: string): EditPatch {
  const patch: EditPatch = { base: { sessionId: before.sessionId, revision: before.revision }, description, blocks: [] };
  for (const field of ['colors', 'labels', 'heights', 'protection'] as const) {
    if (before[field].length !== after[field].length) throw new Error('编辑不能改变工作尺寸');
    for (let chunk = 0; chunk < before[field].length; chunk += 4096) {
      const end = Math.min(chunk + 4096, before[field].length);
      let start = chunk, stop = end;
      while (start < stop && before[field][start] === after[field][start]) start++;
      while (stop > start && before[field][stop - 1] === after[field][stop - 1]) stop--;
      if (start < stop) patch.blocks.push({ field, offset: start,
        before: before[field].slice(start, stop), after: after[field].slice(start, stop) });
    }
  }
  const previous = properties(before), next = properties(after);
  if (JSON.stringify(previous) !== JSON.stringify(next)) patch.properties = { before: previous, after: next };
  return patch;
}

function cost(patch: EditPatch) {
  return patch.blocks.reduce((sum, block) => sum + block.before.byteLength + block.after.byteLength, 0)
    + (patch.properties ? new TextEncoder().encode(JSON.stringify(patch.properties)).byteLength : 0);
}

/** 模拟服务与真实服务共用手动保护规则，保护位和高度进入同一个历史步骤。 */
export function heightCandidate(request: HeightRequest, patch: EditPatch): EditPatch {
  const base = request.snapshot;
  if (!['set', 'add'].includes(request.operation.kind) || patch.base.sessionId !== base.sessionId ||
      patch.base.revision !== base.revision) return patch;
  const next = applyCandidate(base, patch);
  next.labels.forEach((id, index) => {
    if (id && (!request.selection || request.selection.data[index])) next.protection[index] |= 4;
  });
  return { ...diffSnapshot(base, next, patch.description), diagnostics: patch.diagnostics };
}

export class EditorStore {
  snapshot: ProjectSnapshot;
  previewSnapshot: ProjectSnapshot | null = null;
  contentId: string = crypto.randomUUID();
  private identities = new WeakMap<EditPatch, { before: string; after: string }>();
  private past: EditPatch[] = [];
  private future: EditPatch[] = [];
  constructor(snapshot: ProjectSnapshot, private budget: number = LIMITS.historyBytes) {
    validateSnapshot(snapshot);
    this.snapshot = structuredClone(snapshot);
    this.snapshot.sessionId = crypto.randomUUID(); this.snapshot.revision = 0;
  }
  get undoCount() { return this.past.length; }
  get redoCount() { return this.future.length; }
  get historyBytes() { return [...this.past, ...this.future].reduce((sum, patch) => sum + cost(patch), 0); }
  replace(snapshot: ProjectSnapshot) {
    validateSnapshot(snapshot);
    this.snapshot = structuredClone(snapshot);
    this.snapshot.sessionId = crypto.randomUUID(); this.snapshot.revision = 0;
    this.past = []; this.future = []; this.previewSnapshot = null;
    this.contentId = crypto.randomUUID();
  }
  commitPatch(patch: EditPatch) {
    const next = applyCandidate(this.snapshot, patch);
    validateSnapshot(next);
    if (!patch.blocks.length && !patch.properties) return;
    if (cost(patch) > this.budget) throw new Error('此操作超过 64 MiB 历史预算，已取消，工程保持不变');
    const entry = structuredClone(patch), nextId = crypto.randomUUID();
    this.identities.set(entry, { before: this.contentId, after: nextId });
    this.contentId = nextId;
    this.past.push(entry); this.future = [];
    this.snapshot = next; this.previewSnapshot = null;
    while (this.historyBytes > this.budget) this.past.shift();
  }
  private replay(patch: EditPatch, reverse: boolean) {
    const candidate = { ...patch, base: { sessionId: this.snapshot.sessionId, revision: this.snapshot.revision },
      blocks: patch.blocks.map(block => reverse ? { ...block, before: block.after, after: block.before } : block),
      properties: reverse && patch.properties ? { before: patch.properties.after, after: patch.properties.before } : patch.properties };
    const next = applyCandidate(this.snapshot, candidate); validateSnapshot(next);
    this.snapshot = next; this.previewSnapshot = null;
  }
  undo() {
    const patch = this.past.at(-1); if (!patch) return;
    this.replay(patch, true); this.past.pop(); this.future.push(patch);
    this.contentId = this.identities.get(patch)!.before;
  }
  redo() {
    const patch = this.future.at(-1); if (!patch) return;
    this.replay(patch, false); this.future.pop(); this.past.push(patch);
    this.contentId = this.identities.get(patch)!.after;
  }
  preview(patch: EditPatch | null) {
    const next = patch ? applyCandidate(this.snapshot, patch) : null;
    if (next) validateSnapshot(next);
    this.previewSnapshot = next;
  }
  accept(result: OperationResult<EditPatch>, signal?: AbortSignal) {
    if (signal?.aborted || result.status === 'cancelled') return 'cancelled';
    if (result.base.sessionId !== this.snapshot.sessionId || result.base.revision !== this.snapshot.revision) return 'stale';
    if (result.status === 'error') return 'error';
    if (result.value.base.sessionId !== this.snapshot.sessionId || result.value.base.revision !== this.snapshot.revision) return 'stale';
    this.commitPatch(result.value); return 'applied';
  }
}
