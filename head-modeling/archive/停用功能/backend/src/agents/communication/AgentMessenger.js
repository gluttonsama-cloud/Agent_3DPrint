/**
 * Agent 信使（增强版）
 * 
 * 整合通信协议、消息队列、请求 - 响应处理、超时重试等功能
 * 提供统一的 Agent 通信接口
 */

const { EventEmitter } = require('events');
const {
  Message,
  MessageBuilder,
  MessageType,
  MessagePriority,
  MessageStatus,
  createRequestMessage,
  createResponseMessage,
  createNotificationMessage
} = require('./Protocol');
const { RequestResponseHandler } = require('./RequestResponseHandler');
const { TimeoutRetryManager } = require('./TimeoutRetryManager');
const { messageQueue } = require('./MessageQueue');
const { agentEventEmitter } = require('../../utils/AgentEventEmitter');

/**
 * 通信事件类型
 */
const CommunicationEventType = {
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  REQUEST_SENT: 'request_sent',
  REQUEST_RECEIVED: 'request_received',
  RESPONSE_RECEIVED: 'response_received',
  RESPONSE_SENT: 'response_sent',
  NOTIFICATION_SENT: 'notification_sent',
  NOTIFICATION_RECEIVED: 'notification_received',
  TIMEOUT: 'timeout',
  RETRY: 'retry',
  ERROR: 'error',
  QUEUE_ADDED: 'queue_added',
  QUEUE_PROCESSED: 'queue_processed'
};

/**
 * Agent 通信异常类
 */
class AgentCommunicationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'AgentCommunicationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Agent 信使类（增强版）
 */
class AgentMessenger extends EventEmitter {
  /**
   * 创建 AgentMessenger 实例
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super();
    
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.enableLogging = options.enableLogging !== false;
    this.useQueue = options.useQueue !== false;
    
    this.requestHandler = new RequestResponseHandler({
      defaultTimeout: this.timeout,
      enableLogging: this.enableLogging
    });
    
    this.timeoutManager = new TimeoutRetryManager({
      defaultTimeout: this.timeout,
      maxRetries: this.maxRetries,
      baseDelay: this.retryDelay,
      enableLogging: this.enableLogging
    });
    
    this.agentRegistry = null;
    this.messageHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;
    
    this.setupEventListeners();
    
    if (this.enableLogging) {
      console.log('[AgentMessenger] 增强版信使已初始化');
    }
  }
  
  /**
   * 设置 Agent 注册中心
   * @param {Object} registry - AgentRegistry 实例
   */
  setAgentRegistry(registry) {
    this.agentRegistry = registry;
    this.requestHandler.setAgentRegistry(registry);
  }
  
  /**
   * 设置事件监听
   */
  setupEventListeners() {
    this.requestHandler.on('timeout', (data) => {
      this.emit(CommunicationEventType.TIMEOUT, data);
      agentEventEmitter.emitEvent('messenger_timeout', data);
    });
    
    this.requestHandler.on('retry_success', (data) => {
      this.emit(CommunicationEventType.RETRY, data);
      agentEventEmitter.emitEvent('messenger_retry_success', data);
    });
    
    this.timeoutManager.on('timeout', (data) => {
      this.emit(CommunicationEventType.TIMEOUT, data);
    });
    
    this.timeoutManager.on('retry_success', (data) => {
      this.emit(CommunicationEventType.RETRY, data);
    });
    
    this.timeoutManager.on('retry_exhausted', (data) => {
      this.emit(CommunicationEventType.ERROR, {
        ...data,
        error: data.error
      });
    });
    
    if (this.useQueue && messageQueue) {
      messageQueue.on('message_completed', (data) => {
        this.emit(CommunicationEventType.QUEUE_PROCESSED, data);
        agentEventEmitter.emitEvent('messenger_queue_completed', data);
      });
      
      messageQueue.on('message_failed', (data) => {
        this.emit(CommunicationEventType.ERROR, data);
        agentEventEmitter.emitEvent('messenger_queue_failed', data);
      });
    }
  }
  
