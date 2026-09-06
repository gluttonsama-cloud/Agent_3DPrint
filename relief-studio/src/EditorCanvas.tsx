import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './types';
import { connectedSelection, heightValues } from './model';
import {
  combineSelection,
  regionSelection,
  selectionEdges,
  type SelectionOperation,
} from './selection';
import { loadImage } from './image';

export type Tool = 'color' | 'connected' | 'brush' | 'erase' | 'hand';
interface Props {
  project: Project;
  selected: number;
  tool: Tool;
  radius: number;
  mode: 'color' | 'regions' | 'layer';
  layer: number;
  zoom: number;
  operation: SelectionOperation;
  selection: number[];
  onSelect(id: number): void;
  onPaint(labels: number[]): void;
  onSelection(indices: number[]): void;
  onError(message: string): void;
}

export function EditorCanvas(props: Props) {
  const { project, selected, tool, radius, mode, layer, zoom, operation, selection } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const focus = useRef<HTMLCanvasElement>(null);
  const rgba = useRef<ImageData | null>(null);
  const stroke = useRef<{ labels: number[]; last: [number, number] | null } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [revision, setRevision] = useState(0);
  const [fit, setFit] = useState(1);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const selectionMask = useMemo(() => new Set(selection), [selection]);
  const scale = fit * zoom;
  useEffect(() => {
    const host = viewport.current!;
    const observer = new ResizeObserver(() =>
      setFit(
        Math.max(
          0.05,
          Math.min(
            (host.clientWidth - 80) / project.width,
            (host.clientHeight - 80) / project.height,
            2,
          ),
        ),
      ),
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [project.width, project.height]);
  useEffect(() => {
    let alive = true;
    rgba.current = null;
    loadImage(project.image)
      .then((image) => {
        if (!alive) return;
        const canvas = document.createElement('canvas');
        canvas.width = project.width;
        canvas.height = project.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        rgba.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setRevision((value) => value + 1);
      })
      .catch(() => {
        if (alive) props.onError('图片无法读取，请重新打开工程。');
      });
    return () => {
      alive = false;
    };
  }, [project.image, project.width, project.height]);
  function renderBase(labels: number[]) {
    if (!rgba.current || !base.current) return;
    const pixels = new Uint8ClampedArray(rgba.current.data);
    const heights = mode === 'layer' ? heightValues(labels, project.regions) : null;
    for (let index = 0; index < labels.length; index++) {
      if (!labels[index]) {
        pixels[index * 4 + 3] = 0;
        continue;
      }
      if (heights) {
        const value = heights[index] >= layer ? 255 : 28;
        pixels[index * 4] = pixels[index * 4 + 1] = pixels[index * 4 + 2] = value;
        pixels[index * 4 + 3] = 255;
      }
    }
    base.current
      .getContext('2d')!
      .putImageData(new ImageData(pixels, project.width, project.height), 0, 0);
  }
  useEffect(() => {
    renderBase(project.labels);
  }, [project, mode, layer, revision]);
  const edges = useMemo(
    () => selectionEdges(selection, project.width, project.height),
    [selection, project.width, project.height],
  );
  // 淡化层与原图分离：选中像素完全透明，非选中打印像素覆盖中性灰。
  useEffect(() => {
    const ctx = focus.current!.getContext('2d')!;
    ctx.clearRect(0, 0, project.width, project.height);
    if (mode !== 'regions' || !selection.length) return;
    const pixels = new Uint8ClampedArray(project.width * project.height * 4);
    project.labels.forEach((id, index) => {
      if (!id || selectionMask.has(index)) return;
      pixels.set([130, 137, 123, 235], index * 4);
    });
    ctx.putImageData(new ImageData(pixels, project.width, project.height), 0, 0);
  }, [project.labels, project.width, project.height, selectionMask, mode]);
  // 选区和绘入区域独立描边，不改动原图的 RGB 像素。
  function renderOverlay(labels: number[]) {
    const ctx = overlay.current!.getContext('2d')!;
    ctx.clearRect(0, 0, project.width, project.height);
    if (mode === 'color') return;
    if (tool === 'brush' && mode === 'regions') {
      ctx.beginPath();
      for (const [x, y, xx, yy] of selectionEdges(
        regionSelection(labels, selected),
        project.width,
        project.height,
      )) {
        ctx.moveTo(x, y);
        ctx.lineTo(xx, yy);
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth = 1 / scale;
      ctx.strokeStyle = '#0879c5';
      ctx.stroke();
    }
    ctx.beginPath();
    for (const [x, y, xx, yy] of edges) {
      ctx.moveTo(x, y);
      ctx.lineTo(xx, yy);
    }
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = '#f8fafc';
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = '#182734';
    ctx.setLineDash([4 / scale, 4 / scale]);
    ctx.stroke();
  }
  useEffect(() => {
    renderOverlay(project.labels);
  }, [edges, project.labels, selected, tool, mode, scale]);
  const point = (event: React.PointerEvent): [number, number] => {
    const box = base.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(project.width - 1, Math.floor((event.clientX - box.left) / scale))),
      Math.max(0, Math.min(project.height - 1, Math.floor((event.clientY - box.top) / scale))),
    ];
  };
  function dab(end: [number, number]) {
    if (!stroke.current || !rgba.current) return;
    const begin = stroke.current.last || end;
    const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - begin[0], end[1] - begin[1])));
    for (let step = 0; step <= steps; step++) {
      const cx = begin[0] + ((end[0] - begin[0]) * step) / steps,
        cy = begin[1] + ((end[1] - begin[1]) * step) / steps;
      for (
        let y = Math.max(0, Math.floor(cy - radius));
        y <= Math.min(project.height - 1, cy + radius);
        y++
      )
        for (
          let x = Math.max(0, Math.floor(cx - radius));
          x <= Math.min(project.width - 1, cx + radius);
          x++
        ) {
          const index = y * project.width + x;
          if (
            (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 &&
            rgba.current.data[index * 4 + 3] &&
            (!selection.length || selectionMask.has(index))
          )
            stroke.current.labels[index] = tool === 'erase' ? 0 : selected;
        }
    }
    stroke.current.last = end;
    renderBase(stroke.current.labels);
    renderOverlay(stroke.current.labels);
  }
  function finish(cancel = false) {
    if (stroke.current) {
      const labels = stroke.current.labels;
      stroke.current = null;
      if (cancel) {
        renderBase(project.labels);
        renderOverlay(project.labels);
      } else if (labels.some((id, index) => id !== project.labels[index])) props.onPaint(labels);
    }
    pan.current = null;
  }
  return (
    <div className="canvas-viewport" ref={viewport}>
      <div
        className="canvas-scroll-area"
        style={{ minWidth: project.width * scale + 80, minHeight: project.height * scale + 80 }}
      >
        <div
          className={`raster-frame checker tool-${tool}`}
          style={{ width: project.width * scale, height: project.height * scale }}
        >
          <canvas
            className="art-canvas"
            ref={base}
            width={project.width}
            height={project.height}
            aria-label="图案编辑画布"
            data-ready={rgba.current ? 'true' : 'false'}
            style={{ width: project.width * scale, height: project.height * scale }}
            onPointerDown={(event) => {
              if (!rgba.current || (event.button !== 0 && event.button !== 1)) return;
              const p = point(event);
              if (tool === 'hand' || event.button === 1) {
                pan.current = {
                  x: event.clientX,
                  y: event.clientY,
                  left: viewport.current!.scrollLeft,
                  top: viewport.current!.scrollTop,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
                return;
              }
              if (tool === 'color' || tool === 'connected') {
                const index = p[1] * project.width + p[0],
                  id = project.labels[index];
                const next =
                  tool === 'color'
                    ? regionSelection(project.labels, id)
                    : connectedSelection(project.labels, project.width, project.height, index);
                const op = event.altKey ? 'subtract' : event.shiftKey ? 'add' : operation;
                props.onSelection(combineSelection(selection, next, op));
                if (id && op === 'replace') props.onSelect(id);
                return;
              }
              stroke.current = { labels: project.labels.slice(), last: null };
              event.currentTarget.setPointerCapture(event.pointerId);
              dab(p);
            }}
            onPointerMove={(event) => {
              setCursor(point(event));
              if (pan.current) {
                viewport.current!.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
                viewport.current!.scrollTop = pan.current.top - (event.clientY - pan.current.y);
              } else if (stroke.current) dab(point(event));
            }}
            onPointerUp={() => finish()}
            onPointerCancel={() => finish(true)}
            onPointerLeave={() => setCursor(null)}
            onLostPointerCapture={() => finish()}
          />
          <canvas
            ref={focus}
            className="selection-overlay"
            aria-label="选区聚焦"
            width={project.width}
            height={project.height}
            style={{ width: project.width * scale, height: project.height * scale }}
          />
          <canvas
            ref={overlay}
            className="selection-overlay"
            aria-label="选区边界"
            width={project.width}
            height={project.height}
            style={{ width: project.width * scale, height: project.height * scale }}
          />
          {cursor && (tool === 'brush' || tool === 'erase') && (
            <span
              className="brush-cursor"
              style={{
                left: cursor[0] * scale,
                top: cursor[1] * scale,
                width: radius * 2 * scale,
                height: radius * 2 * scale,
              }}
            />
          )}
          <span className="canvas-dimension">
            {project.sizeMm[0]} × {project.sizeMm[1]} mm
          </span>
        </div>
      </div>
    </div>
  );
}
