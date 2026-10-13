/**
 * 上传服务 API 函数
 * 处理照片上传和任务状态查询
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

// API 基础 URL（从环境变量读取）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

/**
 * 照片文件接口
 */
export interface PhotoFile {
  file?: File;
  base64?: string;
  view: string;
}

/**
 * 上传响应接口
 */
export interface UploadResponse {
  success: boolean;
  taskId?: string;
  status?: string;
  message?: string;
  photos?: string[];
  estimatedTime?: string;
  error?: string;
}

/**
 * 任务状态响应接口
 */
export interface TaskStatusResponse {
  success: boolean;
  taskId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  progress: number;
  statusMessage?: string;
  modelUrls?: string[];
  error?: string;
  provider?: string;
  photoCount?: number;
  createdAt?: string;
}

/**
 * File 转 Base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 压缩图片到指定大小
 * @param file 原始图片文件
 * @param maxSizeKB 目标最大大小（KB）
 * @returns 压缩后的 Base64 字符串
 */
async function compressImage(file: File, maxSizeKB: number = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // 计算压缩比例
      let width = img.width;
      let height = img.height;
      
      // 最大尺寸 2048x2048
      const maxDimension = 2048;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      
      // 创建 canvas 压缩
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建 canvas 上下文'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // 逐步降低质量直到满足大小限制
      let quality = 0.8;
      const tryCompress = () => {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        const sizeKB = Math.round(base64.length * 0.75 / 1024); // Base64 约 1.33x 原始大小
        
        console.log(`📐 压缩尝试: 质量=${quality.toFixed(2)}, 大小=${sizeKB}KB`);
        
        if (sizeKB <= maxSizeKB || quality <= 0.1) {
          console.log(`✅ 压缩完成: ${sizeKB}KB (原: ${Math.round(file.size / 1024)}KB)`);
          resolve(base64);
        } else {
          quality -= 0.1;
          tryCompress();
        }
      };
      
      tryCompress();
    };
    
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 使用 Capacitor 原生 HTTP 发送请求
 */
async function nativeHttpRequest(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  data?: any,
  headers?: Record<string, string>
): Promise<{ status: number; data: any }> {
  const platform = Capacitor.getPlatform();
  console.log('📱 当前平台:', platform, ', 原生模式:', Capacitor.isNativePlatform());
  console.log('📤 请求 URL:', url);
  console.log('📤 请求方法:', method);
  console.log('📤 请求数据大小:', data ? JSON.stringify(data).length : 0, 'bytes');
  
  if (Capacitor.isNativePlatform()) {
    console.log('🔌 使用 CapacitorHttp 原生请求');
    
    try {
      const requestOptions = {
        url,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        data: data || {}
      };
      console.log('📤 请求配置:', JSON.stringify({
        url: requestOptions.url,
        method: requestOptions.method,
        headers: requestOptions.headers,
        dataLength: JSON.stringify(requestOptions.data).length
      }));
      
      const result = await CapacitorHttp.request(requestOptions);
      
      console.log('📥 原生响应状态:', result.status);
      console.log('📥 原生响应数据:', typeof result.data === 'string' ? result.data.substring(0, 200) : result.data);
      return { status: result.status, data: result.data };
    } catch (error: any) {
      console.error('❌ 原生请求失败:', error);
      console.error('❌ 错误类型:', typeof error);
      console.error('❌ 错误详情:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw new Error(error.message || JSON.stringify(error) || '原生请求失败');
    }
  } else {
    console.log('🌐 使用标准 fetch');
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: data ? JSON.stringify(data) : undefined
    });
    
    const responseData = await response.json();
    return { status: response.status, data: responseData };
  }
}

/**
 * 上传照片并创建 3D 任务
 */
