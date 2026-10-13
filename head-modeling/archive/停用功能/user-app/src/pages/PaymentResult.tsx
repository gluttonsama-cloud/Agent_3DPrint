import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Package, Home, RefreshCw } from 'lucide-react';

interface LocationState {
  success: boolean;
  orderId?: string;
  amount?: number;
  paymentTime?: string;
  message?: string;
  error?: string;
}

export default function PaymentResult() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [isSuccess, setIsSuccess] = useState<boolean>(true);
  const [orderId, setOrderId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentTime, setPaymentTime] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    // 如果没有传递状态，显示错误页面
    if (!state) {
      setIsSuccess(false);
      setMessage('未找到支付结果信息');
      return;
    }

    setIsSuccess(state.success ?? false);
    setOrderId(state.orderId ?? '');
    setAmount(state.amount ?? 0);
    setPaymentTime(state.paymentTime ?? new Date().toISOString());
    setMessage(state.message ?? (state.success ? '支付成功' : '支付失败'));
  }, [state]);

  // 格式化时间
  const formatTime = (timeString: string) => {
    try {
      const date = new Date(timeString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (error) {
      return timeString;
    }
  };

  // 返回首页
  const handleGoHome = () => {
    navigate('/');
  };

  // 查看订单详情
  const handleViewOrder = () => {
    if (orderId) {
      navigate('/order', { state: { orderId } });
    }
  };

  // 重新支付
  const handleRetry = () => {
    navigate('/order', { state: { orderId, retryPayment: true } });
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[var(--bg-sand)]">
      {/* 装饰元素 */}
      <div className="fixed top-32 right-[-40px] w-32 h-32 bg-[var(--accent-beige)] border-2 border-[var(--border-charcoal)] rotate-12 z-0 opacity-50" />
      <div className="fixed bottom-[30%] left-[-20px] w-16 h-16 bg-[#D4D4D8] border-2 border-[var(--border-charcoal)] -rotate-6 z-0 opacity-60" />

      <main className="flex-1 flex items-center justify-center px-6 z-10 relative">
        <div className="w-full max-w-md">
          {/* 结果卡片 */}
          <div className="neo-box bg-white border-4 border-[var(--border-charcoal)] shadow-[8px_8px_0px_var(--border-charcoal)] p-8">
            {/* 成功/失败图标 */}
            <div className="flex justify-center mb-6">
              {isSuccess ? (
                <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center animate-bounce">
                  <CheckCircle className="w-16 h-16 text-white" strokeWidth={3} />
                </div>
              ) : (
                <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center">
                  <XCircle className="w-16 h-16 text-white" strokeWidth={3} />
                </div>
              )}
            </div>

            {/* 结果标题 */}
            <h1 className="text-3xl font-bold text-center text-[var(--text-charcoal)] mb-2">
              {isSuccess ? '支付成功' : '支付失败'}
            </h1>

            {/* 结果消息 */}
            <p className="text-center text-[var(--text-charcoal)]/60 font-medium mb-8">
              {message}
            </p>

            {/* 订单信息 */}
            <div className="neo-box bg-[var(--bg-sand)] border-2 border-[var(--border-charcoal)] p-6 mb-8">
              <h2 className="text-lg font-bold text-[var(--text-charcoal)] mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                订单信息
              </h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-charcoal)]/60">订单编号</span>
                  <span className="font-bold text-[var(--text-charcoal)] font-mono text-sm">
                    {orderId || 'N/A'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-charcoal)]/60">支付金额</span>
                  <span className="font-bold text-2xl text-[var(--action-slate)]">
                    ¥{amount.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-charcoal)]/60">支付时间</span>
                  <span className="font-medium text-[var(--text-charcoal)] text-sm">
                    {formatTime(paymentTime)}
                  </span>
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="space-y-3">
              {isSuccess ? (
                <>
                  {/* 查看订单 */}
                  <button
                    onClick={handleViewOrder}
                    className="w-full h-14 bg-[var(--action-slate)] text-white text-lg font-bold tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all hover:bg-[#5f6f7f]"
                  >
                    <Package className="w-6 h-6" />
                    查看订单详情
                  </button>

                  {/* 返回首页 */}
                  <button
                    onClick={handleGoHome}
                    className="w-full h-14 bg-white text-[var(--text-charcoal)] text-lg font-bold tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all hover:bg-[var(--accent-beige)]"
                  >
                    <Home className="w-6 h-6" />
                    返回首页
                  </button>
                </>
              ) : (
                <>
                  {/* 重新支付 */}
                  <button
                    onClick={handleRetry}
                    className="w-full h-14 bg-[var(--action-slate)] text-white text-lg font-bold tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all hover:bg-[#5f6f7f]"
                  >
                    <RefreshCw className="w-6 h-6" />
                    重新支付
                  </button>

                  {/* 返回首页 */}
                  <button
                    onClick={handleGoHome}
                    className="w-full h-14 bg-white text-[var(--text-charcoal)] text-lg font-bold tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all hover:bg-[var(--accent-beige)]"
                  >
                    <Home className="w-6 h-6" />
                    返回首页
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 提示信息 */}
          {isSuccess && (
            <div className="mt-6 text-center">
              <p className="text-sm text-[var(--text-charcoal)]/60">
                3D 模型已进入制作流程，我们将通过短信通知您取货
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
