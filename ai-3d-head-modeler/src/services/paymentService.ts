/**
 * 支付服务 API 函数
 * 处理与支付相关的后端 API 调用
 */

// API 基础 URL（从环境变量读取）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/**
 * 支付方式枚举
 */
export enum PaymentMethod {
  /** 微信支付 */
  WECHAT_PAY = 'wechat_pay',
  /** 支付宝支付 */
  ALIPAY = 'alipay',
  /** 模拟支付（开发环境） */
  MOCK_PAY = 'mock_pay',
}

/**
 * 支付状态枚举
 */
export enum PaymentStatus {
  /** 待支付 */
  PENDING = 'pending',
  /** 支付中 */
  PROCESSING = 'processing',
  /** 支付成功 */
  SUCCESS = 'success',
  /** 支付失败 */
  FAILED = 'failed',
  /** 已取消 */
  CANCELLED = 'cancelled',
}

/**
 * 支付二维码信息接口
 */
export interface PaymentQRCode {
  /** 二维码内容（URL 或数据） */
  qrCodeUrl: string;
  /** 二维码图片 Base64（可选） */
  qrCodeBase64?: string;
  /** 支付订单号 */
  paymentOrderNo: string;
  /** 支付过期时间（秒） */
  expireTime: number;
}

/**
 * 创建支付请求接口
 */
export interface CreatePaymentRequest {
  /** 订单 ID */
  orderId: string;
  /** 支付方式 */
  paymentMethod: PaymentMethod;
}

/**
 * 创建支付响应接口
 */
export interface CreatePaymentResponse {
  success: boolean;
  qrCode?: PaymentQRCode;
  message?: string;
  error?: string;
}

/**
 * 支付状态查询响应接口
 */
export interface PaymentStatusResponse {
  success: boolean;
  status?: PaymentStatus;
  paymentOrderNo?: string;
  paymentTime?: string;
  amount?: number;
  message?: string;
  error?: string;
}

/**
 * 支付回调请求接口（后端使用，前端仅供参考）
 */
export interface PaymentCallbackRequest {
  /** 支付订单号 */
  paymentOrderNo: string;
  /** 商户订单 ID */
  orderId: string;
  /** 支付状态 */
  status: PaymentStatus;
  /** 支付金额 */
  amount: number;
  /** 支付时间 */
  paymentTime: string;
  /** 支付方式 */
  paymentMethod: PaymentMethod;
  /** 第三方交易号 */
  transactionId?: string;
}

/**
 * 创建支付订单
 * @param orderId 订单 ID
 * @param paymentMethod 支付方式
 * @returns 支付二维码信息
 */
export async function createPayment(
  orderId: string,
  paymentMethod: PaymentMethod
): Promise<CreatePaymentResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentMethod,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: true,
      qrCode: result.qrCode,
      message: result.message || '支付订单创建成功',
    };
  } catch (error) {
    console.error('创建支付订单失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 查询支付状态
 * @param orderId 订单 ID
 * @returns 支付状态信息
 */
export async function getPaymentStatus(orderId: string): Promise<PaymentStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/payment-status`, {
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
      status: result.status,
      paymentOrderNo: result.paymentOrderNo,
      paymentTime: result.paymentTime,
      amount: result.amount,
      message: result.message,
    };
  } catch (error) {
    console.error('查询支付状态失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 轮询支付状态
 * @param orderId 订单 ID
 * @param onStatusChange 状态变化回调
 * @param intervalMs 轮询间隔（毫秒），默认 3000ms
 * @param timeoutMs 超时时间（毫秒），默认 300000ms（5 分钟）
 * @returns 轮询停止时的支付状态
 */
export async function pollPaymentStatus(
  orderId: string,
  onStatusChange: (status: PaymentStatusResponse) => void,
  intervalMs: number = 3000,
  timeoutMs: number = 300000
): Promise<PaymentStatus> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const poll = async () => {
      // 检查是否超时
      if (Date.now() - startTime > timeoutMs) {
        console.warn('支付状态轮询超时');
        resolve(PaymentStatus.PENDING);
        return;
      }

      try {
        const result = await getPaymentStatus(orderId);
        onStatusChange(result);

        // 如果支付成功或失败，停止轮询
        if (result.status === PaymentStatus.SUCCESS || result.status === PaymentStatus.FAILED) {
          resolve(result.status!);
          return;
        }

        // 继续轮询
        setTimeout(poll, intervalMs);
      } catch (error) {
        console.error('支付状态轮询出错:', error);
        // 出错时继续轮询
        setTimeout(poll, intervalMs);
      }
    };

    // 开始第一次轮询
    poll();
  });
}

/**
 * 模拟支付（开发环境专用）
 * @param orderId 订单 ID
 * @param amount 支付金额
 * @returns 模拟支付结果
 */
export async function mockPayment(
  orderId: string,
  amount: number
): Promise<PaymentStatusResponse> {
  console.log('[模拟支付] 订单 ID:', orderId, '金额:', amount);
  
  // 模拟支付处理延迟
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 模拟支付结果（90% 成功率）
  const success = Math.random() > 0.1;

  if (success) {
    return {
      success: true,
      status: PaymentStatus.SUCCESS,
      paymentOrderNo: `MOCK_${Date.now()}`,
      paymentTime: new Date().toISOString(),
      amount,
      message: '模拟支付成功',
    };
  } else {
    return {
      success: false,
      status: PaymentStatus.FAILED,
      message: '模拟支付失败（随机失败）',
    };
  }
}
