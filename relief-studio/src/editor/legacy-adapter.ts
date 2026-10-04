import type { Project } from '../types';
import type { ProjectSnapshot } from '../contracts';
import { validateSnapshot } from '../project-codec';

/** 旧界面只消费投影视图，v2 快照是唯一编辑数据。 */
export function fromLegacy(project: Project, rgba: Uint8Array): ProjectSnapshot {
  const defaults = new Map(project.regions.map(region => [region.id, region.layers]));
  const snapshot: ProjectSnapshot = { version: 2, sessionId: crypto.randomUUID(), revision: 0, name: project.name,
    width: project.width, height: project.height, sizeMm: [...project.sizeMm],
    original: rgba.slice(), colors: rgba.slice(), labels: Uint16Array.from(project.labels),
    heights: Uint16Array.from(project.labels, id => id ? defaults.get(id) ?? 0 : 0),
    protection: new Uint8Array(project.width * project.height),
    regions: project.regions.map(({ layers, ...region }) => ({ ...region, defaultLayers: layers })),
    heightMapping: { kind: 'design', mmPerLayer: 0.1 },
    device: { id: 'generic-unverified', name: '通用未验证配置', verified: false,
      whitePolarity: 'unknown', automaticWhite: 'unknown', colorSpace: 'RGB', iccPath: null } };
  validateSnapshot(snapshot); return snapshot;
}

export function legacyEdit(snapshot: ProjectSnapshot, next: Project, colors?: Uint8Array): ProjectSnapshot {
  if (next.width !== snapshot.width || next.height !== snapshot.height) throw new Error('重新识别不能改变工作尺寸');
  const result = structuredClone(snapshot);
  result.name = next.name; result.sizeMm = [...next.sizeMm];
  result.regions = next.regions.map(({ layers, ...region }) => ({ ...region, defaultLayers: layers }));
  const oldRegions = new Map(snapshot.regions.map(region => [region.id, region]));
  const newRegions = new Map(result.regions.map(region => [region.id, region]));
  snapshot.labels.forEach((id, i) => {
    const target = next.labels[i];
    if (target !== id) {
      if (target && !snapshot.original[i * 4 + 3]) return;
      result.labels[i] = target;
      result.heights[i] = target ? newRegions.get(target)?.defaultLayers ?? 0 : 0;
      result.protection[i] |= target ? 7 : 5;
      // 补回读取原始颜色；已有可打印像素只换区域时保留人工改色。
      if (target && !id) result.colors.set(snapshot.original.subarray(i * 4, i * 4 + 4), i * 4);
    } else if (id && oldRegions.get(id)?.defaultLayers !== newRegions.get(id)?.defaultLayers) {
      result.heights[i] = newRegions.get(id)?.defaultLayers ?? 0;
      result.protection[i] |= 4;
    }
    if (colors && colors.subarray(i * 4, i * 4 + 4).some((value, c) => value !== snapshot.colors[i * 4 + c])) {
      result.colors.set(colors.subarray(i * 4, i * 4 + 4), i * 4); result.protection[i] |= 2;
    }
  });
  validateSnapshot(result); return result;
}

export function toLegacy(snapshot: ProjectSnapshot, image: string): Project {
  return { version: 1, name: snapshot.name, width: snapshot.width, height: snapshot.height,
    sizeMm: snapshot.sizeMm, image, labels: Array.from(snapshot.labels),
    regions: snapshot.regions.map(({ defaultLayers, ...region }) => ({ ...region, layers: defaultLayers })) };
}
