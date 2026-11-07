import { useEffect, useRef, useState } from 'react';
import { loadImage } from './image';
import { moveCrop, resizeCrop, workSize, type CropRect, type CropState, type Handle } from './crop';

interface Props {
  image: string;
  initial?: CropState;
  onCancel(): void;
  onConfirm(image: string, state: CropState): void;
}

export function CropDialog({ image, initial, onCancel, onConfirm }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ start: [number, number]; rect: CropRect; mode: Handle | 'move' | 'draw' } | null>(null);
  const [rect, setRect] = useState<CropRect>(initial?.rect ?? [0, 0, 1, 1]);
  const [circle, setCircle] = useState(initial?.circle ?? false);
  const [locked, setLocked] = useState(initial?.locked ?? false);
  const [size, setSize] = useState<[number, number]>([1, 1]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    loadImage(image).then(img => {
      if (!alive) return;
      original.current = img;
      const c = canvas.current!;
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      setSize([img.width, img.height]);
      setRect(initial?.rect ?? [0, 0, img.width, img.height]);
      setReady(true);
    }).catch(() => { if (alive) setError('图片加载失败，请返回重新导入。'); });
    return () => { alive = false; };
  }, [image]);
  const point = (event: React.PointerEvent): [number, number] => {
    const box = canvas.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(size[0], Math.round((event.clientX - box.left) / box.width * size[0]))),
      Math.max(0, Math.min(size[1], Math.round((event.clientY - box.top) / box.height * size[1]))),
    ];
  };
  const begin = (event: React.PointerEvent, mode: Handle | 'move' | 'draw') => {
    if (!ready) return;
    event.stopPropagation();
    const start = point(event);
    if (mode === 'draw') { start[0] = Math.min(start[0], size[0] - 1); start[1] = Math.min(start[1], size[1] - 1); }
    drag.current = { start, rect: [...rect], mode };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const [x, y] = point(event), [sx, sy] = active.start;
    if (active.mode === 'move') setRect(moveCrop(active.rect, x - sx, y - sy, ...size));
    else if (active.mode === 'draw') {
      if (locked) {
        const handle: Handle = y < sy ? (x < sx ? 'nw' : 'ne') : (x < sx ? 'sw' : 'se');
        const base: CropRect = [x < sx ? sx - active.rect[2] : sx,
          y < sy ? sy - active.rect[3] : sy, active.rect[2], active.rect[3]];
        setRect(resizeCrop(base, handle, x, y, ...size, true));
      } else setRect([
        Math.min(sx, x), Math.min(sy, y), Math.max(1, Math.abs(x - sx)), Math.max(1, Math.abs(y - sy)),
      ]);
    }
    else setRect(resizeCrop(active.rect, active.mode, x, y, ...size, locked));
  };
  const end = () => { drag.current = null; };
  const confirm = () => {
    if (!ready || !original.current) return;
    try {
      const [x, y, width, height] = rect;
      const out = document.createElement('canvas');
      [out.width, out.height] = workSize(width, height);
      const ctx = out.getContext('2d')!;
      if (circle) {
        ctx.beginPath();
        ctx.ellipse(out.width / 2, out.height / 2, out.width / 2, out.height / 2, 0, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(original.current, x, y, width, height, 0, 0, out.width, out.height);
      onConfirm(out.toDataURL('image/png'), { rect, circle, locked });
    } catch { setError('无法生成裁剪图，请缩小裁剪范围后重试。'); }
  };
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label="裁剪图片">
        <div className="section-heading">
          <h2>裁剪图片</h2>
          <button onClick={onCancel} aria-label="取消裁剪">✕</button>
        </div>
        <p className="muted">拖动框内移动，拖动四角缩放；在框外拖动可重新框选。</p>
        {error && <p role="alert">{error}</p>}
        <div className="crop-stage" style={{ aspectRatio: `${size[0]}/${size[1]}` }}
          onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
          <canvas ref={canvas} onPointerDown={e => begin(e, 'draw')} />
          <div className="crop-outline" aria-label="裁剪范围" onPointerDown={e => begin(e, 'move')}
            style={{ left: `${rect[0] / size[0] * 100}%`, top: `${rect[1] / size[1] * 100}%`,
              width: `${rect[2] / size[0] * 100}%`, height: `${rect[3] / size[1] * 100}%`,
              borderRadius: circle ? '50%' : 0 }}>
            {(['nw', 'ne', 'sw', 'se'] as Handle[]).map(handle => (
              <span key={handle} className={`crop-handle ${handle}`} aria-label={`裁剪角点 ${handle}`}
                onPointerDown={e => begin(e, handle)} />
            ))}
          </div>
        </div>
        <p className="muted" data-testid="crop-size">原图 {size.join(' × ')} px · 裁剪 {rect[2]} × {rect[3]} px · 工作图 {workSize(rect[2], rect[3]).join(' × ')} px</p>
        <div className="crop-actions">
          <button disabled={!ready} onClick={() => { setRect([0, 0, ...size]); setCircle(false); }}>使用整图</button>
          <button disabled={!ready} onClick={() => { setRect([0, 0, ...size]); setCircle(false); setLocked(false); }}>重置</button>
          <label><input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} />锁定裁剪比例</label>
        </div>
        <div className="modal-footer">
          <label><input type="checkbox" checked={circle} onChange={e => setCircle(e.target.checked)} />椭圆裁切，外部不打印</label>
          <button className="primary" disabled={!ready} onClick={confirm}>应用裁剪</button>
        </div>
      </section>
    </div>
  );
}
