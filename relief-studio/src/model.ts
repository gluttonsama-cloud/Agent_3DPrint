import type { Project } from './types';

export function nextRegionId(regions: { id: number }[]) {
  const used = new Set(regions.map((region) => region.id));
  let candidate = 1;
  while (used.has(candidate)) candidate++;
  if (candidate > 65535) throw new Error('没有可用的区域编号');
  return candidate;
}

export function heightValues(labels: number[], regions: { id: number; layers: number }[]) {
  const heights = new Map(regions.map((region) => [region.id, region.layers]));
  return Uint16Array.from(labels, (id) => heights.get(id) ?? 0);
}

export function connectedSelection(labels: number[], width: number, height: number, start: number) {
  const id = labels[start];
  if (!id || start < 0 || start >= labels.length) return [];
  const seen = new Uint8Array(labels.length);
  const found = [start];
  seen[start] = 1;
  for (let index = 0; index < found.length; index++) {
    const pixel = found[index];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    for (const next of neighbors) {
      if (next >= 0 && !seen[next] && labels[next] === id) {
        seen[next] = 1;
        found.push(next);
      }
    }
  }
  return found;
}

export function paintLabels(labels: number[], indices: number[], target: number, alpha: number[]) {
  const next = labels.slice();
  for (const index of indices) if (alpha[index] > 0) next[index] = target;
  return next;
}

export function mergeRegions(labels: number[], source: number, target: number) {
  return labels.map((id) => (id === source ? target : id));
}

export function projectStats(project: Project) {
  const counts = new Map<number, number>();
  for (const id of project.labels) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
