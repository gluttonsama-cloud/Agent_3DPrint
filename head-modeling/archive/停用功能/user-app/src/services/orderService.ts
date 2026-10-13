/**
 * 订单服务 API 函数
 * 处理与订单相关的后端 API 调用
 */

import { MaterialType, SizeType, PrecisionType } from '../utils/priceCalculator';

// API 基础 URL（从环境变量读取）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/**
 * 照片文件接口
 */
export interface PhotoFile {
  file: File;
  view: string; // 视角：主视角/侧面照/仰视照/其他角度
}

/**
 * 订单参数接口
 */
export interface OrderParameters {
  material: MaterialType;
  size: SizeType;
  precision: PrecisionType;
  quantity: number;
  enableBackgroundRemoval: boolean;
}

/**
 * 价格详情接口
 */
export interface PriceDetails {
  basePrice: number;
  materialPrice: number;
  sizePrice: number;
  precisionPrice: number;
  unitPrice: number;
  quantity: number;
  discount: number;
  totalPrice: number;
}

/**
 * 创建订单请求接口
 */
export interface CreateOrderRequest {
  photos: PhotoFile[];
  parameters: OrderParameters;
  priceDetails: PriceDetails;
}

/**
 * 创建订单响应接口
 */
export interface CreateOrderResponse {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
}

/**
 * 创建订单
 * @param photos 照片文件列表
 * @param parameters 订单参数
 * @param priceDetails 价格详情
 * @returns 订单创建结果
 */
export async function createOrder(
  photos: PhotoFile[],
  parameters: OrderParameters,
  priceDetails: PriceDetails
): Promise<CreateOrderResponse> {
  try {
    const formData = new FormData();
    
    // 添加照片文件
    photos.forEach((photo, index) => {
      formData.append(`photos`, photo.file);
      formData.append(`photo_views[]`, photo.view);
    });
    
    // 添加订单参数
    formData.append('material', parameters.material);
    formData.append('size', parameters.size);
    formData.append('precision', parameters.precision);
    formData.append('quantity', parameters.quantity.toString());
    formData.append('enableBackgroundRemoval', parameters.enableBackgroundRemoval.toString());
    
    // 添加价格详情
    formData.append('priceDetails', JSON.stringify(priceDetails));
    
    const response = await fetch(`${API_BASE_URL}/orders`, {
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
      orderId: result.orderId,
      message: result.message || '订单创建成功',
    };
  } catch (error) {
    console.error('创建订单失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 获取订单详情
 * @param orderId 订单 ID
 * @returns 订单详情
 */
export async function getOrderDetails(orderId: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('获取订单详情失败:', error);
    throw error;
  }
}

/**
 * 订单状态接口
 */
export interface OrderStatus {
  orderId: string;
  orderNumber: string;
  currentState: string;
  stateHistory: Array<{
    state: string;
    timestamp: string;
    updatedAt?: string;
  }>;
  stateChangedAt: string;
  createdAt: string;
  updatedAt: string;
  quantity?: number;
}

/**
 * 获取订单状态响应接口
 */
export interface OrderStatusResponse {
  success: boolean;
  data?: OrderStatus;
  error?: string;
}

/**
 * 获取订单状态
 * @param orderId 订单 ID
 * @returns 订单状态信息
 */
export async function fetchOrderStatus(orderId: string): Promise<OrderStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('获取订单状态失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 获取历史订单列表参数接口
 */
export interface OrderHistoryParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * 历史订单项接口
 */
export interface OrderHistoryItem {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  discount: number;
  quantity: number;
  parameters: OrderParameters;
  thumbnail?: string;
  invoiceUrl?: string;
  createdAt: string;
  updatedAt: string;
  statusProgress?: Array<{
    state: string;
    completed: boolean;
  }>;
}

/**
 * 获取历史订单列表响应接口
 */
export interface OrderHistoryResponse {
  success: boolean;
  data?: {
    orders: OrderHistoryItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
}

/**
 * 获取历史订单列表
 * @param params 查询参数
 * @returns 历史订单列表
 */
export async function fetchOrderHistory(params?: OrderHistoryParams): Promise<OrderHistoryResponse> {
  try {
    const queryParams = new URLSearchParams();
    
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    
    const queryString = queryParams.toString();
    const url = `${API_BASE_URL}/orders/history${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    return {
      success: true,
      data: {
        orders: data.orders,
        total: data.total,
        page: data.page,
        limit: data.limit,
        totalPages: data.totalPages
      },
    };
  } catch (error) {
    console.error('获取历史订单失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 重新下单响应接口
 */
export interface ReorderResponse {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
}

/**
 * 重新下单
 * @param orderId 原订单 ID
 * @returns 重新下单结果
 */
export async function reorderOrder(orderId: string): Promise<ReorderResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const result = await response.json();
    return {
      success: true,
      orderId: result.orderId,
      message: result.message || '重新下单成功',
    };
  } catch (error) {
    console.error('重新下单失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}
