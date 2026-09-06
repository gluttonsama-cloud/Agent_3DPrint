export type SelectionOperation = 'replace' | 'add' | 'subtract';
export function regionSelection(labels: number[], id: number) {
  if (!id) return [];
  const indices: number[] = [];
  labels.forEach((label, index) => {
    if (label === id) indices.push(index);
  });
  return indices;
}
export function combineSelection(current: number[], next: number[], operation: SelectionOperation) {
  if (operation === 'replace') return next;
  const result = new Set(current);
  for (const index of next) {
    if (operation === 'add') result.add(index);
    else result.delete(index);
  }
  return [...result];
}
export function selectionEdges(selection: number[], width: number, height: number) {
  const mask = new Uint8Array(width * height);
  for (const index of selection) mask[index] = 1;
  const edges: [number, number, number, number][] = [];
  for (const index of selection) {
    const x = index % width,
      y = Math.floor(index / width);
    if (x === 0 || !mask[index - 1]) edges.push([x, y, x, y + 1]);
    if (x === width - 1 || !mask[index + 1]) edges.push([x + 1, y, x + 1, y + 1]);
    if (y === 0 || !mask[index - width]) edges.push([x, y, x + 1, y]);
    if (y === height - 1 || !mask[index + width]) edges.push([x, y + 1, x + 1, y + 1]);
  }
  return edges;
}