  /**
   * 发送请求
   * @param {string} targetAgentId - 目标 Agent ID
   * @param {string} action - 动作类型
   * @param {Object} data - 请求数据
   * @param {Object} options - 可选配置
   * @returns {Promise<Object>} 响应结果
   */
  async sendRequest(targetAgentId, action, data, options = {}) {
    const fromAgentId = options.fromAgentId || 'unknown';
    
    if (this.enableLogging) {
      console.log('[AgentMessenger] 发送请求:', {
        targetAgentId,
        action,
        fromAgentId
      });
    }
    
    try {
      const response = await this.requestHandler.sendRequest(
        targetAgentId,
        action,
        data,
        {
          ...options,
          fromAgentId
        }
      );
      
      this.addToHistory({
        type: MessageType.REQUEST,
        from: fromAgentId,
        to: targetAgentId,
        action,
        data,
        response,
        timestamp: new Date().toISOString()
      });
      
      this.emit(CommunicationEventType.REQUEST_SENT, {
        targetAgentId,
        action,
        data,
        response
      });
      
      return response;
    } catch (error) {
      if (this.useQueue && error.code !== 'AGENT_NOT_FOUND') {
        return this.sendRequestViaQueue(targetAgentId, action, data, options);
      }
      
      throw error;
    }
  }
  
  /**
   * 通过队列发送请求
   * @param {string} targetAgentId - 目标 Agent ID
   * @param {string} action - 动作类型
   * @param {Object} data - 请求数据
   * @param {Object} options - 可选配置
   * @returns {Promise<Object>} 作业对象
   */
  async sendRequestViaQueue(targetAgentId, action, data, options = {}) {
    if (!messageQueue) {
      throw new Error('消息队列未启用');
    }
    
    const fromAgentId = options.fromAgentId || 'unknown';
    
    const message = createRequestMessage({
      from: fromAgentId,
      to: targetAgentId,
      action,
      data,
      timeout: options.timeout || this.timeout,
      maxRetries: options.maxRetries !== undefined ? options.maxRetries : this.maxRetries,
      priority: options.priority || MessagePriority.NORMAL
    });
    
    if (this.enableLogging) {
      console.log('[AgentMessenger] 通过队列发送请求:', {
        messageId: message.messageId,
        targetAgentId,
        action
      });
    }
    
    const job = await messageQueue.addMessage(message, {
      delay: options.delay || 0
    });
    
    this.addToHistory({
      type: MessageType.REQUEST,
      viaQueue: true,
      jobId: job.id,
      from: fromAgentId,
      to: targetAgentId,
      action,
      data,
      timestamp: new Date().toISOString()
    });
    
    this.emit(CommunicationEventType.QUEUE_ADDED, {
      messageId: message.messageId,
      jobId: job.id,
      targetAgentId,
      action
    });
    
    return {
      jobId: job.id,
      messageId: message.messageId,
      status: 'queued'
    };
  }
  
  /**
   * 发送响应
   * @param {string} requestId - 请求 ID
   * @param {Object} responseData - 响应数据
   * @param {string} fromAgentId - 发送方 Agent ID
   * @param {string} toAgentId - 接收方 Agent ID
   * @param {string} action - 动作类型
   */
  sendResponse(requestId, responseData, fromAgentId, toAgentId, action) {
    if (this.enableLogging) {
      console.log('[AgentMessenger] 发送响应:', {
        requestId,
        from: fromAgentId,
        to: toAgentId
      });
    }
    
    this.requestHandler.sendResponse(requestId, responseData, fromAgentId, toAgentId, action);
    
    this.addToHistory({
      type: MessageType.RESPONSE,
      requestId,
      from: fromAgentId,
      to: toAgentId,
      action,
      data: responseData,
      timestamp: new Date().toISOString()
    });
    
    this.emit(CommunicationEventType.RESPONSE_SENT, {
      requestId,
      from: fromAgentId,
      to: toAgentId,
      data: responseData
    });
  }
  
