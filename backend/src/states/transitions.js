/**
 * 订单状态转换规则
 * 
 * 定义订单状态之间允许的转换关系和转换条件
 */

const { OrderStates, isTerminalState } = require('../constants/orderStates');

/**
 * 状态转换规则表
 * 键：起始状态，值：允许转换到的目标状态及其转换动作名称
 */
const TRANSITION_RULES = {
  // 待审核 -> 审核中 / 已取消
  [OrderStates.PENDING_REVIEW]: {
    [OrderStates.REVIEWING]: 'start_review',      // 开始审核
    [OrderStates.CANCELLED]: 'cancel_order'        // 取消订单
  },
  
  // 审核中 -> 已排程 / 已取消
  [OrderStates.REVIEWING]: {
    [OrderStates.SCHEDULED]: 'approve_order',      // 审核通过，安排排程
    [OrderStates.CANCELLED]: 'reject_order'        // 审核拒绝
  },
  
  // 已排程 -> 打印中 / 已取消
  [OrderStates.SCHEDULED]: {
    [OrderStates.PRINTING]: 'start_print',         // 开始打印
    [OrderStates.CANCELLED]: 'cancel_order'        // 取消订单
  },
  
  // 打印中 -> 后处理 / 已取消
  [OrderStates.PRINTING]: {
    [OrderStates.POST_PROCESSING]: 'finish_print', // 打印完成
    [OrderStates.CANCELLED]: 'cancel_order'        // 取消订单（异常）
  },
  
  // 后处理 -> 已完成 / 已取消
  [OrderStates.POST_PROCESSING]: {
    [OrderStates.COMPLETED]: 'finish_post_process',// 后处理完成
    [OrderStates.CANCELLED]: 'cancel_order'        // 取消订单（异常）
  },
  
  // 已完成 -> 已发货 / 已取消
  [OrderStates.COMPLETED]: {
    [OrderStates.SHIPPED]: 'ship_order',           // 发货
    [OrderStates.CANCELLED]: 'cancel_order'        // 取消订单（异常）
  },
  
  // 已发货 -> 已完成退款（特殊情况）
  [OrderStates.SHIPPED]: {
    [OrderStates.REFUNDED]: 'process_refund'       // 处理退款（退货退款）
  },
  
  // 已取消 -> 已退款
  [OrderStates.CANCELLED]: {
    [OrderStates.REFUNDED]: 'process_refund'       // 处理退款
  },
  
  // 已退款是终端状态，不允许再转换
  [OrderStates.REFUNDED]: {}
};

/**
 * 转换动作描述映射
 * 用于日志记录和事件通知
 */
const TRANSITION_ACTIONS = {
  start_review: '开始审核',
  cancel_order: '取消订单',
  approve_order: '审核通过',
  reject_order: '审核拒绝',
  start_print: '开始打印',
  finish_print: '打印完成',
  finish_post_process: '后处理完成',
  ship_order: '订单发货',
  process_refund: '处理退款'
};

/**
 * 获取允许的所有转换目标状态
 * @param {string} fromState - 起始状态
 * @returns {string[]} 允许转换到的状态列表
 */
function getAllowedTransitions(fromState) {
  const rules = TRANSITION_RULES[fromState];
  if (!rules) {
    return [];
  }
  return Object.keys(rules);
}

/**
 * 检查状态转换是否允许
 * @param {string} fromState - 起始状态
 * @param {string} toState - 目标状态
 * @returns {boolean} 是否允许转换
 */
function canTransition(fromState, toState) {
  const rules = TRANSITION_RULES[fromState];
  if (!rules) {
    return false;
  }
  return toState in rules;
}

/**
 * 获取状态转换的动作名称
 * @param {string} fromState - 起始状态
 * @param {string} toState - 目标状态
 * @returns {string|null} 转换动作名称，如果不允许转换则返回 null
 */
function getTransitionAction(fromState, toState) {
  const rules = TRANSITION_RULES[fromState];
  if (!rules || !rules[toState]) {
    return null;
  }
  return rules[toState];
}

/**
 * 获取转换动作的中文描述
 * @param {string} action - 转换动作名称
 * @returns {string} 中文描述
 */
function getActionLabel(action) {
  return TRANSITION_ACTIONS[action] || '未知操作';
}

/**
 * 获取从当前状态可以执行的所有操作列表
 * @param {string} fromState - 起始状态
 * @returns {Array<{toState: string, action: string, label: string}>}
 */
function getAvailableActions(fromState) {
  const rules = TRANSITION_RULES[fromState] || {};
  return Object.entries(rules).map(([toState, action]) => ({
    toState,
    action,
    label: getActionLabel(action)
  }));
}

/**
 * 检查状态是否为终端状态（无法再转换）
 * @param {string} state - 要检查的状态
 * @returns {boolean} 是否为终端状态
 */
function isTerminalTransitionState(state) {
  const rules = TRANSITION_RULES[state];
  return !rules || Object.keys(rules).length === 0;
}

module.exports = {
  TRANSITION_RULES,
  TRANSITION_ACTIONS,
  getAllowedTransitions,
  canTransition,
  getTransitionAction,
  getActionLabel,
  getAvailableActions,
  isTerminalTransitionState
};
