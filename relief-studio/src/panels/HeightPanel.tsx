import { useMemo, useState } from 'react';
import type { HeightOperation, HeightPanelProps } from '../contracts';

export function HeightPanel({ snapshot, selection, busy, onPreview, onRequest, onCancel }: HeightPanelProps) {
  const [layers, setLayers] = useState(10);
  const [radius, setRadius] = useState(2);
  const [factor, setFactor] = useState(1);
  const [mode, setMode] = useState<'uniform' | 'suggest'>('uniform');
  const [error, setError] = useState('');
  const request = (operation: HeightOperation) => {
    if (['set', 'uniform', 'suggest'].includes(operation.kind) &&
        (!Number.isFinite(layers) || layers < 0 || layers > 256 || !Number.isInteger(layers))) {
      setError('层数必须为 0–256 的整数'); return;
    }
    setError(''); onPreview(null); onRequest({ snapshot, selection, operation });
  };
  const summary = useMemo(() => {
  const ranges = new Map<number, [number, number]>();
  snapshot.labels.forEach((id, i) => {
    if (!id) return;
    const range = ranges.get(id) ?? [257, -1];
    range[0] = Math.min(range[0], snapshot.heights[i]);
    range[1] = Math.max(range[1], snapshot.heights[i]); ranges.set(id, range);
  });
  return snapshot.regions.map(region => {
    const [min, max] = ranges.get(region.id) ?? [257, -1];
    return `${region.name}：${max < 0 ? '无像素' : min === max ? `${min} 层` : `混合高度 ${min}–${max} 层`}`;
  });
  }, [snapshot.labels, snapshot.heights, snapshot.regions]);
  const validLayers = Number.isInteger(layers) && layers >= 0 && layers <= 256;
  const scope = selection ? `选中 ${selection.data.reduce((sum, value) => sum + (value ? 1 : 0), 0).toLocaleString()} 像素` : '全部打印区域';
  return <section className="height-panel" aria-label="高度面板">
    <div className="height-scope"><span>作用范围</span><strong>{scope}</strong></div>
    <label className="height-value">白墨层数
      <input type="number" min={0} max={256} value={Number.isFinite(layers) ? layers : ''} disabled={busy}
        onChange={e => { setLayers(e.target.value === '' ? NaN : Number(e.target.value)); onPreview(null); }} />
    </label>
    <input aria-label="临时高度预览" type="range" min={0} max={256} value={Number.isFinite(layers) ? layers : 0} disabled={busy}
      onChange={e => { const value = Number(e.target.value); setLayers(value); onPreview({ kind: 'set', layers: value }); }}
      onKeyDown={e => { if (e.key === 'Escape') onPreview(null); }} />
    <div className="height-scale"><span>0 层</span><span>256 层</span></div>
    <p className="height-note">滑动预览，应用后生效。0 层保留彩色。</p>
    <button className="primary full-button" aria-label="应用选区高度" disabled={busy || !validLayers}
      onClick={() => request({ kind: 'set', layers })}>{selection ? '应用到选区' : '应用到全部区域'}</button>
    <div className="height-actions">
      <button disabled={busy} onClick={() => request({ kind: 'add', delta: -1 })}>降低一层</button>
      <button disabled={busy} onClick={() => request({ kind: 'add', delta: 1 })}>升高一层</button>
    </div>
    <button className="text-button full-button" aria-label="取消" onClick={() => { onPreview(null); onCancel(); }}>
      {busy ? '取消处理' : '取消预览'}
    </button>
    <details className="height-advanced"><summary>高级处理</summary>
      <label className="stack-field">自动处理<select aria-label="自动处理" value={mode} disabled={busy} onChange={e => setMode(e.target.value as typeof mode)}>
        <option value="uniform">均高</option><option value="suggest">轮廓层级建议</option>
      </select></label>
      {mode === 'suggest' && <p className="height-note">只参考闭合轮廓，不识别文字或真实立体结构。层级不明确时保持原高。</p>}
      <button className="full-button" disabled={busy || !validLayers} onClick={() => request(mode === 'uniform' ? { kind: mode, layers }
        : { kind: mode, maxLayers: layers })}>应用{mode === 'uniform' ? '均高' : '结构建议'}</button>
      <label className="stack-field">整体比例<input type="number" min={0} max={256} step={0.1} value={factor} disabled={busy}
        onChange={e => setFactor(Number(e.target.value))} /></label>
      <button className="full-button" disabled={busy || !Number.isFinite(factor) || factor < 0} onClick={() => request({ kind: 'scale', factor })}>应用比例</button>
      <label className="stack-field">处理半径（像素）<input type="number" min={1} max={64} value={radius} disabled={busy}
        onChange={e => setRadius(Number(e.target.value))} /></label>
      <div className="height-actions">
        <button disabled={busy || !Number.isInteger(radius) || radius < 1 || radius > 64}
          onClick={() => request({ kind: 'bevel', radiusPx: radius })}>内部倒角</button>
        <button disabled={busy || !Number.isInteger(radius) || radius < 1 || radius > 64}
          onClick={() => request({ kind: 'smooth', radiusPx: radius })}>区域平滑</button>
      </div>
    </details>
    <details className="height-advanced"><summary>区域高度明细</summary>
      <ul className="height-summary">{summary.map((line, i) => <li key={snapshot.regions[i].id}>{line}</li>)}</ul>
    </details>
    <p className="height-note" title="实际打印厚度取决于设备、材料和标定数据">
      {snapshot.heightMapping.kind === 'design' ? '设计参考：10 层 ≈ 1 mm · 未标定' : '已使用设备标定曲线'}
    </p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
