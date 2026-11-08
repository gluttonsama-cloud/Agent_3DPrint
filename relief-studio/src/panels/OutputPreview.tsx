import { useEffect, useRef, useState } from 'react';
import type { ProjectSnapshot, OutputSettings, WhiteOptions } from '../contracts';

import { createCapabilityService } from '../capability-service';
import { encodeProject } from '../project-codec';

export function OutputPreview({ snapshot, settings, white, polarity, busy, onBusy }: { onBusy?: (busy: boolean) => void; polarity?: string; busy?: boolean; snapshot: ProjectSnapshot; settings: OutputSettings; white: WhiteOptions }) {
  const [whiteImage, setWhiteImage] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [layer, setLayer] = useState(1);
  useEffect(() => { setWhiteImage(''); }, [snapshot, settings, white, polarity]);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current, w = snapshot.width, h = snapshot.height;
    if (!el) return;
    const rotated = settings.rotation === 90 || settings.rotation === 270;
    el.width = rotated ? h : w; el.height = rotated ? w : h;
    const source = document.createElement('canvas'); source.width = w; source.height = h;
    const context = source.getContext('2d')!;
    const pixels = new Uint8ClampedArray(snapshot.colors);
    snapshot.labels.forEach((label, i) => { if (!label) pixels[i * 4 + 3] = 0; });
    context.putImageData(new ImageData(pixels, w, h), 0, 0);
    const target = el.getContext('2d')!;
    target.translate(el.width / 2, el.height / 2); target.rotate(settings.rotation * Math.PI / 180);
    target.scale(settings.mirror ? -1 : 1, 1); target.drawImage(source, -w / 2, -h / 2);
  }, [snapshot, settings]);
  const previewWidth = Math.min(320, 260 * (settings.rotation % 180 ? snapshot.height / snapshot.width : snapshot.width / snapshot.height));
  const size = settings.rotation % 180 ? [...snapshot.sizeMm].reverse() : snapshot.sizeMm;
  return <figure className="output-preview"><canvas ref={canvas} aria-label="输出方向预览" style={{ width: previewWidth, height: 'auto', imageRendering: 'pixelated' }} />
    <figcaption>彩图方向预览 · {size.join(' × ')} mm · {settings.order === 'white-first' ? '先白墨后彩色' : '先彩色后白墨'}<br />
      白墨：{white.mode === 'alpha' ? '按透明度覆盖' : white.mode === 'threshold' ? `透明度 ≥ ${white.threshold}` : '有效区域满覆盖'}；
      内缩 {white.insetMm} mm；偏移 {white.offsetXmm}, {white.offsetYmm} mm</figcaption><label>白墨层号<input type="number" min={1} max={256} disabled={busy} value={layer} onChange={e => { setLayer(Number(e.target.value)); setWhiteImage(''); }} /></label>
    <button disabled={busy || !window.reliefV2} onClick={() => {
      onBusy?.(true);
      void createCapabilityService(window.reliefV2!).production({ mode: 'preview', snapshot: encodeProject(snapshot), settings, whiteOptions: white, polarity, layer }).then(value => {
        if (value.status === 'success') { setWhiteImage((value.value as { image: string }).image); setPreviewError(''); }
        else setPreviewError(value.status === 'error' ? value.message : '预览取消');
      }).catch(e => setPreviewError(String(e))).finally(() => onBusy?.(false));
    }}>预览实际白墨层</button>{whiteImage && <img src={whiteImage} alt={`第 ${layer} 层白墨，已应用补偿、方向及极性`} style={{ width: previewWidth, maxWidth: '100%', height: 'auto', imageRendering: 'pixelated' }} />}
    {previewError && <p role="status">{previewError}</p>}</figure>;
}
