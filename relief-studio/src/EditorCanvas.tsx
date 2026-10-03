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
import { isEditingTarget, screenToImage } from './editor/viewport';

export type Tool =
  | 'color'
  | 'connected'
  | 'brush'
  | 'erase'
  | 'hand'
  | 'smart'
  | 'lasso'
  | 'rectangle';
interface Props {
  disabled?: boolean;
  simple?: boolean;
  snapEdges?: boolean;
  tolerance: number;
  onSelecting(busy: boolean): void;
  selectionReset: number;
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
  const outline = useRef<{ points: [number, number][]; operation: SelectionOperation } | null>(
    null,
  );
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const request = useRef<{ id: number; baseline: number[]; operation: SelectionOperation } | null>(
    null,
  );
  const smartSeed = useRef<{
    point: [number, number];
    baseline: number[];
    operation: SelectionOperation;
  } | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const hovered = useRef(false);
  const spaceHeld = useRef(false);
  const [temporaryPan, setTemporaryPan] = useState(false);
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
    const instance = new Worker(new URL('./selection.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = instance;
    instance.onmessage = (
      event: MessageEvent<{ id: number; indices?: Uint32Array; error?: string }>,
    ) => {
      const pending = request.current;
      if (!pending || event.data.id !== pending.id) return;
      request.current = null;
      latest.current.onSelecting(false);
      if (event.data.error) latest.current.onError(event.data.error);
      else {
        const current = latest.current;
        const indices = Array.from(event.data.indices || []);
        latest.current.onSelection(
          combineSelection(
            pending.baseline,
            current.simple
              ? indices.filter((i) => current.project.labels[i] === current.selected)
              : indices,
            pending.operation,
          ),
        );
      }
    };
    instance.onerror = () => {
      request.current = null;
      latest.current.onSelecting(false);
      latest.current.onError('智能选区计算失败，请使用框选或关闭自动贴边重试。');
    };
    return () => {
      instance.terminate();
      worker.current = null;
      latest.current.onSelecting(false);
    };
  }, [project.image, project.width, project.height]);
  useEffect(() => {
    finish(true);
    request.current = null;
    smartSeed.current = null;
    outline.current = null;
    props.onSelecting(false);
  }, [project.labels, selected, tool, props.simple, props.selectionReset, project.image]);
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
        worker.current?.postMessage({
          type: 'init',
          rgba: rgba.current.data,
          width: project.width,
          height: project.height,
          id: 0,
        });
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
    if (mode !== 'regions') return;
    if (props.simple) {
      const pixels = new Uint8ClampedArray(project.width * project.height * 4);
      project.labels.forEach((id, i) => {
        if (!id) return;
        if (id === selected && selectionMask.has(i)) pixels.set([20, 145, 225, 110], i * 4);
        else if (id !== selected) pixels.set([235, 238, 230, 160], i * 4);
      });
      ctx.putImageData(new ImageData(pixels, project.width, project.height), 0, 0);
      return;
    }
    if (!selection.length) return;
    const pixels = new Uint8ClampedArray(project.width * project.height * 4);
    project.labels.forEach((id, index) => {
      if (!id || selectionMask.has(index)) return;
      pixels.set([130, 137, 123, 235], index * 4);
    });
    ctx.putImageData(new ImageData(pixels, project.width, project.height), 0, 0);
  }, [project.labels, project.width, project.height, selectionMask, mode, props.simple, selected]);
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
  }, [edges, project.labels, selected, tool, mode, scale, props.selectionReset]);
  const point = (event: React.PointerEvent): [number, number] => {
    const box = base.current!.getBoundingClientRect();
    // 圈选使用像素边界坐标，必须允许拖到最右/最下边缘。
    return screenToImage(
      event.clientX,
      event.clientY,
      box,
      project.width,
      project.height,
      tool === 'rectangle' || tool === 'lasso',
    );
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
  function selectSmart(point: [number, number], baseline: number[], op: SelectionOperation) {
    request.current = null;
    props.onSelecting(false);
    const allowed = Uint8Array.from(project.labels, (id, i) =>
      id === selected && rgba.current!.data[i * 4 + 3] > 0 ? 1 : 0,
    );
    if (!allowed[point[1] * project.width + point[0]]) {
      smartSeed.current = null;
      props.onError('请点击当前层的图案，或先在左侧切换层。');
      return;
    }
    const id = ++requestId.current;
    request.current = { id, baseline, operation: op };
    props.onSelecting(true);
    worker.current?.postMessage(
      { id, type: 'smart', seed: point, tolerance: props.tolerance, allowed },
      [allowed.buffer],
    );
  }
  useEffect(() => {
    const seed = smartSeed.current;
    if (seed && tool === 'smart') selectSmart(seed.point, seed.baseline, seed.operation);
  }, [props.tolerance]);
  function appendOutline(p: [number, number]) {
    const path = outline.current;
    if (!path) return;
    const first = path.points[0];
    if (tool === 'rectangle') path.points = [first, [p[0], first[1]], p, [first[0], p[1]]];
    else {
      const last = path.points.at(-1)!;
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1) path.points.push(p);
    }
  }
  function finish(cancel = false) {
    if (outline.current) {
      const path = outline.current;
      outline.current = null;
      if (!cancel && path.points.length >= 3) {
        const id = ++requestId.current;
        request.current = { id, baseline: selection, operation: path.operation };
        props.onSelecting(true);
        worker.current?.postMessage({
          id,
          type: 'outline',
          points: path.points,
          snap: tool === 'lasso' && props.snapEdges,
          radius: Math.max(4, Math.min(24, Math.round(14 / scale))),
        });
      }
      renderOverlay(project.labels);
    }

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
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (props.disabled || event.isComposing || isEditingTarget(event.target)) return;
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!hovered.current || stroke.current || outline.current) return;
        event.preventDefault();
        spaceHeld.current = true;
        setTemporaryPan(true);
      }
      if (
        event.key === 'Escape' ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd')
      ) {
        request.current = null;
        smartSeed.current = null;
        props.onSelecting(false);
        finish(true);
      }
    };
    const release = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceHeld.current = false;
      setTemporaryPan(false);
      // 松开空格后结束平移，不把仍按下的鼠标转成笔画。
      pan.current = null;
    };
    const blur = () => {
      spaceHeld.current = false;
      setTemporaryPan(false);
      request.current = null;
      smartSeed.current = null;
      props.onSelecting(false);
      finish(true);
    };
    window.addEventListener('keydown', cancel);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', blur);
    };
  });
  useEffect(() => {
    if (!props.disabled) return;
    spaceHeld.current = false;
    setTemporaryPan(false);
    finish(true);
  }, [props.disabled]);
  return (
    <div
      className="canvas-viewport"
      ref={viewport}
      onPointerEnter={() => {
        hovered.current = true;
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
    >
      <div
        className="canvas-scroll-area"
        style={{ minWidth: project.width * scale + 80, minHeight: project.height * scale + 80 }}
      >
        <div
          className={`raster-frame checker tool-${temporaryPan ? 'hand' : tool}`}
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
              if (props.disabled || !rgba.current || (event.button !== 0 && event.button !== 1))
                return;
              const p = point(event);
              if (tool === 'hand' || spaceHeld.current || event.button === 1) {
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
              if (tool === 'smart') {
                const op = event.altKey ? 'subtract' : event.shiftKey ? 'add' : operation;
                smartSeed.current = { point: p, baseline: selection, operation: op };
                selectSmart(p, selection, op);
                return;
              }
              if (tool === 'lasso' || tool === 'rectangle') {
                request.current = null;
                props.onSelecting(false);
                outline.current = {
                  points: [p],
                  operation: event.altKey ? 'subtract' : event.shiftKey ? 'add' : operation,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
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
              } else if (outline.current) {
                appendOutline(point(event));
                renderOverlay(project.labels);
                const ctx = overlay.current!.getContext('2d')!;
                ctx.beginPath();
                outline.current.points.forEach(([x, y], i) =>
                  i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
                );
                ctx.closePath();
                ctx.strokeStyle = '#0879c5';
                ctx.lineWidth = 2 / scale;
                ctx.setLineDash([]);
                ctx.stroke();
              } else if (stroke.current) dab(point(event));
            }}
            onPointerUp={(event) => {
              if (outline.current) appendOutline(point(event));
              finish();
            }}
            onPointerCancel={() => finish(true)}
            onPointerLeave={() => setCursor(null)}
            onLostPointerCapture={() => finish(true)}
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
          {cursor && !temporaryPan && (tool === 'brush' || tool === 'erase') && (
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
