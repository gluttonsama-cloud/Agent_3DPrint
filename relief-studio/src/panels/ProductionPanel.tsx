import { useRef, useState } from 'react';
import type { ExportRequest, ProjectSnapshot } from '../contracts';
import { createCapabilityService, type Progress } from '../capability-service';
import { encodeProject, decodeProject } from '../project-codec';

type Item = { snapshot: ProjectSnapshot; xMm: number; yMm: number; rotation: number; quantity: number };
type BatchResult = { outputDirectory: string; entries: { id: number; name: string; status: string; error?: string }[]; cancelled: boolean };
export function ProductionPanel({ request, onBusy, busy }: { request: ExportRequest; onBusy?: (busy: boolean) => void; busy: boolean }) {
  const [inspection, setInspection] = useState<{ overlay: string; maxThicknessMm: number; repairedPixels: number; addedVolumeMm3: number; holesBefore: number; holesAfter: number; thinPixels: number; note: string; sideProfileMm: number[] } | null>(null);
  const [minimum, setMinimum] = useState(0.3);
  const [trialKind, setTrialKind] = useState('height');
  const [trialRecord, setTrialRecord] = useState('');
  const [photos, setPhotos] = useState('');
  const [measurements, setMeasurements] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [size, setSize] = useState([200, 200]);
  const [density, setDensity] = useState(5);
  const [gap, setGap] = useState(2);
  const [marks, setMarks] = useState(false);
  const [layout, setLayout] = useState<ProjectSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [record, setRecord] = useState('');
  const [ids, setIds] = useState('1');
  const [rates, setRates] = useState(['', '', '', '', '']);
  const [ink, setInk] = useState(''); const [material, setMaterial] = useState('');
  const [points, setPoints] = useState('0:0,10:1');
  const [calibrated, setCalibrated] = useState<ProjectSnapshot | null>(null);
  const controller = useRef<AbortController | null>(null);
  const service = () => {
    if (!window.reliefV2) throw new Error('生产操作需要桌面版');
    return createCapabilityService(window.reliefV2, setProgress);
  };
  const trialSummary = (value: unknown) => (value as { trials: { outputDirectory?: string; error?: string; name?: string }[] }).trials
    .map((item, i) => `${i + 1}. ${item.error ? '失败：' + item.error : '试印文件：' + item.outputDirectory}`).join('\n');
  const selected = calibrated ?? request.snapshot;
  async function run(action: () => Promise<void>) {
    controller.current = new AbortController(); onBusy?.(true); setMessage(''); setProgress(null);
    try { await action(); } catch (error) { setMessage(String(error)); }
    finally { controller.current = null; onBusy?.(false); }
  }
  async function execute(payload: Record<string, unknown>) {
    const value = await service().production(payload, controller.current?.signal);
    if (value.status !== 'success') throw new Error(value.status === 'error' ? value.message : '已取消');
    return value.value;
  }
  const common = { parentDirectory: request.outputDirectory, settings: request.settings, device: request.device,
    formats: request.formats, printFormat: request.printFormat, whiteOptions: request.whiteOptions };
  const entry = (snapshot: ProjectSnapshot) => ({ name: snapshot.name, snapshot: encodeProject(snapshot) });
  const update = (index: number, patch: Partial<Item>) => { setItems(items.map((item, i) => i === index ? { ...item, ...patch } : item)); setLayout(null); };
  async function batch(entries: ReturnType<typeof entry>[]) {
    const output = await execute({ ...common, mode: 'batch', entries }) as BatchResult;
    setResult(output); setRecord(`${output.outputDirectory}/batch.json`);
  }
  return <section aria-label="批量生产"><h3>拼版与批量任务</h3>
    <p>使用上方设备、打印格式、白墨与方向配置。每项独立保存，失败项可按交付记录补打。</p>
    <fieldset disabled={busy}>
      <button onClick={() => { setItems([...items, { snapshot: selected, xMm: 5, yMm: 5, rotation: 0, quantity: 1 }]); setLayout(null); }}>加入当前工程</button>
      <button onClick={() => void run(async () => {
        const paths = await window.reliefV2?.chooseProjects?.() ?? [];
        const added: Item[] = [];
        for (const path of paths) {
          const value = await service().open(path);
          if (value.status !== 'success') throw new Error(value.status === 'error' ? value.message : '取消打开');
          added.push({ snapshot: value.value.snapshot, xMm: 5, yMm: 5, rotation: 0, quantity: 1 });
        }
        setItems(previous => [...previous, ...added]); setLayout(null);
      })}>导入多个工程</button>
      {items.map((item, i) => <div className="production-item" key={i}>
        <strong>{i + 1}. {item.snapshot.name} · {item.snapshot.sizeMm.join(' × ')} mm</strong>
        {(['xMm', 'yMm', 'quantity'] as const).map((key, k) => <label key={key}>{['X (mm)', 'Y (mm)', '数量'][k]}<input type="number" min={key === 'quantity' ? 1 : 0} max={key === 'quantity' ? 100 : 10000}
          value={item[key]} onChange={e => update(i, { [key]: Number(e.target.value) })} /></label>)}
        <label>旋转<select value={item.rotation} onChange={e => update(i, { rotation: Number(e.target.value) })}>{[0,90,180,270].map(v => <option key={v}>{v}</option>)}</select></label>
        <button onClick={() => { setItems(items.filter((_, n) => n !== i)); setLayout(null); }}>移除</button>
      </div>)}
      <p>重复件从指定位置向右排列，间距按下方设置；超出版面或相交会报错。</p>
      {size.map((v, i) => <label key={i}>工作台{['宽','高'][i]} (mm)<input type="number" value={v} onChange={e => { setSize(size.map((n,k) => k === i ? Number(e.target.value) : n)); setLayout(null); }} /></label>)}
      <label>间距 (mm)<input type="number" min={0} value={gap} onChange={e => { setGap(Number(e.target.value)); setLayout(null); }} /></label>
      <label>采样 (px/mm)<input type="number" min={0.01} value={density} onChange={e => { setDensity(Number(e.target.value)); setLayout(null); }} /></label>
      <label><input type="checkbox" checked={marks} onChange={e => { setMarks(e.target.checked); setLayout(null); }} />四角定位标记（预留边距）</label>
      <button disabled={!items.length} onClick={() => void run(async () => {
        if (items.some(i => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100)) throw new Error('数量必须为 1..100 的整数');
        const placed = items.flatMap(item => Array.from({ length: item.quantity }, (_, i) => ({ snapshot: encodeProject(item.snapshot),
          rotation: item.rotation, xMm: item.xMm + i * ((item.rotation % 180 ? item.snapshot.sizeMm[1] : item.snapshot.sizeMm[0]) + gap), yMm: item.yMm })));
        const output = await execute({ mode: 'layout', items: placed, sizeMm: size, pixelsPerMm: density, gapMm: gap, marks }) as { snapshot: unknown };
        setLayout(decodeProject(output.snapshot)); setMessage('拼版检查通过，可导出整版。采样会改变细节，请检查版面。');
      })}>生成并检查拼版</button>
      <button onClick={() => { try { localStorage.setItem('relief-fixture', JSON.stringify({ size, density, gap, marks, placements: items.map(({ snapshot, ...rest }) => ({ name: snapshot.name, ...rest })) })); setMessage('治具位置已保存'); } catch (e) { setMessage(String(e)); } }}>保存治具位置</button>
      <button onClick={() => { try {
        const value = JSON.parse(localStorage.getItem('relief-fixture') ?? 'null');
        if (!value || value.placements.length !== items.length || value.placements.some((p: { name: string }, i: number) => p.name !== items[i].snapshot.name)) throw new Error('请先按原顺序导入相同名称的工程');
        setSize(value.size); setDensity(value.density); setGap(value.gap); setMarks(value.marks);
        setItems(items.map((item, i) => ({ ...item, ...value.placements[i] }))); setLayout(null);
      } catch (e) { setMessage(String(e)); } }}>载入治具位置</button>
      <button disabled={!layout || !request.outputDirectory} onClick={() => void run(() => batch([entry(layout!)]))}>导出整版</button>
      <button disabled={!items.length || !request.outputDirectory} onClick={() => void run(async () => {
        if (items.some(i => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100)) throw new Error('数量必须为 1..100 的整数');
        await batch(items.flatMap(item => Array.from({ length: item.quantity }, () => entry(item.snapshot))));
      })}>逐件批量输出</button>
    </fieldset>
    {layout && <svg viewBox={`0 0 ${size[0]} ${size[1]}`} role="img" aria-label="拼版位置预览" style={{ width: '100%', maxHeight: 260, background: '#eee' }}>
      {items.flatMap((item,i) => Array.from({ length: Math.min(100, Math.max(0, item.quantity)) }, (_, n) => {
        const [w,h] = item.rotation % 180 ? [...item.snapshot.sizeMm].reverse() : item.snapshot.sizeMm;
        return <g key={`${i}-${n}`}><rect x={item.xMm+n*(w+gap)} y={item.yMm} width={w} height={h} fill="#93c5fd" stroke="#172554" strokeWidth={0.3}/><text x={item.xMm+n*(w+gap)+1} y={item.yMm+4} fontSize={3}>{i+1}.{n+1}</text></g>;
      }))}</svg>}
    <details><summary>补打与失败重试</summary><fieldset disabled={busy}>
      <label>交付记录 batch.json<input value={record} onChange={e => setRecord(e.target.value)} /></label>
      <button onClick={() => void run(async () => { const files = await window.reliefV2?.chooseProjects?.(); if (files?.[0]) setRecord(files[0]); })}>选择交付记录</button>
      <label>补打作品编号（从 1 开始，逗号分隔）<input value={ids} onChange={e => setIds(e.target.value)} /></label>
      <button disabled={!record || !request.outputDirectory} onClick={() => void run(async () => {
        const value = await execute({ mode: 'reprint', recordPath: record, ids: ids.split(',').map(v => Number(v.trim())-1), parentDirectory: request.outputDirectory });
        setResult(value as BatchResult);
      })}>按原参数补打</button>
    </fieldset></details>
    <details><summary>试印与用量估算</summary><fieldset disabled={busy}>
      <label>试印变量<select value={trialKind} onChange={e => setTrialKind(e.target.value)}><option value="height">层数 80% / 100% / 120%</option><option value="white">满覆盖 / 透明度 / 阈值</option><option value="edge">边缘扩张 0.1 / 原样 / 内缩 0.1 mm</option></select></label><p>每组保存参数记录；单组失败不影响其余样件。</p>
      <button disabled={!request.outputDirectory} onClick={() => void run(async () => {
        const value = await execute({ ...common, mode: 'trial', snapshot: encodeProject(selected), variants: trialKind === 'height' ? [0.8,1,1.2].map(heightFactor => ({ name: `试印-${heightFactor}`, heightFactor, whiteOptions: request.whiteOptions })) : trialKind === 'white' ? ['solid','alpha','threshold'].map(mode => ({ name: `覆盖-${mode}`, whiteOptions: { ...request.whiteOptions, mode, threshold: 128 } })) : [-0.1,0,0.1].map(insetMm => ({ name: `边缘-${insetMm}`, whiteOptions: { ...request.whiteOptions, insetMm } })) });
        setMessage(trialSummary(value));
      })}>生成三组试印</button>
      {['白墨 ml/mm²·遍','彩墨 ml/mm²·遍','每遍秒数','准备秒数','每 ml 成本'].map((label,i) => <label key={label}>{label}<input type="number" min={0} step="any" value={rates[i]} onChange={e => setRates(rates.map((v,k) => k === i ? e.target.value : v))} /></label>)}
      <button onClick={() => void run(async () => {
        const coefficients = rates.every(v => v.trim() !== '') ? Object.fromEntries(['whiteMlPerMm2','colorMlPerMm2','secondsPerPass','setupSeconds','costPerMl'].map((key,i) => [key,Number(rates[i])])) : undefined;
        const output = await execute({ mode: 'estimate', snapshot: encodeProject(layout ?? selected), settings: request.settings, whiteOptions: request.whiteOptions, rates: coefficients }) as { whiteAreaMm2Passes: number; colorAreaMm2Passes: number; passes: number; inkMl: number | null; seconds: number | null; cost: number | null; status: string };
        setMessage(`白墨 ${output.whiteAreaMm2Passes.toFixed(2)} mm²·遍；彩墨 ${output.colorAreaMm2Passes.toFixed(2)} mm²·遍；${output.passes} 遍。\n耗材 ${output.inkMl ?? '未估算'} ml；时间 ${output.seconds ?? '未估算'} 秒；成本 ${output.cost ?? '未估算'}。\n${output.status}`);
      })}>估算当前作品／拼版</button>
    </fieldset></details>
    <details><summary>模型检查与独立重试</summary><fieldset disabled={busy}>
      <label>最小平面细节 (mm)<input type="number" min={0.001} value={minimum} onChange={e => setMinimum(Number(e.target.value))} /></label>
      <p>使用上方 OBJ 底板与修复选项；未启用附加 OBJ 时按无底板、不修复检查。</p>
      <button onClick={() => void run(async () => {
        const value = await execute({ mode: 'inspect', snapshot: encodeProject(selected), objOptions: request.objOptions, minimumMm: minimum });
        setInspection(value as NonNullable<typeof inspection>);
      })}>检查修复与细节</button>
      <button disabled={!request.outputDirectory} onClick={() => void run(async () => {
        const value = await execute({ mode: 'model', snapshot: encodeProject(selected), objOptions: request.objOptions, parentDirectory: request.outputDirectory }) as { outputDirectory: string };
        setMessage(`模型独立导出完成：${value.outputDirectory}`);
      })}>仅导出／重试 OBJ</button>
    </fieldset>{inspection && <figure><img src={inspection.overlay} alt="修复与平面细节风险位置" style={{ maxWidth: '100%', maxHeight: 300 }} />
      <figcaption>{inspection.note}<br />总厚度 {inspection.maxThicknessMm.toFixed(3)} mm；修复 {inspection.repairedPixels} 像素；新增体积 {inspection.addedVolumeMm3.toFixed(4)} mm³；贯通孔 {inspection.holesBefore} → {inspection.holesAfter}；平面风险 {inspection.thinPixels} 像素。</figcaption>
      <svg viewBox={`0 0 ${inspection.sideProfileMm.length} ${Math.max(1, inspection.maxThicknessMm)}`} preserveAspectRatio="none" style={{ width: '100%', height: 100 }} role="img" aria-label="沿 X 方向最大高度侧视图">
        <polyline points={inspection.sideProfileMm.map((v,i) => `${i},${inspection.maxThicknessMm-v}`).join(' ')} fill="none" stroke="#facc15" strokeWidth="0.05" />
      </svg></figure>}</details>
    <details><summary>记录试印结果与工艺方案</summary><fieldset disabled={busy}>
      <label>试印 trial.json 路径<input value={trialRecord} onChange={e => setTrialRecord(e.target.value)} /></label>
      <button onClick={() => void run(async () => { const files = await window.reliefV2?.chooseProjects?.(); if (files?.[0]) setTrialRecord(files[0]); })}>选择试印记录</button>
      <label>实物照片本地路径（每行一张）<textarea value={photos} onChange={e => setPhotos(e.target.value)} /></label>
      <label>实测厚度 mm（逗号分隔）<input value={measurements} onChange={e => setMeasurements(e.target.value)} /></label>
      <button disabled={!trialRecord} onClick={() => void run(async () => {
        const value = await execute({ mode: 'record-trial', recordPath: trialRecord, photoPaths: photos.split('\n').map(v => v.trim()).filter(Boolean),
          measurements: measurements.trim() ? measurements.split(',').map(Number) : [], selected: true }) as { variant: unknown };
        localStorage.setItem('relief-process-profile', JSON.stringify(value.variant)); setMessage('照片、测量与工艺参数已记录；选定方案已保存。');
      })}>保存并选为工艺方案</button>
      <button disabled={!request.outputDirectory} onClick={() => void run(async () => {
        const variant = JSON.parse(localStorage.getItem('relief-process-profile') ?? 'null');
        if (!variant) throw new Error('尚未选择工艺方案');
        const value = await execute({ ...common, mode: 'trial', snapshot: encodeProject(selected), variants: [variant] }); setMessage(trialSummary(value));
      })}>用选定方案输出当前作品</button>
    </fieldset></details>
    <details><summary>设备与材料标定</summary><fieldset disabled={busy}>
      <label>墨水<input value={ink} onChange={e => setInk(e.target.value)} /></label><label>材料<input value={material} onChange={e => setMaterial(e.target.value)} /></label>
      <button disabled={!request.outputDirectory} onClick={() => void run(async () => {
        const value = await execute({ mode: 'chart', snapshot: encodeProject(selected) }) as { snapshot: unknown };
        await batch([entry(decodeProject(value.snapshot))]);
      })}>输出阶梯样件</button>
      <label>实测“层数:毫米”，逗号分隔<input value={points} onChange={e => setPoints(e.target.value)} /></label>
      <button disabled={!ink.trim() || !material.trim()} onClick={() => void run(async () => {
        const output = await execute({ mode: 'calibration', snapshot: encodeProject({ ...selected, device: request.device }), profileId: crypto.randomUUID(), ink, material, settings: request.settings,
          points: points.split(',').map(value => { const [layer,mm] = value.split(':').map(Number); return { layer,mm }; }) }) as { snapshot: unknown; calibration: unknown };
        const project = decodeProject(output.snapshot);
        const saved = await service().save(project);
        if (saved.status !== 'success') throw new Error(saved.status === 'error' ? saved.message : '保存取消；标定未应用');
        localStorage.setItem('relief-calibration', JSON.stringify(output.calibration)); setCalibrated(project);
        setMessage('标定工程已另存；“加入当前工程”将使用该曲线。上方单件输出仍使用原工程，需重新打开标定工程后使用。');
      })}>应用曲线并另存工程</button>
    </fieldset></details>
    {busy && <button onClick={() => controller.current?.abort()}>取消生产任务</button>}
    {progress && <p role="status">{progress.message} ({progress.completed.toFixed(1)}/{progress.total})</p>}
    {message && <pre role="status" style={{ whiteSpace: 'pre-wrap' }}>{message}</pre>}
    {result && <div role="status"><p>{result.cancelled ? '批次已停止，已完成文件保留' : '批次处理完成'}：{result.outputDirectory}</p>
      <button onClick={() => void window.reliefV2?.openDirectory?.(result.outputDirectory).catch(e => setMessage(String(e)))}>打开文件夹</button>
      {result.entries.map(item => <p key={item.id}>{item.id+1}. {item.name}：{item.status} {item.error}
        {item.status !== 'success' && <button disabled={busy} onClick={() => { setRecord(`${result.outputDirectory}/batch.json`); setIds(String(item.id+1)); setMessage('已选中重试项，请点“按原参数补打”'); }}>选择重试</button>}</p>)}</div>}
  </section>;
}