export async function uploadPhotos(
  photos: PhotoFile[],
  enableBackgroundRemoval: boolean = false,
  mode: string = 'multiview'
): Promise<UploadResponse> {
  try {
    console.log('📤 开始上传...', {
      photoCount: photos.length,
      apiUrl: API_BASE_URL,
      mode,
      enableBackgroundRemoval,
      platform: Capacitor.getPlatform()
    });

    const base64Photos = await Promise.all(
      photos.map(async (photo, index) => {
        if (photo.base64) {
          console.log(`照片 ${index}: 使用已有 Base64 数据`);
          // 如果带有 DataURL 前缀，只取数据部分
          return photo.base64.includes(',') ? photo.base64.split(',')[1] : photo.base64;
        }

        if (!photo.file) {
          throw new Error(`照片 ${index} 缺少文件对象或 Base64 数据`);
        }

        console.log(`照片 ${index}: 使用 File 对象并压缩`, {
          name: photo.file.name,
          size: photo.file.size,
          type: photo.file.type
        });
        
        // 压缩图片到 3MB 以内
        const compressed = await compressImage(photo.file, 3000);
        console.log(`照片 ${index} 压缩后大小: ${Math.round(compressed.length * 0.75 / 1024)}KB`);
        return compressed;
      })
    );

    console.log('📷 Base64 转换完成，总大小约:', Math.round(base64Photos.reduce((a, b) => a + b.length, 0) / 1024), 'KB');

    const url = `${API_BASE_URL}/upload/base64`;
    console.log('🌐 发起请求:', url);

    const startTime = Date.now();
    
    const { status, data: result } = await nativeHttpRequest(
      url,
      'POST',
      {
        photos: base64Photos,
        mode,
        enableBackgroundRemoval
      },
      { 'Content-Type': 'application/json' }
    );

    const elapsed = Date.now() - startTime;
    console.log('⏱️ 请求耗时:', elapsed, 'ms');
    console.log('📥 响应状态:', status);
    console.log('📥 响应数据:', result);

    if (status >= 200 && status < 300 && result.success) {
      console.log('✅ 上传成功:', result);
      return {
        success: true,
        taskId: result.taskId,
        status: result.status,
        message: result.message || '照片上传成功',
        photos: result.photos,
        estimatedTime: result.estimatedTime,
      };
    } else {
      console.error('❌ 上传失败:', status, result);
      return {
        success: false,
        error: result?.message || result?.error || `HTTP ${status}`,
      };
    }
  } catch (error) {
    console.error('上传照片失败:', error);
    
    let errorDetail = '上传失败';
    if (error instanceof TypeError) {
      errorDetail = `网络请求被阻止: ${error.message}`;
    } else if (error instanceof Error) {
      errorDetail = error.message;
    }
    
    const diagInfo = {
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform(),
      url: API_BASE_URL,
      onLine: navigator.onLine,
      timestamp: new Date().toISOString()
    };
    console.log('📋 诊断信息:', diagInfo);
    
    return {
      success: false,
      error: `${errorDetail} [平台:${diagInfo.platform}, 原生:${diagInfo.isNative}]`,
    };
  }
}

/**
 * 查询任务状态
 * @param taskId 任务 ID
 * @returns 任务状态信息
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/status/${taskId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      taskId: result.taskId,
      status: result.status,
      progress: result.progress || 0,
      statusMessage: result.statusMessage,
      modelUrls: result.modelUrls,
      error: result.error,
      provider: result.provider,
      photoCount: result.photoCount,
      createdAt: result.createdAt,
    };
  } catch (error) {
    console.error('查询任务状态失败:', error);
    return {
      success: false,
      taskId,
      status: 'FAILED',
      progress: 0,
      error: error instanceof Error ? error.message : '查询失败',
    };
  }
}

/**
 * 轮询任务状态直到完成
 * @param taskId 任务 ID
 * @param onProgress 进度回调
 * @param onComplete 完成回调
 * @param onError 错误回调
 * @param intervalMs 轮询间隔（毫秒）
 */
export function pollTaskStatus(
  taskId: string,
  onProgress?: (progress: number, status: string, statusMessage?: string) => void,
  onComplete?: (modelUrls: string[]) => void,
  onError?: (error: string) => void,
  intervalMs: number = 3000
): () => void {
  let stopped = false;

  const poll = async () => {
    if (stopped) return;

    const result = await getTaskStatus(taskId);

    if (!result.success) {
      onError?.(result.error || '查询任务状态失败');
      return;
    }

    onProgress?.(result.progress, result.status, result.statusMessage);

    if (result.status === 'SUCCEEDED') {
      onComplete?.(result.modelUrls || []);
      return;
    }

    if (result.status === 'FAILED') {
      onError?.(result.error || '任务处理失败');
      return;
    }

    // 继续轮询
    if (!stopped) {
      setTimeout(poll, intervalMs);
    }
  };

  poll();

  // 返回停止轮询的函数
  return () => {
    stopped = true;
  };
}