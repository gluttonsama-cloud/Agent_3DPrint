import { LIMITS, type EncodedRaster } from './index';

export function encodeRaster(array: Uint8Array | Uint16Array): EncodedRaster {
  if (!(array instanceof Uint8Array) && !(array instanceof Uint16Array)) {
    throw new Error('unsupported raster type');
  }
  if (array.byteLength > LIMITS.fileBytes) throw new Error('raster too large');
  const words = array instanceof Uint16Array;
  // 8 位栅格直接读取当前视图；16 位逐值写小端，不能暴露子视图以外的数据。
  const bytes = words ? new Uint8Array(array.byteLength) : array;
  if (words) {
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < array.length; i++) view.setUint16(i * 2, array[i], true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return { type: words ? 'uint16' : 'uint8',
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
  // 避免字符串 iterable 映射创建逐字符临时集合，大图直接写预分配栅格。
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) bytes[i] = binary.charCodeAt(i);
  if (raster.type === 'uint8') return bytes;
  const view = new DataView(bytes.buffer);
  const words = new Uint16Array(count);
  for (let i = 0; i < count; i++) words[i] = view.getUint16(i * 2, true);
  return words;
}
