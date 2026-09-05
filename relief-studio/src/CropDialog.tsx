import { useEffect, useRef, useState } from 'react';
import { loadImage } from './image';

interface Props {
  image: string;
  onCancel(): void;
  onConfirm(image: string): void;
}

export function CropDialog({ image, onCancel, onConfirm }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const start = useRef<[number, number] | null>(null);
  const [rect, setRect] = useState<[number, number, number, number]>([0, 0, 1, 1]);
  const [circle, setCircle] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadImage(image).then((img) => {
      if (!alive) return;
      original.current = img;
      const c = canvas.current!;
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      setRect([0, 0, img.width, img.height]);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [image]);
  const point = (event: React.PointerEvent) => {
    const box = canvas.current!.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(
          canvas.current!.width,
          Math.round(((event.clientX - box.left) / box.width) * canvas.current!.width),
        ),
      ),
      Math.max(
        0,
        Math.min(
          canvas.current!.height,
          Math.round(((event.clientY - box.top) / box.height) * canvas.current!.height),
        ),
      ),
    ] as [number, number];
  };
  const confirm = () => {
    const [x, y, width, height] = rect;
    if (!width || !height || !original.current) return;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d')!;
    if (circle) {
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(original.current, x, y, width, height, 0, 0, width, height);
    onConfirm(out.toDataURL('image/png'));
  };
  const width = canvas.current?.width || 1;
  const height = canvas.current?.height || 1;
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label="裁剪图片">
        <div className="section-heading">
          <div>
            <small>01 / PREPARE</small>
            <h2>框选你的图案</h2>
          </div>
          <button onClick={onCancel} aria-label="取消裁剪">
            ✕
          </button>
        </div>
        <p className="muted">拖动框选，排除说明文字与外部背景。圆形标志可启用椭圆裁切。</p>
        <div className="crop-stage" style={{ aspectRatio: `${width}/${height}` }}>
          <canvas
            ref={canvas}
            onPointerDown={(event) => {
              start.current = point(event);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!start.current) return;
              const end = point(event);
              const begin = start.current;
              setRect([
                Math.min(begin[0], end[0]),
                Math.min(begin[1], end[1]),
                Math.abs(begin[0] - end[0]),
                Math.abs(begin[1] - end[1]),
              ]);
            }}
            onPointerUp={() => {
              start.current = null;
            }}
          />
          <div
            className="crop-outline"
            style={{
              left: `${(rect[0] / width) * 100}%`,
              top: `${(rect[1] / height) * 100}%`,
              width: `${(rect[2] / width) * 100}%`,
              height: `${(rect[3] / height) * 100}%`,
              borderRadius: circle ? '50%' : 0,
            }}
          />
        </div>
        <div className="modal-footer">
          <label>
            <input
              type="checkbox"
              checked={circle}
              onChange={(event) => setCircle(event.target.checked)}
            />{' '}
            椭圆裁切，外部不打印
          </label>
          <button className="primary" disabled={!ready || !rect[2] || !rect[3]} onClick={confirm}>
            确认裁剪并分区 →
          </button>
        </div>
      </section>
    </div>
  );
}
