/**
 * 订单状态常量定义
 * 
 * 定义 3D 打印订单生命周期中的所有可能状态
 * 用于订单状态机 (OrderStateMachine) 的状态管理
 */

/**
 * 订单状态枚举
 * @readonly
 * @enum {string}
 */
const OrderStates = {
  /** 待审核 - 订单刚创建，等待管理员审核 */
  PENDING_REVIEW: 'pending_review',
  
  /** 审核中 - 管理员正在审核订单详情 */
  REVIEWING: 'reviewing',
  
  /** 已排程 - 审核通过，已安排打印计划 */
  SCHEDULED: 'scheduled',
  
  /** 打印中 - 3D 打印机正在执行打印任务 */
  PRINTING: 'printing',
  
  /** 后处理 - 打印完成，正在进行后处理（支撑去除、打磨等） */
  POST_PROCESSING: 'post_processing',
  
  /** 已完成 - 所有处理完成，等待发货 */
  COMPLETED: 'completed',
  
  /** 已发货 - 订单已发货给客户 */
  SHIPPED: 'shipped',
  
  /** 已取消 - 订单被取消（审核拒绝或客户取消） */
  CANCELLED: 'cancelled',
  
  /** 已退款 - 订单已完成退款流程 */
  REFUNDED: 'refunded'
};

/**
 * 状态中文名称映射
 * 用于前端展示和日志记录
 */
const OrderStateLabels = {
  [OrderStates.PENDING_REVIEW]: '待审核',
  [OrderStates.REVIEWING]: '审核中',
  [OrderStates.SCHEDULED]: '已排程',
  [OrderStates.PRINTING]: '打印中',
  [OrderStates.POST_PROCESSING]: '后处理',
  [OrderStates.COMPLETED]: '已完成',
  [OrderStates.SHIPPED]: '已发货',
  [OrderStates.CANCELLED]: '已取消',
  [OrderStates.REFUNDED]: '已退款'
};

/**
 * 终端状态列表
 * 终端状态指订单生命周期的最终状态，不可再转换到其他状态
 * （除了退款状态可以从取消状态转换）
 */
const TERMINAL_STATES = [
  OrderStates.COMPLETED,
  OrderStates.SHIPPED,
  OrderStates.CANCELLED,
  OrderStates.REFUNDED
];

/**
 * 检查给定状态是否为终端状态
 * @param {string} state - 要检查的状态值
 * @returns {boolean} 如果是终端状态返回 true
 */
function isTerminalState(state) {
  return TERMINAL_STATES.includes(state);
}

/**
 * 获取状态的中文标签
 * @param {string} state - 状态值
 * @returns {string} 对应的中文标签
 */
function getStateLabel(state) {
  return OrderStateLabels[state] || '未知状态';
}

/**
 * 获取所有有效状态列表
 * @returns {string[]} 所有状态值的数组
 */
function getAllStates() {
  return Object.values(OrderStates);
}

/**
 * 验证状态值是否有效
 * @param {string} state - 要验证的状态值
 * @returns {boolean} 如果是有效状态返回 true
 */
function isValidState(state) {
  return getAllStates().includes(state);
}

module.exports = {
  OrderStates,
  OrderStateLabels,
  TERMINAL_STATES,
  isTerminalState,
  getStateLabel,
  getAllStates,
  isValidState
};
