import { LIMITS, type ProjectSnapshot, type PersistedProjectV2 } from './contracts';
import { decodeRaster, encodeRaster } from './contracts/raster-codec';

const fields = ['original', 'colors', 'labels', 'heights', 'protection'] as const;
const properties = ['version', 'name', 'width', 'height', 'sizeMm', 'sessionId', 'revision',
  'regions', 'heightMapping', 'device'] as const;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要对象');
  return value as Record<string, unknown>;
}
function keys(value: unknown, expected: readonly string[]) {
  const record = object(value);
  if (Object.keys(record).length !== expected.length ||
      !expected.every(key => Object.hasOwn(record, key))) throw new Error('字段缺失或未定义');
  return record;
}
function integer(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`需要 ${min}..${max} 的整数`);
  return value;
}
function number(value: unknown, positive = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && !value))
    throw new Error('无效有限数值');
  return value;
}
function text(value: unknown, nonempty = false) {
  if (typeof value !== 'string' || (nonempty && !value)) throw new Error('无效字符串');
}
export function validateSnapshot(value: ProjectSnapshot): void {
  keys(value, [...properties, ...fields]);
  integer(value.version, 2, 2);
  const count = integer(value.width, 1, LIMITS.edge) * integer(value.height, 1, LIMITS.edge);
  integer(value.revision, 0, Number.MAX_SAFE_INTEGER);
  text(value.name); text(value.sessionId, true);
  if (!Array.isArray(value.sizeMm) || value.sizeMm.length !== 2) throw new Error('尺寸无效');
  value.sizeMm.forEach(v => number(v, true));
  for (const field of fields) {
    const is16 = field === 'labels' || field === 'heights';
    const length = count * (field === 'original' || field === 'colors' ? 4 : 1);
    if (!(value[field] instanceof (is16 ? Uint16Array : Uint8Array)) ||
        value[field].length !== length) throw new Error(`${field}: 类型或尺寸不一致`);
  }
  if (!Array.isArray(value.regions) || value.regions.length > 65535) throw new Error('区域无效');
  const ids = new Set<number>();
  for (const region of value.regions) {
    keys(region, ['id', 'name', 'color', 'defaultLayers']);
    integer(region.id, 1, 65535); integer(region.defaultLayers, 0, LIMITS.layers);
    if (ids.has(region.id)) throw new Error('区域编号重复');
    ids.add(region.id); text(region.name);
    if (typeof region.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(region.color))
      throw new Error('区域颜色无效');
  }
  const device = keys(value.device,
    ['id', 'name', 'verified', 'whitePolarity', 'automaticWhite', 'colorSpace', 'iccPath']);
  text(device.id, true); text(device.name);
  if (typeof device.verified !== 'boolean' ||
      !['white-is-ink', 'black-is-ink', 'unknown'].includes(String(device.whitePolarity)) ||
      !['enabled', 'disabled', 'unknown'].includes(String(device.automaticWhite)) ||
      !['RGB', 'CMYK'].includes(String(device.colorSpace))) throw new Error('设备配置无效');
  if (device.iccPath !== null) text(device.iccPath, true);
  const mapping = object(value.heightMapping);
  if (mapping.kind === 'design') {
    keys(mapping, ['kind', 'mmPerLayer']);
    if (mapping.mmPerLayer !== 0.1) throw new Error('设计高度固定为 0.1 mm/层');
  } else if (mapping.kind === 'calibrated') {
    keys(mapping, ['kind', 'profileId', 'mmByLayer']); text(mapping.profileId, true);
    const curve = mapping.mmByLayer;
    if (!Array.isArray(curve) || !curve.length || curve.length > 257 || curve[0] !== 0)
      throw new Error('标定曲线无效');
    curve.forEach((v: unknown, i: number) => {
      if (number(v) < (i ? number(curve[i - 1]) : 0)) throw new Error('标定曲线必须单调');
    });
  } else throw new Error('高度映射无效');
  for (let i = 0; i < count; i++) {
    const label = value.labels[i], height = value.heights[i];
    if ((label && (!ids.has(label) || !value.original[i * 4 + 3])) ||
        (!label && height) || height > LIMITS.layers || value.protection[i] > 7)
      throw new Error(`像素 ${i}: 标签、高度或保护无效`);
    if (value.heightMapping.kind === 'calibrated' && height >= value.heightMapping.mmByLayer.length)
      throw new Error('高度超出标定范围');
  }
}
export function encodeProject(project: ProjectSnapshot): PersistedProjectV2 {
  validateSnapshot(project);
  const result: Record<string, unknown> = {};
  for (const key of properties) result[key] = structuredClone(project[key]);
  for (const key of fields) result[key] = encodeRaster(project[key]);
  return result as unknown as PersistedProjectV2;
}
export function decodeProject(input: unknown): ProjectSnapshot {
  const value = keys(input, [...properties, ...fields]);
  const count = integer(value.width, 1, LIMITS.edge) * integer(value.height, 1, LIMITS.edge);
  const result: Record<string, unknown> = {};
  for (const key of properties) result[key] = structuredClone(value[key]);
  for (const field of fields) {
    const kind = field === 'labels' || field === 'heights' ? 'uint16' : 'uint8';
    if (object(value[field]).type !== kind) throw new Error(`${field}: 类型不匹配`);
    result[field] = decodeRaster(value[field], count * (['original', 'colors'].includes(field) ? 4 : 1));
  }
  const snapshot = result as unknown as ProjectSnapshot;
  validateSnapshot(snapshot);
  return snapshot;
}
export function parseProject(text: string, limit: number = LIMITS.fileBytes): ProjectSnapshot {
  if (text.length > limit || new TextEncoder().encode(text).byteLength > limit)
    throw new Error('工程超过 128 MiB');
  return decodeProject(JSON.parse(text));
}
export function stringifyProject(project: ProjectSnapshot): string {
  const text = JSON.stringify(encodeProject(project));
  if (new TextEncoder().encode(text).byteLength > LIMITS.fileBytes) throw new Error('工程超过 128 MiB');
  return text;
}
