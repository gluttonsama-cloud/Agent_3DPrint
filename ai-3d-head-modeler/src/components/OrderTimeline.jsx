import { CheckCircle, Circle, Clock } from 'lucide-react';

// 状态图标映射
const STATE_ICONS = {
  submitted: Clock,
  pending_review: Clock,
  reviewing: Clock,
  scheduled: Clock,
  printing: Clock,
  post_processing: Clock,
  completed: CheckCircle,
  shipped: CheckCircle
};

// 状态颜色映射
const STATE_COLORS = {
  submitted: '#708090',
  pending_review: '#E2A34D',
  reviewing: '#E2A34D',
  scheduled: '#5F8DC4',
  printing: '#708090',
  post_processing: '#A67CB5',
  completed: '#4CAF50',
  shipped: '#2196F3'
};

// 状态标签映射
const STATE_LABELS = {
  submitted: '订单提交',
  pending_review: '待审核',
  reviewing: '审核中',
  scheduled: '已排程',
  printing: '打印中',
  post_processing: '后处理',
  completed: '已完成',
  shipped: '已发货'
};

/**
 * 格式化时间显示
 */
function formatTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 订单状态时间线组件
 * @param {Object} props - 组件属性
 * @param {Array} props.states - 状态历史数组
 * @param {string} props.currentState - 当前状态
 */
export default function OrderTimeline({ states = [], currentState }) {
  // 定义完整状态流程
  const fullStateFlow = [
    'submitted',
    'pending_review',
    'reviewing',
    'scheduled',
    'printing',
    'post_processing',
    'completed',
    'shipped'
  ];

  // 构建时间线数据
  const timelineData = fullStateFlow.map((stateKey, index) => {
    // 查找状态历史中是否有此状态
    const stateHistory = states.find(s => s.state === stateKey);
    const isCompleted = stateHistory !== undefined;
    const isCurrent = currentState === stateKey;
    const isPending = !isCompleted && !isCurrent;

    // 获取索引最高的已完成状态
    const completedStates = states.map(s => s.state);
    const highestCompletedIndex = fullStateFlow.reduce((maxIdx, key, idx) => {
      if (completedStates.includes(key)) {
        return Math.max(maxIdx, idx);
      }
      return maxIdx;
    }, -1);

    // 判断是否是在当前状态之前但历史中没有记录的状态
    const isActiveOrBefore = index <= highestCompletedIndex || isCurrent;

    return {
      key: stateKey,
      label: STATE_LABELS[stateKey],
      icon: STATE_ICONS[stateKey],
      color: STATE_COLORS[stateKey],
      isCompleted,
      isCurrent,
      isPending: !isActiveOrBefore,
      timestamp: stateHistory?.timestamp || stateHistory?.updatedAt,
      description: getStateDescription(stateKey)
    };
  });

  return (
    <div className="bg-white border-2 border-[var(--border-charcoal)] shadow-[6px_6px_0px_var(--border-charcoal)] p-6">
      <h3 className="text-xl font-bold text-[var(--text-charcoal)] mb-6 flex items-center gap-2">
        <Clock className="w-6 h-6 text-[var(--action-slate)]" />
        订单进度
      </h3>

      <div className="relative">
        {/* 时间线轴线 */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[var(--border-charcoal)]/30"></div>

        {/* 状态节点列表 */}
        <div className="space-y-0">
          {timelineData.map((state, index) => (
            <TimelineItem
              key={state.key}
              state={state}
              isLast={index === timelineData.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 单个时间线节点组件
 */
function TimelineItem({ state, isLast }) {
  const IconComponent = state.icon;

  return (
    <div className={`relative pl-16 pb-8 ${isLast ? 'pb-0' : ''}`}>
      {/* 状态节点圆点 */}
      <div
        className={`absolute left-0 w-12 h-12 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300
          ${state.isCurrent ? 'bg-white border-[var(--border-charcoal)] scale-110' : ''}
          ${state.isCompleted ? 'bg-[var(--border-charcoal)] border-[var(--border-charcoal)]' : ''}
          ${state.isPending ? 'bg-[var(--bg-sand)] border-[var(--border-charcoal)]/50' : ''}
        `}
        style={{
          backgroundColor: state.isCompleted ? state.color : state.isCurrent ? '#fff' : 'var(--bg-sand)',
          borderColor: state.isPending ? 'var(--border-charcoal)/50' : state.color
        }}
      >
        {state.isCompleted && !state.isCurrent ? (
          <CheckCircle className="w-6 h-6 text-white" />
        ) : (
          <IconComponent
            className="w-5 h-5"
            style={{
              color: state.isPending ? 'var(--border-charcoal)/50' : state.color
            }}
          />
        )}
      </div>

      {/* 状态内容卡片 */}
      <div
        className={`border-2 p-4 transition-all duration-300
          ${state.isCurrent
            ? 'bg-white border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)]'
            : ''}
          ${state.isCompleted && !state.isCurrent
            ? 'bg-[var(--bg-sand)] border-[var(--border-charcoal)]/50'
            : ''}
          ${state.isPending
            ? 'bg-[var(--bg-sand)] border-[var(--border-charcoal)]/30 opacity-60'
            : ''}
        `}
      >
        <div className="flex justify-between items-start mb-2">
          <h4
            className="font-bold text-[var(--text-charcoal)]"
            style={{
              color: state.isPending ? 'var(--text-charcoal)/50' : state.color
            }}
          >
            {state.label}
          </h4>
          {state.isCurrent && (
            <span className="text-xs font-bold bg-[var(--action-slate)] text-white px-2 py-1 border border-[var(--border-charcoal)]">
              进行中
            </span>
          )}
        </div>

        <p className="text-sm text-[var(--text-charcoal)]/80 mb-2">{state.description}</p>

        {state.timestamp && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-charcoal)]/60">
            <Clock className="w-3 h-3" />
            <span>{formatTime(state.timestamp)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 获取状态描述
 */
function getStateDescription(stateKey) {
  const descriptions = {
    submitted: '订单已成功提交至系统',
    pending_review: '等待工作人员审核订单信息',
    reviewing: '工作人员正在审核订单详情',
    scheduled: '已安排生产计划和排程',
    printing: '3D 打印机正在制作模型',
    post_processing: '进行支撑去除和表面处理',
    completed: '产品制作完成，等待发货',
    shipped: '已打包并发货'
  };
  return descriptions[stateKey] || '';
}
