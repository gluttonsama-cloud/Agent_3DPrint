import { useEffect, useRef, useState } from 'react';
import type { Project } from './types';
import { connectedSelection, heightValues, paintLabels } from './model';
import { loadImage } from './image';

export type Tool = 'color' | 'connected' | 'brush' | 'erase';
interface Props {
  project: Project;
  selected: number;
  tool: Tool;
  radius: number;
  mode: 'color' | 'regions' | 'layer';
  layer: number;
  onSelect(id: number): void;
  onPaint(labels: number[]): void;
  selection: number[];
  onSelection(indices: number[]): void;
}

export function EditorCanvas(props: Props) {
  const { project, selected, tool, radius, mode, layer, selection } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const rgba = useRef<ImageData | null>(null);
  const stroke = useRef<{ labels: number[]; last: [number, number] | null } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    rgba.current = null;
    loadImage(project.image).then((image) => {
      if (!alive) return;
      const c = document.createElement('canvas');
      c.width = project.width;
      c.height = project.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      rgba.current = ctx.getImageData(0, 0, c.width, c.height);
      setRevision((value) => value + 1);
    });
    return () => {
      alive = false;
    };
  }, [project.image, project.width, project.height]);
  useEffect(() => {
    if (!rgba.current || !ref.current) return;
    const ctx = ref.current.getContext('2d')!;
    const data = new Uint8ClampedArray(rgba.current.data);
    const heights = heightValues(project.labels, project.regions);
    const selectionSet = new Set(selection);
    for (let index = 0; index < project.labels.length; index++) {
      const offset = index * 4;
      const id = project.labels[index];
      if (id === 0) {
        data[offset + 3] = 0;
        continue;
      }
      if (mode === 'layer') {
        const value = heights[index] >= layer ? 255 : 32;
        data[offset] = data[offset + 1] = data[offset + 2] = value;
        data[offset + 3] = 255;
      } else if ((mode === 'regions' && id === selected) || selectionSet.has(index)) {
        data[offset] = Math.round(data[offset] * 0.45 + 240 * 0.55);
        data[offset + 1] = Math.round(data[offset + 1] * 0.45 + 146 * 0.55);
        data[offset + 2] = Math.round(data[offset + 2] * 0.45 + 48 * 0.55);
      }
    }
    ctx.putImageData(new ImageData(data, project.width, project.height), 0, 0);
  }, [project, selected, mode, layer, selection, revision]);
  const point = (event: React.PointerEvent): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(
          project.width - 1,
          Math.floor(((event.clientX - box.left) / box.width) * project.width),
        ),
      ),
      Math.max(
        0,
        Math.min(
          project.height - 1,
          Math.floor(((event.clientY - box.top) / box.height) * project.height),
        ),
      ),
    ];
  };
  const dab = (end: [number, number]) => {
    if (!stroke.current || !rgba.current) return;
    const begin = stroke.current.last || end;
    const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - begin[0], end[1] - begin[1])));
    const labels = stroke.current.labels;
    for (let step = 0; step <= steps; step++) {
      const cx = begin[0] + ((end[0] - begin[0]) * step) / steps;
      const cy = begin[1] + ((end[1] - begin[1]) * step) / steps;
      for (
        let y = Math.max(0, Math.floor(cy - radius));
        y <= Math.min(project.height - 1, cy + radius);
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(cx - radius));
          x <= Math.min(project.width - 1, cx + radius);
          x++
        ) {
          const index = y * project.width + x;
          if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 && rgba.current.data[index * 4 + 3]) {
            labels[index] = tool === 'erase' ? 0 : selected;
            const ctx = ref.current!.getContext('2d')!;
            ctx.fillStyle = tool === 'erase' ? '#969c98' : '#e59f52';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }
    stroke.current.last = end;
  };
  return (
    <canvas
      className={`art-canvas tool-${tool}`}
      ref={ref}
      width={project.width}
      height={project.height}
      aria-label="图案编辑画布"
      onPointerDown={(event) => {
        if (!rgba.current) return;
        const p = point(event);
        const index = p[1] * project.width + p[0];
        if (tool === 'color') {
          if (project.labels[index]) props.onSelect(project.labels[index]);
          return;
        }
        if (tool === 'connected') {
          props.onSelection(
            connectedSelection(project.labels, project.width, project.height, index),
          );
          return;
        }
        stroke.current = { labels: project.labels.slice(), last: null };
        event.currentTarget.setPointerCapture(event.pointerId);
        dab(p);
      }}
      onPointerMove={(event) => {
        if (stroke.current) dab(point(event));
      }}
      onPointerUp={() => {
        if (stroke.current) {
          props.onPaint(stroke.current.labels);
          stroke.current = null;
        }
      }}
      onPointerCancel={() => {
        stroke.current = null;
        setRevision((value) => value + 1);
      }}
    />
  );
}

export async function assignSelection(project: Project, indices: number[], target: number) {
  const image = await loadImage(project.image);
  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, project.width, project.height).data;
  return paintLabels(
    project.labels,
    indices,
    target,
    project.labels.map((_, index) => data[index * 4 + 3]),
  );
}
