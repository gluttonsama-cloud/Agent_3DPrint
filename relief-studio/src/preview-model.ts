import { heightValues } from './model';

interface GeometryInput {
  width: number;
  height: number;
  labels: number[];
  regions: { id: number; layers: number }[];
}

export function previewData(project: GeometryInput, comparison?: GeometryInput, target?: number) {
  const { width, height, labels } = project;
  const heights = heightValues(labels, project.regions);
  let faces = 0;
  if (comparison && (comparison.width !== width || comparison.height !== height))
    throw new Error('对比工程尺寸不一致');
  // 预先限制实际面片数；超限时保留完整二维与导出数据，不进行破坏性降采样。
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (comparison && target !== undefined) {
        const added = (n:number) => labels[n] === target && comparison.labels[n] !== target;
        const removed = (n:number) => labels[n] !== target && comparison.labels[n] === target;
        if (added(i) && (x===0 || !added(i-1))) faces++;
        if (removed(i)) {
          if (x===0 || !removed(i-1)) faces++;
          if (x===width-1 || !removed(i+1)) faces++;
          if (y===0 || !removed(i-width)) faces++;
          if (y===height-1 || !removed(i+width)) faces++;
        }
        if (faces > 300000) throw new Error('差异边界过于复杂，请使用二维差异查看全部修改。');
      }
      if (!labels[i]) continue;
      if (x === 0 || !labels[i - 1] || heights[i - 1] !== heights[i]) faces++;
      const adjacent = [
        x > 0 ? i - 1 : -1,
        x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y + 1 < height ? i + width : -1,
      ];
      for (const n of adjacent) if (n < 0 || !labels[n] || heights[n] < heights[i]) faces++;
      if (faces > 300000)
        throw new Error('图案边界过于复杂，已暂停 3D 预览；二维逐层和导出保留全部细节。');
    }
  return { width, height, heights };
}