  /**
   * 发送通知
   * @param {string} targetAgentId - 目标 Agent ID
   * @param {string} action - 动作类型
   * @param {Object} data - 通知数据
   * @param {Object} options - 可选配置
   */
  sendNotification(targetAgentId, action, data, options = {}) {
    const fromAgentId = options.fromAgentId || 'unknown';
    
    if (this.enableLogging) {
      console.log('[AgentMessenger] 发送通知:', {
        targetAgentId,
        action,
        fromAgentId
      });
    }
    
    const message = createNotificationMessage({
      from: fromAgentId,
      to: targetAgentId,
      action,
      data,
      priority: options.priority || MessagePriority.LOW
    });
    
    this.addToHistory({
      type: MessageType.NOTIFICATION,
      from: fromAgentId,
      to: targetAgentId,
      action,
      data,
      timestamp: new Date().toISOString()
    });
    
    this.emit(CommunicationEventType.NOTIFICATION_SENT, {
      targetAgentId,
      action,
      data
    });
    
    return message;
  }
  
  /**
   * 处理接收到的请求
   * @param {Object} request - 请求对象
   * @returns {Promise<Object>} 响应结果
   */
  async handleReceivedRequest(request) {
    const { requestId, fromAgentId, action, data } = request;
    
    if (this.enableLogging) {
      console.log('[AgentMessenger] 收到请求:', {
        requestId,
        fromAgentId,
        action
      });
    }
    
    this.emit(CommunicationEventType.REQUEST_RECEIVED, request);
    agentEventEmitter.emitEvent('messenger_request_received', request);
    
    return this.requestHandler.handleReceivedRequest(
      requestId,
      fromAgentId,
      action,
      data
    );
  }
  
  /**
   * 广播消息给所有 Agent
   * @param {string} action - 消息动作
   * @param {Object} payload - 消息负载
   * @param {Function} filterFn - 过滤函数
   * @returns {Promise<Array>} 所有响应结果
   */
  async broadcast(action, payload, filterFn = null) {
    if (!this.agentRegistry) {
      throw new AgentCommunicationError(
        'Agent 注册中心未设置',
        'REGISTRY_NOT_SET'
      );
    }
    
    const agents = this.agentRegistry.list();
    const results = [];
    
    for (const agent of agents) {
      if (filterFn && !filterFn(agent)) {
        continue;
      }
      
      try {
        const response = await this.sendRequest(agent.id, action, payload);
        results.push({
          agentId: agent.id,
          response,
          success: true
        });
      } catch (error) {
        results.push({
          agentId: agent.id,
          error: error.message,
          success: false
        });
      }
    }
    
    return results;
  }
  
  /**
   * 记录消息历史
   * @param {Object} message - 消息对象
   */
  addToHistory(message) {
    this.messageHistory.push(message);
    
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }
  
  /**
   * 获取消息历史
   * @param {number} limit - 限制数量
   * @returns {Array} 历史消息列表
   */
  getHistory(limit = 50) {
    return this.messageHistory.slice(-limit);
  }
  
  /**
   * 清空消息历史
   */
  clearHistory() {
    this.messageHistory = [];
    
    if (this.enableLogging) {
      console.log('[AgentMessenger] 消息历史已清空');
    }
  }
  
  /**
   * 获取待处理请求数量
   * @returns {number} 待处理请求数量
   */
  getPendingRequestCount() {
    return this.requestHandler.getPendingRequestCount();
  }
  
  /**
   * 获取待处理请求列表
   * @returns {Array} 待处理请求列表
   */
  getPendingRequests() {
    return this.requestHandler.getPendingRequests();
  }
  
  /**
   * 清理所有待处理请求
   */
  clearPendingRequests() {
    this.requestHandler.clearPendingRequests();
    this.timeoutManager.clearAll();
  }
  
  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      pendingRequests: this.getPendingRequestCount(),
      messageHistory: this.messageHistory.length,
      requestHandler: this.requestHandler.getStats(),
      timeoutManager: this.timeoutManager.getStats(),
      config: {
        timeout: this.timeout,
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay,
        useQueue: this.useQueue
      }
    };
  }
  
  /**
   * 关闭信使
   */
  close() {
    console.log('[AgentMessenger] 正在关闭...');
    
    this.clearPendingRequests();
    this.clearHistory();
    
    if (this.useQueue && messageQueue) {
      // 队列可能在其他地方使用，不关闭
    }
    
    this.removeAllListeners();
    
    console.log('[AgentMessenger] 已关闭');
  }
}

module.exports = {
  AgentMessenger,
  AgentCommunicationError,
  CommunicationEventType
};
