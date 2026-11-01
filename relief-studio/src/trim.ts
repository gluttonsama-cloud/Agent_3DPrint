import type { Project } from './types';

export function trimRegion(
  project: Project,
  selected: number,
  selection: number[],
  action: 'clear' | 'keep',
): Project {
  if (!selection.length || !project.regions.some((r) => r.id === selected)) return project;
  const mask = new Set(selection);
  let changed = false;
  const labels = project.labels.map((id, i) => {
    if (id === selected && (action === 'clear' ? mask.has(i) : !mask.has(i))) {
      changed = true;
      return 0;
    }
    return id;
  });
  return changed ? { ...project, labels } : project;
}

export function polygonSelection(points: [number, number][], width: number, height: number) {
  if (points.length < 3) return [];
  const result: number[] = [];
  const minY = Math.max(0, Math.floor(points.reduce((v, p) => Math.min(v, p[1]), Infinity)));
  const maxY = Math.min(
    height - 1,
    Math.ceil(points.reduce((v, p) => Math.max(v, p[1]), -Infinity)),
  );
  for (let y = minY; y <= maxY; y++) {
    const crossings: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j],
        b = points[i],
        cy = y + 0.5;
      if (a[1] > cy !== b[1] > cy)
        crossings.push(a[0] + ((cy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2)
      for (
        let x = Math.max(0, Math.ceil(crossings[i] - 0.5));
        x < Math.min(width, Math.ceil(crossings[i + 1] - 0.5));
        x++
      )
        result.push(y * width + x);
  }
  return result;
}

/** 增补默认只填未打印像素，跨区域覆盖必须显式开启。 */
export function restoreSelection(project: Project, selected: number, selection: number[], original: Uint8Array, crossRegion = false): Project {
  if (!project.regions.some(region => region.id === selected)) return project;
  const labels = project.labels.slice();
  let changed = false;
  for (const index of selection) {
    if (!Number.isInteger(index) || index < 0 || index >= labels.length || !original[index * 4 + 3]) continue;
    if (labels[index] === selected || (!crossRegion && labels[index] !== 0)) continue;
    labels[index] = selected;
    changed = true;
  }
  return changed ? { ...project, labels } : project;
}
