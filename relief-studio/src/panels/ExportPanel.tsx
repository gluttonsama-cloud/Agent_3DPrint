import { useEffect, useState } from 'react';
import type { ExportPanelProps, OutputSettings, ObjExportOptions, WhiteOptions, DeviceProfile } from '../contracts';

import { ProductionPanel } from './ProductionPanel';
import { OutputPreview } from './OutputPreview';

export function ExportPanel({ snapshot, devices, busy, progress, onRequest, onCancel, onBusy, onStl }: ExportPanelProps & { onBusy?: (busy: boolean) => void; onStl?: () => void }) {
  const [customDevice, setCustomDevice] = useState<DeviceProfile | null>(null);
  const [printFormat, setPrintFormat] = useState<'png' | 'jpg'>('png');
  const [white, setWhite] = useState<WhiteOptions>({ mode: 'solid', threshold: 1, insetMm: 0, offsetXmm: 0, offsetYmm: 0 });
  const [localError, setLocalError] = useState('');
  const [productionBusy, setProductionBusy] = useState(false);
  const [deviceId, setDeviceId] = useState(snapshot.device.id);
  const [jpg, setJpg] = useState(false);
  const [obj, setObj] = useState(false);
  const [mode, setMode] = useState<ObjExportOptions['mode']>('solid');
  const [base, setBase] = useState('1');
  const [repair, setRepair] = useState(false);
  const baseMm = Number(base);
  const validObj = !obj || mode === 'surface' || (base.trim() !== '' && Number.isFinite(baseMm) && baseMm >= 0 && baseMm <= 100);
  const [directory, setDirectory] = useState('');
  const [settings, setSettings] = useState<OutputSettings>({ mirror: false, rotation: 0,
    order: 'white-first', whiteRepeats: 1, colorRepeats: 1 });
  const device = customDevice ?? devices.find(item => item.id === deviceId) ?? snapshot.device;
  let max = 0;
  snapshot.heights.forEach(value => { max = Math.max(value, max); });
  const dpi = [snapshot.width / snapshot.sizeMm[0] * 25.4, snapshot.height / snapshot.sizeMm[1] * 25.4];
  const validSettings = [settings.whiteRepeats, settings.colorRepeats].every(v => Number.isInteger(v) && v >= 1 && v <= 256);
  const validWhite = Number.isFinite(white.threshold) && white.threshold >= 1 && white.threshold <= 255 && [white.insetMm, white.offsetXmm, white.offsetYmm].every(v => Number.isFinite(v) && Math.abs(v) <= 10);
  const outputRequest = { snapshot, device, formats: printFormat === 'jpg' ? ['jpg' as const] : jpg ? ['png' as const, 'jpg' as const] : ['png' as const],
    printFormat, whiteOptions: white, obj, objOptions: obj ? { mode, baseThicknessMm: baseMm, repairDiagonalContacts: repair } : undefined,
    settings, outputDirectory: directory.trim() };
  const saveProfile = () => {
    try { localStorage.setItem('relief-output-profile', JSON.stringify({ device, settings, white, printFormat, jpg })); setLocalError('设备方案已保存'); }
    catch (error) { setLocalError(String(error)); }
  };
  const loadProfile = () => {
    try {
      const value = JSON.parse(localStorage.getItem('relief-output-profile') ?? 'null');
      if (!value || !value.device || !value.settings || !value.white) throw new Error('没有保存的设备方案');
      setCustomDevice(value.device); setSettings(value.settings); setWhite(value.white); setPrintFormat(value.printFormat); setJpg(value.jpg);
      setLocalError('设备方案已恢复；更换墨水、材料或重复次数后需重新核对标定。');
    } catch (error) { setLocalError(String(error)); }
  };
  useEffect(() => { if (localStorage.getItem('relief-output-profile')) loadProfile(); }, []);
  let calibrationWarning = '';
  if (snapshot.heightMapping.kind === 'calibrated') {
    try {
      const record = JSON.parse(localStorage.getItem('relief-calibration') ?? 'null');
      if (!record || record.mapping.profileId !== snapshot.heightMapping.profileId) calibrationWarning = '未找到该曲线的墨水、材料与重复次数记录，请核对原标定条件。';
      else if (record.binding.deviceId !== device.id || JSON.stringify(record.binding.settings) !== JSON.stringify(settings)) calibrationWarning = `当前设备或打印参数与标定条件不一致；原材料：${record.binding.material}，墨水：${record.binding.ink}。`;
      else calibrationWarning = `标定材料：${record.binding.material}；墨水：${record.binding.ink}。更换任一条件请重新标定。`;
    } catch { calibrationWarning = '标定绑定记录损坏，请重新确认材料与墨水。'; }
  }
  return <section aria-label="导出面板">
    <h2>打印文件与模型</h2>
    <p>{snapshot.sizeMm.join(' × ')} mm · {max} 白墨层 · {dpi.map(v => v.toFixed(1)).join(' × ')} DPI</p>
    {devices.length > 1 && <label>设备<select disabled={busy} value={device.id} onChange={e => setDeviceId(e.target.value)}>
      {[snapshot.device, ...devices.filter(item => item.id !== snapshot.device.id)]
        .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>}
    {!device.verified && <p>设备尚未验证，请先用阶梯图确认墨量、极性和层序。</p>}
    <details><summary>设备方案与色彩</summary><fieldset disabled={busy}>
      <label>设备名称<input value={device.name} onChange={e => setCustomDevice({ ...device, name: e.target.value, id: customDevice?.id ?? crypto.randomUUID(), verified: false })} /></label>
      <label>白墨极性<select value={device.whitePolarity} onChange={e => setCustomDevice({ ...device, whitePolarity: e.target.value as DeviceProfile['whitePolarity'], verified: false })}>
        <option value="unknown">未知</option><option value="white-is-ink">白色有墨</option><option value="black-is-ink">黑色有墨</option></select></label>
      <label>RIP 自动白底<select value={device.automaticWhite} onChange={e => setCustomDevice({ ...device, automaticWhite: e.target.value as DeviceProfile['automaticWhite'], verified: false })}>
        <option value="unknown">未知</option><option value="enabled">开启</option><option value="disabled">关闭</option></select></label>
      <label>色彩空间<select value={device.colorSpace} onChange={e => { const colorSpace = e.target.value as DeviceProfile['colorSpace']; setCustomDevice({ ...device, colorSpace }); if (colorSpace === 'CMYK') setPrintFormat('jpg'); }}>
        <option>RGB</option><option>CMYK</option></select></label>
      <label>ICC 文件路径<input value={device.iccPath ?? ''} onChange={e => setCustomDevice({ ...device, iccPath: e.target.value || null })} /></label>
      <button onClick={saveProfile}>保存设备方案</button><button onClick={loadProfile}>恢复设备方案</button>
    </fieldset></details>
    <p>始终保留 PNG 无损母版和独立彩色覆盖图。</p>
    <label>实际打印格式<select disabled={busy} value={printFormat} onChange={e => setPrintFormat(e.target.value as 'png' | 'jpg')}>
      <option value="png" disabled={device.colorSpace === 'CMYK'}>PNG 无损</option><option value="jpg">JPG（有损）</option></select></label>
    <label><input type="checkbox" checked={jpg} disabled={busy} onChange={e => setJpg(e.target.checked)} />附加 JPG 参考副本（不改变打印清单）</label>
    <label><input type="checkbox" checked={obj} disabled={busy} onChange={e => setObj(e.target.checked)} />附加 OBJ 查看模型</label>
    {obj && <fieldset disabled={busy}><legend>OBJ 模型</legend>
      <label>模型类型<select aria-label="OBJ 模型类型" value={mode} onChange={e => setMode(e.target.value as ObjExportOptions['mode'])}>
        <option value="solid">封闭实体（可用于切片）</option><option value="surface">表面查看（无封闭底面）</option>
      </select></label>
      {mode === 'solid' && <>
        <label>矩形底板厚度（mm）<input aria-label="OBJ 底板厚度" type="number" min={0} max={100} step="any" value={base} onChange={e => setBase(e.target.value)} /></label>
        <p>底板覆盖完整矩形画幅；设为 0 时零高度像素不生成实体。使用工程逐像素高度及标定曲线。</p>
        <label><input type="checkbox" checked={repair} onChange={e => setRepair(e.target.checked)} />修复 OBJ 像素角点连接</label>
        <small>仅修改输出模型，可能增加局部材料；工程与打印母版不变。封闭不等于已通过实际打印验证。</small>
      </>}
    </fieldset>}
    {onStl && <button disabled={busy} onClick={onStl}>实体模型 STL…</button>}
    <p>设计／标定参考最大高度：{(snapshot.heightMapping.kind === 'calibrated' ? snapshot.heightMapping.mmByLayer[max] : max * snapshot.heightMapping.mmPerLayer).toFixed(3)} mm；OBJ 底板 {Number.isFinite(baseMm) ? baseMm : '—'} mm。</p>
    <label>输出父目录<input value={directory} disabled={busy} onChange={e => setDirectory(e.target.value)} /></label>
    <button disabled={busy || !window.reliefV2?.chooseDirectory} onClick={() => { void window.reliefV2?.chooseDirectory?.().then(value => { if (value) setDirectory(value); }).catch(error => setLocalError(String(error))); }}>选择目录…</button>
    <details><summary>打印适配设置</summary>
      <label><input type="checkbox" checked={settings.mirror} disabled={busy}
        onChange={e => setSettings({ ...settings, mirror: e.target.checked })} />水平镜像</label>
      <label>顺时针旋转<select value={settings.rotation} disabled={busy}
        onChange={e => setSettings({ ...settings, rotation: Number(e.target.value) as OutputSettings['rotation'] })}>
        {[0, 90, 180, 270].map(value => <option key={value} value={value}>{value}°</option>)}
      </select></label>
      <label>打印顺序<select value={settings.order} disabled={busy}
        onChange={e => setSettings({ ...settings, order: e.target.value as OutputSettings['order'] })}>
        <option value="white-first">白墨后彩色</option><option value="color-first">彩色后白墨</option>
      </select></label>
      <label>白墨每图次数<input type="number" min={1} max={256} value={settings.whiteRepeats} disabled={busy}
        onChange={e => setSettings({ ...settings, whiteRepeats: Number(e.target.value) })} /></label>
      <label>彩色次数<input type="number" min={1} max={256} value={settings.colorRepeats} disabled={busy}
        onChange={e => setSettings({ ...settings, colorRepeats: Number(e.target.value) })} /></label>
      <p>重复次数仅影响任务清单，不能据此推断实测毫米高度；请核对设备设置。</p>
    </details>
    <fieldset disabled={busy}><legend>白墨边缘与套准</legend>
      <label>半透明覆盖<select value={white.mode} onChange={e => setWhite({ ...white, mode: e.target.value as WhiteOptions['mode'] })}>
        <option value="solid">有效区域满覆盖</option><option value="alpha">按透明度覆盖</option><option value="threshold">按阈值取舍</option></select></label>
      {(['threshold', 'insetMm', 'offsetXmm', 'offsetYmm'] as const).map((key,i) => <label key={key}>{['透明度阈值 1–255', '白墨内缩 mm（负值扩张）','白墨 X 偏移 mm','白墨 Y 偏移 mm'][i]}
        <input type="number" step="any" value={white[key]} onChange={e => setWhite({ ...white, [key]: Number(e.target.value) })} /></label>)}
    </fieldset>
    <OutputPreview snapshot={snapshot} settings={settings} white={white} polarity={device.whitePolarity} busy={busy} onBusy={onBusy} />
    <ul aria-label="输出前检查">
      {calibrationWarning && <li>{calibrationWarning}</li>}
      {!device.verified && <li>设备未验证；请先试印。</li>}
      {device.whitePolarity === 'unknown' && <li>极性未知：暂按白色有墨输出。</li>}
      {device.automaticWhite !== 'disabled' && <li>自动白底为{device.automaticWhite === 'enabled' ? '开启' : '未知'}，可能改变白墨覆盖。</li>}
      {(jpg || printFormat === 'jpg') && <li>JPG 有损，输出后查看轮廓检查。</li>}
      {device.colorSpace === 'CMYK' && !device.iccPath && <li>CMYK 需要有效 ICC 文件。</li>}
      {!validSettings && <li>打印次数须为 1–256 的整数。</li>}
      {!validWhite && <li>阈值须为 1–255，补偿和偏移须在 ±10 mm 内。</li>}
    </ul>
    <button disabled={busy || !directory.trim() || !validObj || !validSettings || !validWhite || (device.colorSpace === 'CMYK' && (!device.iccPath || printFormat !== 'jpg'))} onClick={() => {
      const name = snapshot.name.replace(/[^\w\u4e00-\u9fff-]/g, '_').slice(0, 60) || '工程';
      onRequest({ ...outputRequest, outputDirectory: `${directory.trim()}/${name}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}` });
    }}>生成打印交付包</button>
    <button disabled={!busy || productionBusy} onClick={onCancel}>取消导出</button>
    <details><summary>拼版、批量与试印</summary><ProductionPanel request={outputRequest} busy={busy}
      onBusy={value => { setProductionBusy(value); onBusy?.(value); }} /></details>
    {localError && <p role="status">{localError}</p>}
    {progress && <div role="status"><progress value={progress.completed} max={Math.max(1, progress.total)} />{progress.message}</div>}
  </section>;
}
