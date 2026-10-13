import { Clock, CheckCircle, XCircle, Package, RotateCcw, Download } from 'lucide-react';

// 订单状态配置
const ORDER_STATUS_CONFIG = {
  submitted: {
    label: '已提交',
    icon: Clock,
    color: '#708090',
    bg: 'bg-gray-100'
  },
  pending_review: {
    label: '待审核',
    icon: Clock,
    color: '#E2A34D',
    bg: 'bg-yellow-50'
  },
  reviewing: {
    label: '审核中',
    icon: Clock,
    color: '#E2A34D',
    bg: 'bg-yellow-50'
  },
  scheduled: {
    label: '已排程',
    icon: Clock,
    color: '#5F8DC4',
    bg: 'bg-blue-50'
  },
  printing: {
    label: '打印中',
    icon: Package,
    color: '#708090',
    bg: 'bg-gray-100'
  },
  post_processing: {
    label: '后处理',
    icon: Package,
    color: '#A67CB5',
    bg: 'bg-purple-50'
  },
  completed: {
    label: '已完成',
    icon: CheckCircle,
    color: '#4CAF50',
    bg: 'bg-green-50'
  },
  cancelled: {
    label: '已取消',
    icon: XCircle,
    color: '#EF4444',
    bg: 'bg-red-50'
  },
  shipped: {
    label: '已发货',
    icon: Package,
    color: '#2196F3',
    bg: 'bg-blue-50'
  }
};

/**
 * 格式化时间显示
 */
function formatTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 格式化价格显示
 */
function formatPrice(price) {
  return `¥${Number(price).toFixed(2)}`;
}

/**
 * 历史订单卡片组件
 * @param {Object} props - 组件属性
 * @param {Object} props.order - 订单数据
 * @param {Function} props.onViewDetail - 查看详情回调
 * @param {Function} props.onReorder - 重新下单回调
 * @param {Function} props.onDownloadInvoice - 下载发票回调
 */
export default function OrderHistoryCard({ order, onViewDetail, onReorder, onDownloadInvoice }) {
  const statusConfig = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.submitted;
  const StatusIcon = statusConfig.icon;

  // 判断是否可重新下单（已完成或已取消的订单可以重新下单）
  const canReorder = ['completed', 'cancelled'].includes(order.status);

  return (
    <div className="bg-white border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] hover:shadow-[6px_6px_0px_var(--border-charcoal)] transition-all duration-200 overflow-hidden">
      {/* 卡片头部 */}
      <div className="flex items-center justify-between p-4 border-b-2 border-[var(--border-charcoal)]/20">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full border-2 border-[var(--border-charcoal)] flex items-center justify-center ${statusConfig.bg}`}>
            <StatusIcon className="w-5 h-5" style={{ color: statusConfig.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text-charcoal)]">订单号</span>
              <span className="text-sm font-medium text-[var(--text-charcoal)]/80">{order.orderNumber || order.id}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-3 h-3 text-[var(--text-charcoal)]/60" />
              <span className="text-xs text-[var(--text-charcoal)]/60">{formatTime(order.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className={`px-3 py-1.5 border-2 border-[var(--border-charcoal)] rounded-full ${statusConfig.bg}`}>
          <span className="text-xs font-bold" style={{ color: statusConfig.color }}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* 卡片内容 */}
      <div className="p-4">
        <div className="flex gap-4">
          {/* 订单缩略图 */}
          {order.thumbnail ? (
            <div className="w-20 h-20 flex-shrink-0 border-2 border-[var(--border-charcoal)] overflow-hidden">
              <img 
                src={order.thumbnail} 
                alt="订单缩略图"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-20 h-20 flex-shrink-0 border-2 border-[var(--border-charcoal)] bg-[var(--bg-sand)] flex items-center justify-center">
              <Package className="w-8 h-8 text-[var(--text-charcoal)]/40" />
            </div>
          )}

          {/* 订单信息 */}
          <div className="flex-1 min-w-0">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-charcoal)]/60">打印材料</span>
                <span className="text-sm font-medium text-[var(--text-charcoal)]">{order.parameters?.material || '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-charcoal)]/60">尺寸规格</span>
                <span className="text-sm font-medium text-[var(--text-charcoal)]">{order.parameters?.size || '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-charcoal)]/60">数量</span>
                <span className="text-sm font-medium text-[var(--text-charcoal)]">{order.quantity || 1} 件</span>
              </div>
            </div>
          </div>
        </div>

        {/* 价格和状态时间线 */}
        <div className="mt-4 pt-4 border-t-2 border-[var(--border-charcoal)]/20">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-[var(--text-charcoal)]/60">订单金额</span>
            <div className="text-right">
              <span className="text-2xl font-bold text-[var(--action-slate)]">{formatPrice(order.totalAmount)}</span>
              {order.discount > 0 && (
                <span className="text-xs text-green-600 ml-2">已优惠 {formatPrice(order.discount)}</span>
              )}
            </div>
          </div>

          {/* 状态进度条 */}
          {order.statusProgress && (
            <div className="flex items-center gap-1">
              {order.statusProgress.map((step, index) => (
                <div
                  key={index}
                  className={`flex-1 h-1.5 border border-[var(--border-charcoal)] ${
                    step.completed ? 'bg-[var(--action-slate)]' : 'bg-[var(--bg-sand)]'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 卡片底部操作区 */}
      <div className="flex items-center justify-between p-4 bg-[var(--bg-sand)] border-t-2 border-[var(--border-charcoal)]/20">
        <div className="flex gap-2">
          <button
            onClick={() => onViewDetail(order)}
            className="px-4 py-2 bg-white text-[var(--text-charcoal)] text-sm font-bold border-2 border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)] hover:bg-[var(--accent-beige)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_var(--border-charcoal)] transition-all"
          >
            查看详情
          </button>
          {canReorder && (
            <button
              onClick={() => onReorder(order)}
              className="px-4 py-2 bg-[var(--action-slate)] text-white text-sm font-bold border-2 border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)] hover:bg-[#5f6f7f] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_var(--border-charcoal)] transition-all flex items-center gap-1"
            >
              <RotateCcw className="w-4 h-4" />
              重新下单
            </button>
          )}
        </div>
        
        {order.invoiceUrl && (
          <button
            onClick={() => onDownloadInvoice(order)}
            className="px-4 py-2 bg-white text-[var(--text-charcoal)] text-sm font-bold border-2 border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)] hover:bg-[var(--accent-beige)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_var(--border-charcoal)] transition-all flex items-center gap-1"
          >
            <Download className="w-4 h-4" />
            下载发票
          </button>
        )}
      </div>
    </div>
  );
}
