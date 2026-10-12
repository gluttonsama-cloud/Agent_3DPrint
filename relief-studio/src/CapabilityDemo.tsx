import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { EditPatch, ExportRequest, HeightOperation, HeightRequest, ProjectSnapshot } from './contracts';
import { makeFixture } from './contracts/mock';
import { applyCandidate } from './contracts/patch';
import { createCapabilityService, type Progress } from './capability-service';
import { HeightPanel } from './panels/HeightPanel';
import { ExportPanel } from './panels/ExportPanel';
import { ReliefPreview } from './ReliefPreview';
import { ObjInspector } from './ObjInspector';
import './capability-demo.css';

/** 独立对接示例：此历史仅验证候选应用，不替代 B 的编辑器实现。 */
function CapabilityDemo() {
  const [snapshot, setSnapshot] = useState(makeFixture);
  const current = useRef(snapshot);
  const [preview, setPreview] = useState<ProjectSnapshot | null>(null);
  const [history, setHistory] = useState<EditPatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('已载入 4×3 固定样例');
  const [progress, setProgress] = useState<Progress | null>(null);
  const controller = useRef<AbortController | null>(null);
  const service = window.reliefV2 ? createCapabilityService(window.reliefV2, setProgress) : null;
  const replace = (next: ProjectSnapshot) => { current.current = next; setSnapshot(next); setPreview(null); };
  const apply = (patch: EditPatch) => {
    if (!patch.blocks.length && !patch.properties) { setMessage('没有需要修改的像素'); return; }
    replace(applyCandidate(current.current, patch));
    setHistory(items => [...items, patch]);
    setMessage('候选已原子提交');
  };
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (busy) return;
    if (!service) { setMessage('请通过 Electron 能力示例启动'); return; }
    controller.current = new AbortController(); setBusy(true); setProgress(null);
    try { await action(controller.current.signal); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { controller.current = null; setBusy(false); }
  }
  const height = (request: HeightRequest) => void run(async signal => {
    const result = await service!.height(request, signal);
    if (result.status === 'success') apply(result.value);
    else setMessage(result.status === 'cancelled' ? '已取消' : result.message);
  });
  const exportFiles = (request: ExportRequest) => void run(async signal => {
    const result = await service!.export(request, signal);
    setMessage(result.status === 'success' ? `导出成功：${result.value.outputDirectory}`
      : result.status === 'cancelled' ? '已取消' : result.message);
  });
  const temporary = (operation: HeightOperation | null) => {
    if (!operation || operation.kind !== 'set') { setPreview(null); return; }
    const next = structuredClone(current.current);
    next.heights.forEach((_, i) => { if (next.labels[i]) next.heights[i] = operation.layers; });
    setPreview(next);
  };
  return <main><header><small>RELIEF STUDIO / 开发对接</small><h1>A 能力独立验证台</h1>
    <p>真实高度、文件输出与预览。此页仅用于能力验收，正式工作台由 B 整合。</p></header>
    <nav>
      <button disabled={busy} onClick={() => { replace(makeFixture()); setHistory([]); }}>重置样例</button>
      <button disabled={busy || !history.length} onClick={() => {
        const patch = history[history.length - 1];
        const inverse = { ...patch, base: { sessionId: current.current.sessionId, revision: current.current.revision },
          blocks: patch.blocks.map(block => ({ ...block, before: block.after, after: block.before })),
          ...(patch.properties ? { properties: { before: patch.properties.after, after: patch.properties.before } } : {}) };
        replace(applyCandidate(current.current, inverse)); setHistory(items => items.slice(0, -1));
        setMessage('已逐像素撤销');
      }}>撤销候选</button>
      <button disabled={busy} onClick={() => {
        const source = current.current, next = structuredClone(source);
        for (const i of [2, 3, 4]) { next.labels[i] = 0; next.heights[i] = 0; next.protection[i] |= 5; }
        apply({ base: { sessionId: source.sessionId, revision: source.revision }, description: '跨区擦除示例',
          blocks: (['labels', 'heights', 'protection'] as const).map(field => ({
            field, offset: 0, before: source[field].slice(), after: next[field].slice(),
          })) });
      }}>跨区擦除示例</button>
      <button disabled={busy} onClick={() => void run(async () => {
        const result = await service!.save(current.current);
        setMessage(result.status === 'success' ? `已保存：${result.value.path}` : result.status);
      })}>保存 v2</button>
      <button disabled={busy} onClick={() => void run(async () => {
        const result = await service!.open();
        if (result.status === 'success') { replace(result.value.snapshot); setHistory([]); setMessage('已重开工程'); }
        else setMessage(result.status === 'error' ? result.message : '已取消');
      })}>打开工程</button>
    </nav>
    <p role="status" aria-label="任务状态">{busy ? '正在处理 · ' : ''}{message}</p>
    <div className="capability-grid"><HeightPanel snapshot={snapshot} busy={busy} onPreview={temporary}
      onRequest={height} onCancel={() => controller.current?.abort()} />
      <section aria-label="三维预览"><ReliefPreview project={preview ?? snapshot} />
        <p>{preview ? '临时预览，尚未提交' : '已提交数据'} · revision {snapshot.revision} · 历史 {history.length}</p>
        <output aria-label="像素高度">{Array.from(snapshot.heights).join(',')}</output>
      </section>
      <ExportPanel snapshot={snapshot} devices={[snapshot.device]} busy={busy} progress={progress}
        onRequest={exportFiles} onCancel={() => controller.current?.abort()} />
    </div><details><summary>从输出文件独立检查 OBJ</summary><ObjInspector /></details></main>;
}
createRoot(document.getElementById('root')!).render(<CapabilityDemo />);
