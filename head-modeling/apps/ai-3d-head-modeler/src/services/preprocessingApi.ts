import { Capacitor, CapacitorHttp } from '@capacitor/core';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export async function removePortraitBackground(image: string): Promise<string> {
  const url = `${API_BASE_URL}/remove-background/inline`;
  let status: number;
  let data: unknown;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({ url,
      headers: { 'Content-Type': 'application/json' }, data: { image },
      connectTimeout: 15000, readTimeout: 75000 });
    status = response.status;
    data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } else {
    const response = await fetch(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(75000) });
    status = response.status;
    data = await response.json();
  }
  if (!data || typeof data !== 'object') throw new Error('抠图服务返回了无效结果');
  const result = data as { success?: boolean; image?: string; message?: string };
  if (status >= 400 || !result.success || typeof result.image !== 'string') {
    throw new Error(result.message || '抠图失败，当前图片已保留，可重试');
  }
  return result.image;
}
