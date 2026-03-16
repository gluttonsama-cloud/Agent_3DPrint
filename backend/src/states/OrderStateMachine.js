/**
 * 订单状态机核心类
 * 
 * 实现有限状态机（FSM）来管理 3D 打印订单的整个生命周期
 * 集成 AgentEventEmitter 进行状态变更事件推送
 */

const { EventEmitter } = require('events');
const { OrderStates, isTerminalState, getStateLabel, isValidState } = require('../constants/orderStates');
const { canTransition, getTransitionAction } = require('./transitions');
const { onEnter, onExit, onTransition, getTransitionDescription } = require('./hooks');
const { agentEventEmitter } = require('../utils/AgentEventEmitter');

/**
 * 订单状态机类
 * 
 * 管理订单的状态转换、历史记录和事件发射
 */
class OrderStateMachine extends EventEmitter {
  /**
   * 创建状态机实例
   * @param {string} orderId - 订单 ID
   * @param {string} [initialState=OrderStates.PENDING_REVIEW] - 初始状态
   */
  constructor(orderId, initialState = OrderStates.PENDING_REVIEW) {
    super();
    
    if (!orderId) {
      throw new Error('订单 ID 不能为空');
    }
    
    if (!isValidState(initialState)) {
      throw new Error(`无效的初始状态：${initialState}`);
    }
    
    this.orderId = orderId;
    this.currentState = initialState;
    this.stateHistory = [
      {
        state: initialState,
        timestamp: new Date().toISOString(),
        context: { system: 'initialized' }
      }
    ];
    this.metadata = {}; // 存储状态相关的元数据
    
    console.log(`[OrderStateMachine] 订单 ${orderId} 状态机已创建，初始状态：${getStateLabel(initialState)}`);
  }
  
  /**
   * 检查是否可以转换到目标状态
   * @param {string} toState - 目标状态
   * @returns {boolean} 是否允许转换
   */
  canTransition(toState) {
    if (!isValidState(toState)) {
      return false;
    }
    
    return canTransition(this.currentState, toState);
  }
  
  /**
   * 获取当前状态可以执行的所有操作
   * @returns {Array<{toState: string, action: string, label: string}>}
   */
  getAvailableActions() {
    const { getAvailableActions } = require('./transitions');
    return getAvailableActions(this.currentState);
  }
  
  /**
   * 执行状态转换
   * @param {string} toState - 目标状态
   * @param {Object} [context={}] - 转换上下文信息
   * @returns {Promise<Object>} 转换结果
   */
  async transition(toState, context = {}) {
    // 验证目标状态
    if (!isValidState(toState)) {
      const error = new Error(`无效的目标状态：${toState}`);
      error.code = 'INVALID_STATE';
      throw error;
    }
    
    // 检查是否允许转换
    if (!this.canTransition(toState)) {
      const error = new Error(
        `不允许的状态转换：从 ${getStateLabel(this.currentState)} 到 ${getStateLabel(toState)}`
      );
      error.code = 'INVALID_TRANSITION';
      error.fromState = this.currentState;
      error.toState = toState;
      throw error;
    }
    
    // 检查是否允许转换（已经由 canTransition 检查过，这里是双重保护）
    if (!canTransition(this.currentState, toState)) {
      const error = new Error(
        `不允许的状态转换：从 ${getStateLabel(this.currentState)} 到 ${getStateLabel(toState)}`
      );
      error.code = 'INVALID_TRANSITION';
      error.fromState = this.currentState;
      error.toState = toState;
      throw error;
    }
    
    const fromState = this.currentState;
    const transitionDesc = getTransitionDescription(fromState, toState);
    
    console.log(
      `[OrderStateMachine] 订单 ${this.orderId} 状态转换：` +
      `${transitionDesc.fromStateLabel} -> ${transitionDesc.toStateLabel} ` +
      `(${transitionDesc.actionLabel})`
    );
    
    try {
      // 1. 触发退出钩子
      await onExit(fromState, {
        orderId: this.orderId,
        state: fromState,
        nextState: toState,
        ...context,
        ...this.metadata
      });
      
      // 2. 触发转换钩子
      await onTransition(fromState, toState, {
        orderId: this.orderId,
        fromState,
        toState,
        ...context,
        ...this.metadata
      });
      
      // 3. 执行状态更新
      const previousState = this.currentState;
      this.currentState = toState;
      
      // 4. 记录历史
      const historyEntry = {
        state: toState,
        timestamp: new Date().toISOString(),
        fromState,
        action: transitionDesc.action,
        actionLabel: transitionDesc.actionLabel,
        context: {
          ...context,
          operator: context.operator || 'system'
        }
      };
      this.stateHistory.push(historyEntry);
      
      // 5. 触发进入钩子
      await onEnter(toState, {
        orderId: this.orderId,
        state: toState,
        previousState: fromState,
        ...context,
        ...this.metadata
      });
      
      // 6. 发射状态变更事件到 AgentEventEmitter
      agentEventEmitter.emitEvent('order_state_changed', {
        orderId: this.orderId,
        fromState,
        toState,
        fromStateLabel: transitionDesc.fromStateLabel,
        toStateLabel: transitionDesc.toStateLabel,
        action: transitionDesc.action,
        actionLabel: transitionDesc.actionLabel,
        timestamp: historyEntry.timestamp,
        context
      });
      
      // 7. 发射本机 EventEmitter 事件
      this.emit('stateChanged', {
        orderId: this.orderId,
        fromState,
        toState,
        context
      });
      
      // 8. 发射特定状态事件
      this.emit(`state:${toState}`, {
        orderId: this.orderId,
        fromState,
        context
      });
      
      return {
        success: true,
        orderId: this.orderId,
        fromState,
        toState,
        transition: transitionDesc,
        timestamp: historyEntry.timestamp
      };
      
    } catch (error) {
      console.error(
        `[OrderStateMachine] 订单 ${this.orderId} 状态转换失败:`,
        error.message
      );
      
      // 发射错误事件
      agentEventEmitter.emitEvent('order_state_error', {
        orderId: this.orderId,
        fromState,
        toState,
        error: error.message,
        code: error.code
      });
      
      this.emit('error', {
        orderId: this.orderId,
        error,
        fromState,
        toState
      });
      
      throw error;
    }
  }
  
