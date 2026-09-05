export async function loadImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

export async function readRaster(file: File) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('请选择 PNG 或 JPEG 图片');
  if (file.size > 24_000_000) throw new Error('图片文件不能超过 24 MB');
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { image: canvas.toDataURL('image/png'), resized: scale < 1 };
  } finally {
    URL.revokeObjectURL(source);
  }
}
