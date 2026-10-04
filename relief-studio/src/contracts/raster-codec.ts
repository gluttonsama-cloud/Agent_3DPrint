import { LIMITS, type EncodedRaster } from './index';

export function encodeRaster(array: Uint8Array | Uint16Array): EncodedRaster {
  if (!(array instanceof Uint8Array) && !(array instanceof Uint16Array)) {
    throw new Error('unsupported raster type');
  }
  if (array.byteLength > LIMITS.fileBytes) throw new Error('raster too large');
  const bytes = new Uint8Array(array.byteLength);
  const view = new DataView(bytes.buffer);
  array.forEach((value, index) => {
    if (array instanceof Uint16Array) view.setUint16(index * 2, value, true);
    else bytes[index] = value;
  });
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return { type: array instanceof Uint16Array ? 'uint16' : 'uint8',
    encoding: 'base64-le', data: btoa(binary) };
}

export function decodeRaster(value: unknown, count: number): Uint8Array | Uint16Array {
  if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.edge ** 2 * 4) {
    throw new Error('invalid raster size');
  }
  if (!value || typeof value !== 'object') throw new Error('invalid raster');
  const raster = value as Record<string, unknown>;
  if (!['uint8', 'uint16'].includes(String(raster.type)) ||
      raster.encoding !== 'base64-le' || typeof raster.data !== 'string') {
    throw new Error('invalid raster encoding');
  }
  const byteCount = count * (raster.type === 'uint16' ? 2 : 1);
  if (raster.data.length !== Math.ceil(byteCount / 3) * 4) {
    throw new Error('invalid base64 or raster length');
  }
  // 原生解码后回编码核对规范形式，避免大栅格触发重复分组正则的栈溢出。
  const binary = atob(raster.data);
  if (binary.length !== byteCount || btoa(binary) !== raster.data) {
    throw new Error('noncanonical base64 or raster length');
  }
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (raster.type === 'uint8') return bytes;
  const view = new DataView(bytes.buffer);
  return Uint16Array.from({ length: count }, (_, i) => view.getUint16(i * 2, true));
}
