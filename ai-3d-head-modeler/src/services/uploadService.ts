/**
 * 上传服务 API 函数
 * 处理照片上传和任务状态查询
 */

// API 基础 URL（从环境变量读取）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

/**
 * 照片文件接口
 */
export interface PhotoFile {
  file: File;
  view: string; // 视角：主视角/侧面照/仰视照/其他角度
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
 * 上传照片并创建 3D 任务
 * @param photos 照片文件列表
 * @param enableBackgroundRemoval 是否开启背景抠图
 * @param mode 上传模式（single/multiview）
 * @returns 上传结果
 */
export async function uploadPhotos(
  photos: PhotoFile[],
  enableBackgroundRemoval: boolean = true,
  mode: string = 'multiview'
): Promise<UploadResponse> {
  try {
    const formData = new FormData();
    
    // 添加照片文件
    photos.forEach((photo) => {
      formData.append('photos', photo.file);
    });
    
    // 添加参数
    formData.append('mode', mode);
    formData.append('enableBackgroundRemoval', enableBackgroundRemoval.toString());

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
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
      message: result.message || '照片上传成功',
      photos: result.photos,
      estimatedTime: result.estimatedTime,
    };
  } catch (error) {
    console.error('上传照片失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '上传失败，请重试',
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