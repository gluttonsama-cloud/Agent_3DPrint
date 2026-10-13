/**
 * Agent 事件发射器
 * 
 * 为多 Agent 系统提供事件推送机制
 * 与 SSE（Server-Sent Events）推送集成
 * 支持决策、任务分配、库存检查等事件类型
 */

const EventEmitter = require('events');

/**
 * Agent 事件类型枚举
 */
const AgentEventType = {
  // Agent 做出决策
  DECISION_MADE: 'decision_made',
  // 任务分配给 Agent
  TASK_ASSIGNED: 'task_assigned',
  // 库存检查完成
  INVENTORY_CHECKED: 'inventory_checked',
  // 订单处理开始
  ORDER_PROCESSING_STARTED: 'order_processing_started',
  // 订单处理完成
  ORDER_PROCESSING_COMPLETED: 'order_processing_completed',
  // 设备调度开始
  SCHEDULING_STARTED: 'scheduling_started',
  // 设备调度完成
  SCHEDULING_COMPLETED: 'scheduling_completed',
  // Agent 错误
  AGENT_ERROR: 'agent_error',
  // Agent 状态变化
  AGENT_STATE_CHANGED: 'agent_state_changed',
  // 工具调用开始
  TOOL_CALL_STARTED: 'tool_call_started',
  // 工具调用完成
  TOOL_CALL_COMPLETED: 'tool_call_completed'
};

/**
 * Agent 事件发射器类
 * 单例模式，确保全局唯一实例
 */
class AgentEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // 增加最大监听器数量
    this.eventHistory = []; // 事件历史记录
    this.maxHistory = 100; // 最多保留 100 条历史记录
  }

  /**
   * 发射事件并记录历史
   * 
   * @param {string} eventType - 事件类型
   * @param {Object} data - 事件数据
   */
  emitEvent(eventType, data) {
    const event = {
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    };

    // 记录事件历史
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift(); // 移除最早的事件
    }

    // 发射事件
    console.log(`[AgentEvent] ${eventType}:`, JSON.stringify(data, null, 2));
    this.emit(eventType, event);
    
    // 同时发射通用事件，方便监听所有 Agent 事件
    this.emit('agent_event', event);
  }

  /**
   * 发射决策事件
   * 
   * @param {Object} decision - 决策信息
   */
  emitDecision(decision) {
    this.emitEvent(AgentEventType.DECISION_MADE, {
      agentId: decision.agentId,
      decisionType: decision.type,
      orderId: decision.orderId,
      result: decision.result,
      reasoning: decision.reasoning
    });
  }

  /**
   * 发射任务分配事件
   * 
   * @param {Object} task - 任务信息
   */
  emitTaskAssigned(task) {
    this.emitEvent(AgentEventType.TASK_ASSIGNED, {
      agentId: task.agentId,
      taskId: task.id,
      orderNumber: task.orderNumber,
      priority: task.priority,
      assignedAt: new Date().toISOString()
    });
  }

  /**
   * 发射库存检查事件
   * 
   * @param {Object} inventory - 库存信息
   */
  emitInventoryChecked(inventory) {
    this.emitEvent(AgentEventType.INVENTORY_CHECKED, {
      materialType: inventory.materialType,
      currentStock: inventory.currentStock,
      requiredAmount: inventory.requiredAmount,
      isSufficient: inventory.isSufficient,
      checkedAt: new Date().toISOString()
    });
  }

  /**
   * 发射订单处理开始事件
   * 
   * @param {Object} order - 订单信息
   */
  emitOrderProcessingStarted(order) {
    this.emitEvent(AgentEventType.ORDER_PROCESSING_STARTED, {
      orderNumber: order.orderNumber,
      orderId: order._id,
      startedAt: new Date().toISOString()
    });
  }

  /**
   * 发射订单处理完成事件
   * 
   * @param {Object} order - 订单信息
   */
  emitOrderProcessingCompleted(order) {
    this.emitEvent(AgentEventType.ORDER_PROCESSING_COMPLETED, {
      orderNumber: order.orderNumber,
      orderId: order._id,
      status: order.status,
      completedAt: new Date().toISOString()
    });
  }

  /**
   * 发射调度开始事件
   * 
   * @param {Object} scheduling - 调度信息
   */
  emitSchedulingStarted(scheduling) {
    this.emitEvent(AgentEventType.SCHEDULING_STARTED, {
      orderId: scheduling.orderId,
      deviceType: scheduling.deviceType,
      startedAt: new Date().toISOString()
    });
  }

  /**
   * 发射调度完成事件
   * 
   * @param {Object} scheduling - 调度信息
   */
  emitSchedulingCompleted(scheduling) {
    this.emitEvent(AgentEventType.SCHEDULING_COMPLETED, {
      orderId: scheduling.orderId,
      deviceId: scheduling.deviceId,
      scheduledTime: scheduling.scheduledTime,
      completedAt: new Date().toISOString()
    });
  }

  /**
   * 发射设备状态变更事件
   */
  emitDeviceChanged(data) {
    this.emitEvent(AgentEventType.AGENT_STATE_CHANGED, {
      deviceId: data.deviceId,
      previousStatus: data.previousStatus,
      currentStatus: data.currentStatus,
      currentTask: data.currentTask,
      changedAt: new Date().toISOString()
    });
  }

  /**
   * 发射 Agent 错误事件
   * 
   * @param {Object} error - 错误信息
   */
  emitAgentError(error) {
    this.emitEvent(AgentEventType.AGENT_ERROR, {
      agentId: error.agentId,
      errorType: error.name,
      message: error.message,
      stack: error.stack,
      occurredAt: new Date().toISOString()
    });
  }

  /**
   * 发射 Agent 状态变化事件
   * 
   * @param {Object} state - 状态信息
   */
  emitStateChanged(state) {
    this.emitEvent(AgentEventType.AGENT_STATE_CHANGED, {
      agentId: state.agentId,
      previousState: state.previousState,
      currentState: state.currentState,
      changedAt: new Date().toISOString()
    });
  }

  /**
   * 发射工具调用开始事件
   * 
   * @param {Object} tool - 工具信息
   */
  emitToolCallStarted(tool) {
    this.emitEvent(AgentEventType.TOOL_CALL_STARTED, {
      agentId: tool.agentId,
      toolName: tool.name,
      input: tool.input,
      calledAt: new Date().toISOString()
    });
  }

  /**
   * 发射工具调用完成事件
   * 
   * @param {Object} tool - 工具信息
   */
  emitToolCallCompleted(tool) {
    this.emitEvent(AgentEventType.TOOL_CALL_COMPLETED, {
      agentId: tool.agentId,
      toolName: tool.name,
      output: tool.output,
      duration: tool.duration,
      completedAt: new Date().toISOString()
    });
  }

  /**
   * 获取事件历史记录
   * 
   * @param {number} limit - 限制返回数量
   * @returns {Array} 事件历史数组
   */
  getHistory(limit = 50) {
    return this.eventHistory.slice(-limit);
  }

  /**
   * 清空事件历史
   */
  clearHistory() {
    this.eventHistory = [];
    console.log('[AgentEvent] 事件历史已清空');
  }

  /**
   * 获取特定类型的事件历史
   * 
   * @param {string} eventType - 事件类型
   * @param {number} limit - 限制返回数量
   * @returns {Array} 过滤后的事件历史
   */
  getHistoryByType(eventType, limit = 50) {
    return this.eventHistory
      .filter(event => event.type === eventType)
      .slice(-limit);
  }
}

// 创建单例实例
const agentEventEmitter = new AgentEventEmitter();

module.exports = {
  AgentEventType,
  AgentEventEmitter,
  agentEventEmitter
};