  /**
   * 获取当前状态
   * @returns {string} 当前状态值
   */
  getCurrentState() {
    return this.currentState;
  }
  
  /**
   * 获取当前状态的中文标签
   * @returns {string} 状态中文标签
   */
  getCurrentStateLabel() {
    return getStateLabel(this.currentState);
  }
  
  /**
   * 获取状态历史
   * @param {number} [limit] - 限制返回数量，不传则返回全部
   * @returns {Array} 状态历史数组
   */
  getHistory(limit) {
    if (limit === undefined) {
      return [...this.stateHistory];
    }
    return this.stateHistory.slice(-limit);
  }
  
  /**
   * 获取上一次的状态
   * @returns {string|null} 上一个状态值，如果没有则返回 null
   */
  getPreviousState() {
    if (this.stateHistory.length < 2) {
      return null;
    }
    return this.stateHistory[this.stateHistory.length - 2].state;
  }
  
  /**
   * 检查当前是否为终端状态
   * @returns {boolean} 是否为终端状态
   */
  isTerminalState() {
    return isTerminalState(this.currentState);
  }
  
  /**
   * 检查是否可以继续转换
   * @returns {boolean} 是否可以继续转换
   */
  canContinue() {
    return !this.isTerminalState() && this.getAvailableActions().length > 0;
  }
  
  /**
   * 更新元数据
   * @param {Object} data - 要更新的元数据
   */
  updateMetadata(data) {
    this.metadata = { ...this.metadata, ...data };
  }
  
  /**
   * 获取元数据
   * @returns {Object} 当前元数据
   */
  getMetadata() {
    return { ...this.metadata };
  }
  
  /**
   * 重置状态机到初始状态
   * @param {string} [newInitialState] - 新的初始状态，不传则使用默认
   */
  reset(newInitialState) {
    const initialState = newInitialState || OrderStates.PENDING_REVIEW;
    this.currentState = initialState;
    this.stateHistory = [
      {
        state: initialState,
        timestamp: new Date().toISOString(),
        context: { system: 'reset' }
      }
    ];
    this.metadata = {};
    
    console.log(`[OrderStateMachine] 订单 ${this.orderId} 状态机已重置到：${getStateLabel(initialState)}`);
  }
  
  /**
   * 获取状态机的完整快照
   * @returns {Object} 状态机快照
   */
  getSnapshot() {
    return {
      orderId: this.orderId,
      currentState: this.currentState,
      currentStateLabel: this.getCurrentStateLabel(),
      isTerminal: this.isTerminalState(),
      canContinue: this.canContinue(),
      availableActions: this.getAvailableActions(),
      historyLength: this.stateHistory.length,
      lastStateChange: this.stateHistory[this.stateHistory.length - 1]?.timestamp,
      metadata: this.getMetadata()
    };
  }
}

/**
 * 创建状态机工厂函数
 * @param {string} orderId - 订单 ID
 * @param {string} [initialState] - 初始状态
 * @returns {OrderStateMachine} 状态机实例
 */
function createOrderStateMachine(orderId, initialState) {
  return new OrderStateMachine(orderId, initialState);
}

module.exports = {
  OrderStateMachine,
  createOrderStateMachine
};
