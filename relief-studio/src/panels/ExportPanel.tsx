import { useState } from 'react';
import type { ExportPanelProps, OutputSettings } from '../contracts';

export function ExportPanel({ snapshot, devices, busy, progress, onRequest, onCancel }: ExportPanelProps) {
  const [deviceId, setDeviceId] = useState(snapshot.device.id);
  const [jpg, setJpg] = useState(false);
  const [obj, setObj] = useState(false);
  const [directory, setDirectory] = useState('');
  const [settings, setSettings] = useState<OutputSettings>({ mirror: false, rotation: 0,
    order: 'white-first', whiteRepeats: 1, colorRepeats: 1 });
  const device = devices.find(item => item.id === deviceId) ?? snapshot.device;
  let max = 0;
  snapshot.heights.forEach(value => { max = Math.max(value, max); });
  const dpi = [snapshot.width / snapshot.sizeMm[0] * 25.4, snapshot.height / snapshot.sizeMm[1] * 25.4];
  return <section aria-label="导出面板">
    <h2>打印文件与模型</h2>
    <p>{snapshot.sizeMm.join(' × ')} mm · {max} 白墨层 · {dpi.map(v => v.toFixed(1)).join(' × ')} DPI</p>
    <label>设备<select disabled={busy} value={device.id} onChange={e => setDeviceId(e.target.value)}>
      {[snapshot.device, ...devices.filter(item => item.id !== snapshot.device.id)]
        .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    {!device.verified && <p>设备尚未验证，请先用阶梯图确认墨量、极性和层序。</p>}
    <p>始终保留 PNG 无损母版和独立彩色覆盖图。</p>
    <label><input type="checkbox" checked={jpg} disabled={busy} onChange={e => setJpg(e.target.checked)} />附加 JPG</label>
    <label><input type="checkbox" checked={obj} disabled={busy} onChange={e => setObj(e.target.checked)} />附加 OBJ 查看模型</label>
    <label>新输出目录<input value={directory} disabled={busy} onChange={e => setDirectory(e.target.value)} /></label>
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
    <button disabled={busy || !directory.trim()} onClick={() => onRequest({ snapshot, device,
      formats: jpg ? ['png', 'jpg'] : ['png'], obj, settings, outputDirectory: directory.trim() })}>导出</button>
    <button disabled={!busy} onClick={onCancel}>取消导出</button>
    {progress && <div role="status"><progress value={progress.completed} max={Math.max(1, progress.total)} />{progress.message}</div>}
  </section>;
}
