export interface CropMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PreparedImage {
  dataUrl: string;
  base64: string;
  width: number;
  height: number;
  bytes: number;
  warnings: string[];
}

export const EMPTY_CROP: CropMargins = { left: 0, right: 0, top: 0, bottom: 0 };
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;

export function fitDimensions(width: number, height: number, max = 2048) {
  if (![width, height, max].every(n => Number.isFinite(n) && n >= 1)) {
    throw new Error('图片尺寸无效');
  }
  const ratio = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)) };
}

export function cropRectangle(width: number, height: number, crop: CropMargins) {
  fitDimensions(width, height);
  if (![crop.left, crop.right, crop.top, crop.bottom]
    .every(n => Number.isFinite(n) && n >= 0 && n < 100)
    || crop.left + crop.right >= 100 || crop.top + crop.bottom >= 100) {
    throw new Error('裁剪区域须在图片范围内，且宽高不能为零');
  }
  const x = Math.floor(width * crop.left / 100);
  const y = Math.floor(height * crop.top / 100);
  return { x, y, width: Math.max(1, Math.floor(width * (1 - crop.right / 100)) - x),
    height: Math.max(1, Math.floor(height * (1 - crop.bottom / 100)) - y) };
}

function detectMime(bytes: Uint8Array): string {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) {
    return 'image/png';
  }
  const ascii = String.fromCharCode(...bytes.slice(0, 12));
  if (ascii.startsWith('RIFF') && ascii.endsWith('WEBP')) return 'image/webp';
  throw new Error('仅支持有效的 JPEG、PNG、WebP 图片，请先转换 HEIC 等格式');
}

export function parseImageSource(source: string): Blob {
  if (source.length > MAX_INPUT_BYTES * 4 / 3 + 100) throw new Error('图片不能超过 20 MB');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s.exec(source);
  const raw = match ? match[2] : source;
  if (!raw || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new Error('图片数据无效，请重新选择图片');
  }
  const decoded = atob(raw);
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  const type = detectMime(bytes);
  if (match && match[1] !== type) throw new Error('图片格式与内容不一致');
  return new Blob([bytes], { type });
}

async function sourceBlob(source: File | string): Promise<Blob> {
  const blob = typeof source === 'string' ? parseImageSource(source) : source;
  if (!blob.size || blob.size > MAX_INPUT_BYTES) throw new Error('图片须在 20 MB 以内');
  const type = detectMime(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
  if (blob.type && blob.type !== type) throw new Error('图片格式与内容不一致');
  return blob;
}

// 浏览器解码应用 EXIF 方向；导出 canvas 像素后不再携带旧方向标记。
async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth * img.naturalHeight > 40_000_000) {
      throw new Error('图片超过 4000 万像素，请先缩小图片');
    }
    return img;
  } catch (error) {
    if (error instanceof Error && error.message.includes('像素')) throw error;
    throw new Error('无法读取图片，请重新选择 JPEG、PNG 或 WebP 文件');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImage(
  source: File | string,
  options: { rotation?: number; crop?: CropMargins } = {},
): Promise<PreparedImage> {
  const img = await loadImage(await sourceBlob(source));
  const rotation = options.rotation ?? 0;
  if (![0, 1, 2, 3].includes(rotation)) throw new Error('旋转角度无效');
  const width = rotation % 2 ? img.naturalHeight : img.naturalWidth;
  const height = rotation % 2 ? img.naturalWidth : img.naturalHeight;
  const crop = cropRectangle(width, height, options.crop ?? EMPTY_CROP);
  const size = fitDimensions(crop.width, crop.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法处理图片');
  // JPEG 不支持透明通道，显式白底避免输出黑色背景。
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(size.width / crop.width, size.height / crop.height);
  ctx.translate(-crop.x, -crop.y);
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rotation * Math.PI / 2);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();

  let result: Blob | null = null;
  for (const quality of [0.94, 0.88, 0.8, 0.7, 0.6]) {
    result = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (result && result.size <= MAX_OUTPUT_BYTES) break;
  }
  if (!result || result.size > MAX_OUTPUT_BYTES) {
    throw new Error('图片压缩后仍超过 3 MB，请裁剪或选择较小图片');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取处理结果失败'));
    reader.readAsDataURL(result);
  });
  return { dataUrl, base64: dataUrl.split(',')[1], ...size, bytes: result.size,
    warnings: Math.min(size.width, size.height) < 512
      ? ['有效区域短边不足 512 像素，建议换用更清晰的原图。'] : [] };
}
