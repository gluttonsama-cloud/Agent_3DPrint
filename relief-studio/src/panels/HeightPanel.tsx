import { useState } from 'react';
import type { HeightOperation, HeightPanelProps } from '../contracts';

export function HeightPanel({ snapshot, selection, busy, onPreview, onRequest, onCancel }: HeightPanelProps) {
  const [layers, setLayers] = useState(10);
  const [radius, setRadius] = useState(2);
  const [factor, setFactor] = useState(1);
  const [mode, setMode] = useState<'uniform' | 'suggest'>('uniform');
  const [error, setError] = useState('');
  const request = (operation: HeightOperation) => {
    if (!Number.isFinite(layers) || layers < 0 || layers > 256 || !Number.isInteger(layers)) {
      setError('层数必须为 0–256 的整数'); return;
    }
    setError(''); onPreview(null); onRequest({ snapshot, selection, operation });
  };
  const ranges = new Map<number, [number, number]>();
  snapshot.labels.forEach((id, i) => {
    if (!id) return;
    const range = ranges.get(id) ?? [257, -1];
    range[0] = Math.min(range[0], snapshot.heights[i]);
    range[1] = Math.max(range[1], snapshot.heights[i]); ranges.set(id, range);
  });
  const summary = snapshot.regions.map(region => {
    const [min, max] = ranges.get(region.id) ?? [257, -1];
    return `${region.name}：${max < 0 ? '无像素' : min === max ? `${min} 层` : `混合高度 ${min}–${max} 层`}`;
  });
  return <section aria-label="高度面板">
    <h2>高度</h2>
    <p>{snapshot.heightMapping.kind === 'design' ? '设计高度：10 层 = 1 mm，未实测标定' : '使用已录入标定曲线'}</p>
    <label>模式<select value={mode} disabled={busy} onChange={e => setMode(e.target.value as typeof mode)}>
      <option value="uniform">均高</option><option value="suggest">保守结构建议</option>
    </select></label>
    <label>白墨层数<input type="number" min={0} max={256} value={layers} disabled={busy}
      onChange={e => setLayers(Number(e.target.value))} /></label>
    <input aria-label="临时高度预览" type="range" min={0} max={256} value={layers} disabled={busy}
      onChange={e => { const value = Number(e.target.value); setLayers(value); onPreview({ kind: 'set', layers: value }); }}
      onKeyDown={e => { if (e.key === 'Escape') onPreview(null); }} />
    <p>滑动预览手动设高；均高另按人工保护生成结果。点击应用才提交一次，0 层保留彩色。</p>
    <button disabled={busy} onClick={() => request({ kind: 'set', layers })}>应用选区高度</button>
    <button disabled={busy} onClick={() => request(mode === 'uniform' ? { kind: mode, layers }
      : { kind: mode, maxLayers: layers })}>应用{mode === 'uniform' ? '均高' : '结构建议'}</button>
    <button disabled={busy} onClick={() => request({ kind: 'add', delta: 1 })}>升高一层</button>
    <button disabled={busy} onClick={() => request({ kind: 'add', delta: -1 })}>降低一层</button>
    <button onClick={() => { onPreview(null); onCancel(); }}>取消</button>
    <details><summary>高级设置</summary>
      <label>整体比例<input type="number" min={0} max={256} step={0.1} value={factor}
        onChange={e => setFactor(Number(e.target.value))} /></label>
      <button disabled={busy || !Number.isFinite(factor) || factor < 0} onClick={() => request({ kind: 'scale', factor })}>应用比例</button>
      <label>处理半径（像素）<input type="number" min={1} max={64} value={radius}
        onChange={e => setRadius(Number(e.target.value))} /></label>
      <button disabled={busy || !Number.isInteger(radius) || radius < 1 || radius > 64}
        onClick={() => request({ kind: 'bevel', radiusPx: radius })}>内部倒角</button>
      <button disabled={busy || !Number.isInteger(radius) || radius < 1 || radius > 64}
        onClick={() => request({ kind: 'smooth', radiusPx: radius })}>区域平滑</button>
      <p>标定数据由设备阶梯试印录入；当前未测量时保持设计映射。</p>
    </details>
    <ul>{summary.map((line, i) => <li key={snapshot.regions[i].id}>{line}</li>)}</ul>
    {error && <p role="alert">{error}</p>}
  </section>;
}
