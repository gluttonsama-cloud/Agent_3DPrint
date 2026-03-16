/**
 * 订单状态变更钩子函数
 * 
 * 定义在订单状态转换的不同阶段触发的回调函数
 * 用于执行状态相关的业务逻辑，如发送通知、更新库存等
 */

const { OrderStates, getStateLabel } = require('../constants/orderStates');
const { getTransitionAction, getActionLabel } = require('./transitions');

/**
 * 钩子函数注册表
 * 允许外部模块注册自定义钩子函数
 */
const hookRegistry = {
  onEnter: {},  // 进入状态时触发
  onExit: {},   // 退出状态时触发
  onTransition: {}  // 状态转换时触发
};

/**
 * 注册钩子函数
 * @param {'onEnter'|'onExit'|'onTransition'} hookType - 钩子类型
 * @param {string} state - 状态值（onTransition 时可以为 '*' 匹配所有转换）
 * @param {Function} callback - 钩子函数
 */
function registerHook(hookType, state, callback) {
  if (!hookRegistry[hookType]) {
    throw new Error(`未知的钩子类型：${hookType}`);
  }
  
  if (!hookRegistry[hookType][state]) {
    hookRegistry[hookType][state] = [];
  }
  
  hookRegistry[hookType][state].push(callback);
}

/**
 * 注销钩子函数
 * @param {'onEnter'|'onExit'|'onTransition'} hookType - 钩子类型
 * @param {string} state - 状态值
 * @param {Function} callback - 要移除的钩子函数
 */
function unregisterHook(hookType, state, callback) {
  if (!hookRegistry[hookType] || !hookRegistry[hookType][state]) {
    return;
  }
  
  hookRegistry[hookType][state] = hookRegistry[hookType][state].filter(
    cb => cb !== callback
  );
}

/**
 * 执行钩子函数
 * @param {'onEnter'|'onExit'|'onTransition'} hookType - 钩子类型
 * @param {string} key - 状态键或转换键
 * @param {Object} context - 传递给钩子的上下文信息
 */
async function executeHooks(hookType, key, context) {
  const hooks = hookRegistry[hookType][key] || [];
  
  // 执行所有注册的钩子函数
  for (const hook of hooks) {
    try {
      await hook(context);
    } catch (error) {
      console.error(`执行${hookType}钩子函数失败 [${key}]:`, error);
      // 继续执行其他钩子，不中断整个流程
    }
  }
}

/**
 * 内置状态进入处理函数
 * 定义每个状态进入时的默认行为
 */
const builtInOnEnterHandlers = {
  [OrderStates.PENDING_REVIEW]: async (context) => {
    console.log(`[订单 ${context.orderId}] 进入待审核状态，等待管理员处理`);
  },
  
  [OrderStates.REVIEWING]: async (context) => {
    console.log(`[订单 ${context.orderId}] 开始审核，审核员：${context.operator}`);
  },
  
  [OrderStates.SCHEDULED]: async (context) => {
    console.log(`[订单 ${context.orderId}] 已排程，计划打印时间：${context.scheduledTime}`);
  },
  
  [OrderStates.PRINTING]: async (context) => {
    console.log(`[订单 ${context.orderId}] 开始打印，打印机：${context.printerId}`);
  },
  
  [OrderStates.POST_PROCESSING]: async (context) => {
    console.log(`[订单 ${context.orderId}] 打印完成，进入后处理流程`);
  },
  
  [OrderStates.COMPLETED]: async (context) => {
    console.log(`[订单 ${context.orderId}] 后处理完成，订单已完成`);
  },
  
  [OrderStates.SHIPPED]: async (context) => {
    console.log(`[订单 ${context.orderId}] 已发货，快递单号：${context.trackingNumber}`);
  },
  
  [OrderStates.CANCELLED]: async (context) => {
    console.log(`[订单 ${context.orderId}] 订单已取消，原因：${context.cancelReason}`);
  },
  
  [OrderStates.REFUNDED]: async (context) => {
    console.log(`[订单 ${context.orderId}] 退款已完成，退款金额：${context.refundAmount}`);
  }
};

/**
 * 内置状态退出处理函数
 */
