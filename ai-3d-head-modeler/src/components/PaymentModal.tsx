import { useState, useEffect } from 'react';
import { X, Scan, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import {
  PaymentMethod,
  PaymentStatus,
  createPayment,
  getPaymentStatus,
  mockPayment,
  type PaymentQRCode,
  type PaymentStatusResponse,
} from '../services/paymentService';

interface PaymentModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 订单 ID */
  orderId: string;
  /** 支付金额 */
  amount: number;
  /** 支付成功回调 */
  onSuccess: () => void;
  /** 支付失败回调 */
  onFailed: (error?: string) => void;
  /** 关闭弹窗回调 */
  onClose: () => void;
}

export default function PaymentModal({
  visible,
  orderId,
  amount,
  onSuccess,
  onFailed,
  onClose,
}: PaymentModalProps) {
  // 选中的支付方式
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  // 支付二维码信息
  const [qrCode, setQrCode] = useState<PaymentQRCode | null>(null);
  // 支付状态
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(PaymentStatus.PENDING);
  // 是否正在创建支付订单
  const [isCreating, setIsCreating] = useState<boolean>(false);
  // 支付倒计时（秒）
  const [countdown, setCountdown] = useState<number>(0);
  // 状态轮询定时器
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // 重置状态
  const resetState = () => {
    setSelectedMethod(null);
    setQrCode(null);
    setPaymentStatus(PaymentStatus.PENDING);
    setIsCreating(false);
    setCountdown(0);
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  // 关闭弹窗
  const handleClose = () => {
    if (paymentStatus === PaymentStatus.PROCESSING) {
      // 支付中时关闭需要确认
      const confirmed = window.confirm('支付正在进行中，确定要取消支付吗？');
      if (!confirmed) return;
    }
    resetState();
    onClose();
  };

  // 创建支付订单
  const handleCreatePayment = async () => {
    if (!selectedMethod) return;

    setIsCreating(true);

    try {
      // 如果是模拟支付，直接调用模拟支付
      if (selectedMethod === PaymentMethod.MOCK_PAY) {
        const result = await mockPayment(orderId, amount);
        setPaymentStatus(result.status || PaymentStatus.PENDING);
        
        if (result.status === PaymentStatus.SUCCESS) {
          setTimeout(() => {
            handleClose();
            onSuccess();
          }, 1500);
        } else {
          onFailed(result.message);
        }
        return;
      }

      // 真实支付（微信/支付宝）
      const result = await createPayment(orderId, selectedMethod);

      if (result.success && result.qrCode) {
        setQrCode(result.qrCode);
        setPaymentStatus(PaymentStatus.PROCESSING);
        setCountdown(result.qrCode.expireTime);

        // 开始轮询支付状态
        const interval = setInterval(async () => {
          try {
            const statusResult = await getPaymentStatus(orderId);
            if (statusResult.success && statusResult.status) {
              setPaymentStatus(statusResult.status);

              if (statusResult.status === PaymentStatus.SUCCESS) {
                clearInterval(interval);
                setTimeout(() => {
                  handleClose();
                  onSuccess();
                }, 1500);
              } else if (statusResult.status === PaymentStatus.FAILED) {
                clearInterval(interval);
                onFailed(statusResult.message);
              }
            }
          } catch (error) {
            console.error('轮询支付状态失败:', error);
          }
        }, 3000);

        setPollingInterval(interval);
      } else {
        throw new Error(result.error || '创建支付订单失败');
      }
    } catch (error) {
      console.error('创建支付订单失败:', error);
      alert(`支付创建失败：${error instanceof Error ? error.message : '未知错误'}`);
      onFailed(error instanceof Error ? error.message : '支付创建失败');
    } finally {
      setIsCreating(false);
    }
  };

  // 倒计时逻辑
  useEffect(() => {
    if (countdown <= 0 || !qrCode) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, qrCode]);

  // 自动创建支付订单（选择支付方式后）
  useEffect(() => {
    if (selectedMethod && !qrCode && !isCreating) {
      handleCreatePayment();
    }
  }, [selectedMethod]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // 弹窗不可见时不渲染
  if (!visible) return null;

  // 格式化倒计时
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* 弹窗内容 */}
      <div className="relative w-full max-w-md mx-4 bg-[var(--bg-sand)] border-4 border-[var(--border-charcoal)] shadow-[8px_8px_0px_var(--border-charcoal)] z-10">
        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white border-2 border-[var(--border-charcoal)] hover:bg-[var(--accent-beige)] transition-colors"
        >
          <X className="w-5 h-5 font-bold" strokeWidth={3} />
        </button>

        {/* 弹窗头部 */}
        <div className="p-6 pb-4 border-b-2 border-[var(--border-charcoal)]">
          <h2 className="text-2xl font-bold text-[var(--text-charcoal)]">订单支付</h2>
          <p className="text-sm font-medium text-[var(--text-charcoal)]/60 mt-1">
            订单编号：{orderId}
          </p>
        </div>

        {/* 弹窗主体 */}
        <div className="p-6">
          {/* 未选择支付方式 */}
          {!selectedMethod && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-[var(--text-charcoal)]/80 mb-4">
                请选择支付方式
              </p>

              {/* 微信支付 */}
              <button
                onClick={() => setSelectedMethod(PaymentMethod.WECHAT_PAY)}
                disabled={isCreating}
                className="w-full p-4 bg-white border-2 border-[var(--border-charcoal)] hover:bg-[#07C160]/10 hover:border-[#07C160] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#07C160] flex items-center justify-center text-white font-bold text-xs">
                    微信
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-[var(--text-charcoal)]">微信支付</div>
                    <div className="text-xs text-[var(--text-charcoal)]/60">推荐方式，即时到账</div>
                  </div>
                </div>
              </button>

              {/* 支付宝支付 */}
              <button
                onClick={() => setSelectedMethod(PaymentMethod.ALIPAY)}
                disabled={isCreating}
                className="w-full p-4 bg-white border-2 border-[var(--border-charcoal)] hover:bg-[#1677FF]/10 hover:border-[#1677FF] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1677FF] flex items-center justify-center text-white font-bold text-xs">
                    支付宝
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-[var(--text-charcoal)]">支付宝支付</div>
                    <div className="text-xs text-[var(--text-charcoal)]/60">安全可靠，支持花呗</div>
                  </div>
                </div>
              </button>

              {/* 模拟支付（开发环境） */}
              {import.meta.env.DEV && (
                <button
                  onClick={() => setSelectedMethod(PaymentMethod.MOCK_PAY)}
                  disabled={isCreating}
                  className="w-full p-4 bg-white border-2 border-[var(--border-charcoal)] hover:bg-[var(--accent-beige)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[var(--action-slate)] flex items-center justify-center text-white font-bold text-xs">
                      测试
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-bold text-[var(--text-charcoal)]">模拟支付</div>
                      <div className="text-xs text-[var(--text-charcoal)]/60">仅开发环境使用，随机成功/失败</div>
                    </div>
                  </div>
                </button>
              )}
            </div>
          )}

          {/* 已选择支付方式，显示二维码 */}
          {selectedMethod && qrCode && paymentStatus === PaymentStatus.PROCESSING && (
            <div className="space-y-6">
              {/* 支付方式信息 */}
              <div className="text-center">
                <div className="inline-block px-4 py-2 bg-[var(--action-slate)] text-white font-bold text-sm">
                  {selectedMethod === PaymentMethod.WECHAT_PAY ? '微信支付' : 
                   selectedMethod === PaymentMethod.ALIPAY ? '支付宝支付' : '模拟支付'}
                </div>
              </div>

              {/* 二维码 */}
              <div className="neo-box bg-white p-6 border-2 border-[var(--border-charcoal)]">
                {qrCode.qrCodeBase64 ? (
                  <img
                    src={qrCode.qrCodeBase64}
                    alt="支付二维码"
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="aspect-square bg-gray-100 border-2 border-[var(--border-charcoal)] flex flex-col items-center justify-center gap-4">
                    <Scan className="w-20 h-20 text-[var(--border-charcoal)]" strokeWidth={1.5} />
                    <div className="text-sm font-medium text-[var(--text-charcoal)]/60">
                      {qrCode.qrCodeUrl}
                    </div>
                  </div>
                )}
              </div>

              {/* 支付指引 */}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-[var(--text-charcoal)]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">正在等待支付...</span>
                </div>
                <p className="text-sm text-[var(--text-charcoal)]/60">
                  请使用{selectedMethod === PaymentMethod.WECHAT_PAY ? '微信' : '支付宝'}扫描二维码完成支付
                </p>
              </div>

              {/* 倒计时 */}
              {countdown > 0 && (
                <div className="text-center">
                  <div className="inline-block px-4 py-2 bg-orange-100 border-2 border-orange-400 text-orange-700 font-bold">
                    支付剩余：{formatCountdown(countdown)}
                  </div>
                </div>
              )}

              {/* 支付金额 */}
              <div className="text-center">
                <div className="text-3xl font-bold text-[var(--action-slate)]">¥{amount.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* 支付成功状态 */}
          {paymentStatus === PaymentStatus.SUCCESS && (
            <div className="py-12 text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-white" strokeWidth={3} />
              </div>
              <h3 className="text-2xl font-bold text-[var(--text-charcoal)]">支付成功</h3>
              <p className="text-sm text-[var(--text-charcoal)]/60">
                支付金额：¥{amount.toFixed(2)}
              </p>
              <p className="text-xs text-[var(--text-charcoal)]/40">
                即将跳转到结果页面...
              </p>
            </div>
          )}

          {/* 支付失败状态 */}
          {paymentStatus === PaymentStatus.FAILED && (
            <div className="py-12 text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-red-500 rounded-full flex items-center justify-center">
                <AlertCircle className="w-12 h-12 text-white" strokeWidth={3} />
              </div>
              <h3 className="text-2xl font-bold text-[var(--text-charcoal)]">支付失败</h3>
              <p className="text-sm text-[var(--text-charcoal)]/60">
                请重试或选择其他支付方式
              </p>
              <button
                onClick={resetState}
                className="px-6 py-3 bg-white border-2 border-[var(--border-charcoal)] font-bold hover:bg-[var(--accent-beige)] transition-colors"
              >
                重新支付
              </button>
            </div>
          )}

          {/* 创建支付订单中 */}
          {isCreating && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-[var(--action-slate)]" />
              <p className="text-sm font-medium text-[var(--text-charcoal)]">
                正在创建支付订单...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
