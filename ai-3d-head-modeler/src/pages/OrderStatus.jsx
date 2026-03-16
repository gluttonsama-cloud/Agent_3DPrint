import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, Truck, Package, Printer, Settings, FileCheck, Calendar, AlertCircle } from 'lucide-react';
import OrderTimeline from '../components/OrderTimeline';
import { fetchOrderStatus } from '../services/orderService';
import { initSocket, joinOrderRoom, leaveOrderRoom, onOrderStatusChanged, offOrderStatusChanged } from '../utils/socket';

// 订单状态定义
const ORDER_STATES = {
  SUBMITTED: 'submitted',       // 订单提交
  PENDING_REVIEW: 'pending_review', // 待审核
  REVIEWING: 'reviewing',       // 审核中
  SCHEDULED: 'scheduled',       // 已排程
  PRINTING: 'printing',         // 打印中
  POST_PROCESSING: 'post_processing', // 后处理
  COMPLETED: 'completed',       // 已完成
  SHIPPED: 'shipped'            // 已发货
};

// 状态显示配置
const STATE_CONFIG = {
  [ORDER_STATES.SUBMITTED]: {
    label: '订单提交',
    icon: FileCheck,
    color: '#708090',
    description: '订单已成功提交'
  },
  [ORDER_STATES.PENDING_REVIEW]: {
    label: '待审核',
    icon: AlertCircle,
    color: '#E2A34D',
    description: '等待工作人员审核'
  },
  [ORDER_STATES.REVIEWING]: {
    label: '审核中',
    icon: FileCheck,
    color: '#E2A34D',
    description: '工作人员正在审核订单'
  },
  [ORDER_STATES.SCHEDULED]: {
    label: '已排程',
    icon: Calendar,
    color: '#5F8DC4',
    description: '已安排生产计划'
  },
  [ORDER_STATES.PRINTING]: {
    label: '打印中',
    icon: Printer,
    color: '#708090',
    description: '3D 打印正在进行中'
  },
  [ORDER_STATES.POST_PROCESSING]: {
    label: '后处理',
    icon: Settings,
    color: '#A67CB5',
    description: '支撑去除与表面处理'
  },
  [ORDER_STATES.COMPLETED]: {
    label: '已完成',
    icon: CheckCircle,
    color: '#4CAF50',
    description: '产品制作完成'
  },
  [ORDER_STATES.SHIPPED]: {
    label: '已发货',
    icon: Truck,
    color: '#2196F3',
    description: '已打包发货'
  }
};

// 状态预计完成时间（小时）
const STATE_ESTIMATED_HOURS = {
  [ORDER_STATES.SUBMITTED]: 2,
  [ORDER_STATES.PENDING_REVIEW]: 4,
  [ORDER_STATES.REVIEWING]: 2,
  [ORDER_STATES.SCHEDULED]: 12,
  [ORDER_STATES.PRINTING]: 24,
  [ORDER_STATES.POST_PROCESSING]: 8,
  [ORDER_STATES.COMPLETED]: 0,
  [ORDER_STATES.SHIPPED]: 0
};