const builtInOnExitHandlers = {
  [OrderStates.PENDING_REVIEW]: async (context) => {
    console.log(`[订单 ${context.orderId}] 离开待审核状态`);
  },
  
  [OrderStates.REVIEWING]: async (context) => {
    console.log(`[订单 ${context.orderId}] 审核流程结束`);
  },
  
  [OrderStates.SCHEDULED]: async (context) => {
    console.log(`[订单 ${context.orderId}] 离开已排程状态`);
  },
  
  [OrderStates.PRINTING]: async (context) => {
    console.log(`[订单 ${context.orderId}] 打印阶段结束`);
  },
  
  [OrderStates.POST_PROCESSING]: async (context) => {
    console.log(`[订单 ${context.orderId}] 后处理阶段结束`);
  },
  
  [OrderStates.COMPLETED]: async (context) => {
    console.log(`[订单 ${context.orderId}] 离开已完成状态`);
  },
  
  [OrderStates.CANCELLED]: async (context) => {
    console.log(`[订单 ${context.orderId}] 离开已取消状态`);
  }
};

/**
 * 内置状态转换处理函数
 */
const builtInOnTransitionHandlers = {
  // 审核相关转换
  [`${OrderStates.PENDING_REVIEW}->${OrderStates.REVIEWING}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 开始审核流程`);
  },
  
  [`${OrderStates.REVIEWING}->${OrderStates.SCHEDULED}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 审核通过，已安排生产计划`);
  },
  
  [`${OrderStates.REVIEWING}->${OrderStates.CANCELLED}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 审核拒绝，订单取消`);
  },
  
  // 生产流程转换
  [`${OrderStates.SCHEDULED}->${OrderStates.PRINTING}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 开始打印作业`);
  },
  
  [`${OrderStates.PRINTING}->${OrderStates.POST_PROCESSING}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 打印完成，转入后处理`);
  },
  
  [`${OrderStates.POST_PROCESSING}->${OrderStates.COMPLETED}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 所有生产流程完成`);
  },
  
  // 发货和退款
  [`${OrderStates.COMPLETED}->${OrderStates.SHIPPED}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 订单已发货`);
  },
  
  [`${OrderStates.CANCELLED}->${OrderStates.REFUNDED}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 退款处理完成`);
  },
  
  [`${OrderStates.SHIPPED}->${OrderStates.REFUNDED}`]: async (context) => {
    console.log(`[订单 ${context.orderId}] 退货退款处理完成`);
  }
};

/**
 * 触发进入状态钩子
 * @param {string} state - 目标状态
 * @param {Object} context - 上下文信息
 */
async function onEnter(state, context) {
  // 执行内置钩子
  if (builtInOnEnterHandlers[state]) {
    await builtInOnEnterHandlers[state](context);
  }
  
  // 执行注册的钩子
  await executeHooks('onEnter', state, context);
}

/**
 * 触发退出状态钩子
 * @param {string} state - 源状态
 * @param {Object} context - 上下文信息
 */
async function onExit(state, context) {
  // 执行内置钩子
  if (builtInOnExitHandlers[state]) {
    await builtInOnExitHandlers[state](context);
  }
  
  // 执行注册的钩子
  await executeHooks('onExit', state, context);
}

/**
 * 触发状态转换钩子
 * @param {string} fromState - 源状态
 * @param {string} toState - 目标状态
 * @param {Object} context - 上下文信息
 */
async function onTransition(fromState, toState, context) {
  const transitionKey = `${fromState}->${toState}`;
  
  // 执行内置转换钩子
  if (builtInOnTransitionHandlers[transitionKey]) {
    await builtInOnTransitionHandlers[transitionKey](context);
  }
  
  // 执行通用转换钩子（匹配所有转换）
  await executeHooks('onTransition', '*', context);
  
  // 执行特定转换钩子
  await executeHooks('onTransition', transitionKey, context);
}

/**
 * 获取状态变更的完整描述
 * @param {string} fromState - 源状态
 * @param {string} toState - 目标状态
 * @returns {Object} 包含状态标签和动作描述的详细信息
 */
function getTransitionDescription(fromState, toState) {
  const action = getTransitionAction(fromState, toState);
  
  return {
    fromState,
    toState,
    fromStateLabel: getStateLabel(fromState),
    toStateLabel: getStateLabel(toState),
    action,
    actionLabel: action ? getActionLabel(action) : '未知操作'
  };
}

module.exports = {
  registerHook,
  unregisterHook,
  executeHooks,
  onEnter,
  onExit,
  onTransition,
  getTransitionDescription,
  builtInOnEnterHandlers,
  builtInOnExitHandlers,
  builtInOnTransitionHandlers
};