export default function OrderStatus() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [countdown, setCountdown] = useState(null);

  // 加载订单状态
  const loadOrderStatus = async () => {
    try {
      setLoading(true);
      const result = await fetchOrderStatus(id);
      
      if (result.success) {
        setOrderData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('加载订单状态失败:', err);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 初始化 Socket.IO 连接
  useEffect(() => {
    const socket = initSocket();
    
    if (socket) {
      socket.on('connect', () => {
        console.log('Socket 连接成功');
        setSocketConnected(true);
        joinOrderRoom(socket, id);
      });

      socket.on('disconnect', () => {
        console.log('Socket 断开连接');
        setSocketConnected(false);
      });

      // 监听订单状态变更
      onOrderStatusChanged(socket, (data) => {
        console.log('订单状态变更:', data);
        if (data.orderId === id) {
          setOrderData(prev => ({
            ...prev,
            ...data
          }));
          
          // 显示通知
          showNotification('订单状态已更新', STATE_CONFIG[data.currentState]?.label || '状态已变更');
        }
      });

      return () => {
        leaveOrderRoom(socket, id);
        offOrderStatusChanged(socket);
      };
    }
  }, [id]);

  // 计算倒计时
  useEffect(() => {
    if (!orderData?.currentState || !orderData?.stateChangedAt) {
      setCountdown(null);
      return;
    }

    const estimatedHours = STATE_ESTIMATED_HOURS[orderData.currentState];
    if (estimatedHours === 0) {
      setCountdown(null);
      return;
    }

    const stateChangeTime = new Date(orderData.stateChangedAt).getTime();
    const estimatedEndTime = stateChangeTime + estimatedHours * 60 * 60 * 1000;

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = estimatedEndTime - now;

      if (remaining <= 0) {
        setCountdown(null);
        return;
      }

      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      setCountdown({ hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [orderData?.currentState, orderData?.stateChangedAt]);

  // 初始加载
  useEffect(() => {
    loadOrderStatus();
  }, [id]);

  // 显示通知
  const showNotification = (title, message) => {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'fixed top-6 right-6 bg-white border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] p-4 z-50 animate-slide-in';
    notification.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="w-2 h-2 bg-[var(--action-slate)] rounded-full mt-2"></div>
        <div>
          <p class="font-bold text-[var(--text-charcoal)]">${title}</p>
          <p class="text-sm text-[var(--text-charcoal)]/80">${message}</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  // 格式化时间
  const formatTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 获取当前状态配置
  const currentStateConfig = orderData ? STATE_CONFIG[orderData.currentState] : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-sand)]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[var(--border-charcoal)] border-t-[var(--action-slate)] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[var(--text-charcoal)] font-bold">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-sand)] p-6">
        <div className="bg-white border-2 border-[var(--border-charcoal)] shadow-[6px_6px_0px_var(--border-charcoal)] p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[var(--text-charcoal)] mb-2">加载失败</h2>
          <p className="text-[var(--text-charcoal)]/80 mb-6">{error}</p>
          <button
            onClick={loadOrderStatus}
            className="w-full h-12 bg-[var(--action-slate)] text-white font-bold border-2 border-[var(--border-charcoal)] shadow-[3px_3px_0px_var(--border-charcoal)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_var(--border-charcoal)]"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[var(--bg-sand)]">
      {/* 装饰背景 */}
      <div className="fixed top-20 right-[-60px] w-40 h-40 bg-[var(--accent-beige)] border-2 border-[var(--border-charcoal)] rotate-12 z-0 opacity-50"></div>
      <div className="fixed bottom-[40%] left-[-30px] w-24 h-24 bg-[#D4D4D8] border-2 border-[var(--border-charcoal)] -rotate-6 z-0 opacity-60"></div>
      <div className="fixed top-1/2 right-[10%] w-16 h-16 bg-[var(--action-slate)] border-2 border-[var(--border-charcoal)] rotate-45 z-0 opacity-30"></div>

      {/* 头部 */}
      <header className="p-6 flex justify-between items-center z-10 relative">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center bg-white border-2 border-[var(--border-charcoal)] shadow-[3px_3px_0px_var(--border-charcoal)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_var(--border-charcoal)] text-[var(--text-charcoal)] hover:bg-[var(--accent-beige)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5 font-bold" strokeWidth={3} />
        </button>
        <h1 className="text-lg font-bold tracking-widest uppercase text-[var(--text-charcoal)]">订单追踪</h1>
        <div className="w-10 flex items-center justify-center">
          {socketConnected && (
            <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--border-charcoal)] animate-pulse"></div>
          )}
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 px-6 pb-6 z-10 relative overflow-y-auto">
        {/* 订单信息卡片 */}
        <div className="bg-white border-2 border-[var(--border-charcoal)] shadow-[6px_6px_0px_var(--border-charcoal)] p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-charcoal)] mb-1">订单 #{orderData?.orderNumber || id}</h2>
              <p className="text-sm text-[var(--text-charcoal)]/60">创建时间：{formatTime(orderData?.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Package className="w-6 h-6 text-[var(--action-slate)]" />
              <span className="text-xs font-bold text-[var(--text-charcoal)]/80">{orderData?.quantity || 1} 件</span>
            </div>
          </div>

          {/* 当前状态 */}
          {currentStateConfig && (
            <div className="bg-[var(--bg-sand)] border-2 border-[var(--border-charcoal)] p-4 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <currentStateConfig.icon className="w-6 h-6" style={{ color: currentStateConfig.color }} />
                <span className="font-bold text-lg" style={{ color: currentStateConfig.color }}>
                  {currentStateConfig.label}
                </span>
              </div>
              <p className="text-sm text-[var(--text-charcoal)]/80">{currentStateConfig.description}</p>
            </div>
          )}

          {/* 预计完成时间 */}
          {countdown && (
            <div className="bg-[var(--accent-beige)] border-2 border-[var(--border-charcoal)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-[var(--text-charcoal)]" />
                <span className="font-bold text-[var(--text-charcoal)]">预计完成时间</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-16 bg-white border-2 border-[var(--border-charcoal)] flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-[var(--text-charcoal)]">{countdown.hours}</span>
                    <span className="text-xs text-[var(--text-charcoal)]/60">小时</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-16 bg-white border-2 border-[var(--border-charcoal)] flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-[var(--text-charcoal)]">{countdown.minutes}</span>
                    <span className="text-xs text-[var(--text-charcoal)]/60">分钟</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-16 bg-white border-2 border-[var(--border-charcoal)] flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-[var(--action-slate)]">{countdown.seconds}</span>
                    <span className="text-xs text-[var(--text-charcoal)]/60">秒</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 最后更新时间 */}
          <div className="mt-4 pt-4 border-t-2 border-[var(--border-charcoal)]">
            <p className="text-xs text-[var(--text-charcoal)]/60">
              最后更新：{formatTime(orderData?.updatedAt)}
            </p>
          </div>
        </div>

        {/* 状态时间线 */}
        <OrderTimeline 
          states={orderData?.stateHistory || []}
          currentState={orderData?.currentState}
        />

        {/* 说明信息 */}
        <div className="mt-6 bg-white border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] p-4">
          <h3 className="font-bold text-[var(--text-charcoal)] mb-2">状态说明</h3>
          <div className="space-y-2 text-sm text-[var(--text-charcoal)]/80">
            <p>• 订单提交后将在 4 小时内完成审核</p>
            <p>• 打印完成后会进行支撑去除和表面处理</p>
            <p>• 发货后将提供物流追踪号码</p>
            <p>• 实时状态更新，请关注本页面</p>
          </div>
        </div>
      </main>

      {/* CSS 动画 */}
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
