/**
 * 请求 - 响应处理器
 * 
 * 管理 Agent 之间的请求 - 响应通信模式
 * 处理请求发送、响应等待、关联 ID 匹配等
 */

const { EventEmitter } = require('events');
const { Message, MessageType, MessageStatus, createResponseMessage } = require('./Protocol');
const { agentEventEmitter } = require('../../utils/AgentEventEmitter');

/**
 * 请求记录类
 */
class PendingRequest {
  constructor(requestId, message) {
    this.requestId = requestId;
    this.message = message;
    this.createdAt = Date.now();
    this.timeoutId = null;
    this.resolve = null;
    this.reject = null;
    this.attempts = 0;
  }
  
  get isExpired() {
    const elapsed = Date.now() - this.createdAt;
    return elapsed > this.message.timeout;
  }
  
  get remainingTime() {
    const elapsed = Date.now() - this.createdAt;
    return Math.max(0, this.message.timeout - elapsed);
  }
}

/**
 * 请求 - 响应处理器类
 */
class RequestResponseHandler extends EventEmitter {
  /**
   * 创建处理器实例
   * @param {Object} options - 配置选项
   * @param {number} options.defaultTimeout - 默认超时时间（毫秒），默认 30000
   * @param {boolean} options.enableLogging - 是否启用日志，默认 true
   */
  constructor(options = {}) {
    super();
    
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.enableLogging = options.enableLogging !== false;
    
    // 待处理请求映射
    this.pendingRequests = new Map();
    
    // 请求计数器
    this.requestCounter = 0;
    
    // Agent 注册中心引用
    this.agentRegistry = null;
    
    if (this.enableLogging) {
      console.log('[RequestResponseHandler] 初始化完成');
    }
  }
  
  /**
   * 设置 Agent 注册中心
   * @param {Object} registry - AgentRegistry 实例
   */
  setAgentRegistry(registry) {
    this.agentRegistry = registry;
  }
  
  /**
   * 生成请求 ID
   * @returns {string} 请求 ID
   */
  generateRequestId() {
    this.requestCounter++;
    return `req_${Date.now()}_${this.requestCounter}`;
  }
  
  /**
   * 发送请求并等待响应
   * @param {string} targetAgentId - 目标 Agent ID
   * @param {string} action - 动作类型
   * @param {Object} data - 请求数据
   * @param {Object} options - 可选配置
   * @returns {Promise<Object>} 响应结果
   */
  async sendRequest(targetAgentId, action, data, options = {}) {
    const requestId = options.correlationId || this.generateRequestId();
    const timeout = options.timeout || this.defaultTimeout;
    const fromAgentId = options.fromAgentId || 'unknown';
    
    if (this.enableLogging) {
      console.log('[RequestResponseHandler] 发送请求:', {
        requestId,
        targetAgentId,
        action,
        timeout
      });
    }
    
    // 创建请求消息
    const message = new Message({
      from: fromAgentId,
      to: targetAgentId,
      type: MessageType.REQUEST,
      action,
      data,
      timeout,
      correlationId: requestId,
      priority: options.priority
    });
    
    // 验证消息
    const validation = message.validate();
    if (!validation.valid) {
      throw new Error(`消息验证失败：${validation.errors.join(', ')}`);
    }
    
    // 创建待处理请求记录
    const pendingRequest = new PendingRequest(requestId, message);
    
    // 创建 Promise
    const responsePromise = new Promise((resolve, reject) => {
      pendingRequest.resolve = resolve;
      pendingRequest.reject = reject;
      
      // 设置超时
      pendingRequest.timeoutId = setTimeout(() => {
        this.handleTimeout(requestId);
      }, timeout);
      
      // 存储请求
      this.pendingRequests.set(requestId, pendingRequest);
    });
    
    // 发射请求发送事件
    agentEventEmitter.emitEvent('request_sent', {
      requestId,
      from: fromAgentId,
      to: targetAgentId,
      action,
      data
    });
    
    // 获取目标 Agent
    const targetAgent = this.agentRegistry?.get(targetAgentId);
    
    if (!targetAgent) {
      clearTimeout(pendingRequest.timeoutId);
      this.pendingRequests.delete(requestId);
      
      const error = new Error(`目标 Agent 不存在：${targetAgentId}`);
      error.code = 'AGENT_NOT_FOUND';
      
      agentEventEmitter.emitEvent('request_failed', {
        requestId,
        error: error.message
      });
      
      throw error;
    }
    
    // 检查目标 Agent 是否有 handleRequest 方法
    if (!targetAgent.handleRequest) {
      clearTimeout(pendingRequest.timeoutId);
      this.pendingRequests.delete(requestId);
      
      const error = new Error(`Agent 不支持请求处理：${targetAgentId}`);
      error.code = 'METHOD_NOT_SUPPORTED';
      
      agentEventEmitter.emitEvent('request_failed', {
        requestId,
        error: error.message
      });
      
      throw error;
    }
    
    try {
      // 调用目标 Agent
      const response = await targetAgent.handleRequest({
        requestId,
        fromAgentId,
        action,
        data,
        timestamp: Date.now()
      });
      
      // 处理响应
      this.handleResponse(requestId, response);
      
      return response;
    } catch (error) {
      this.handleError(requestId, error);
      throw error;
    }
  }
  
  /**
   * 处理响应
   * @param {string} requestId - 请求 ID
   * @param {Object} response - 响应数据
   */
  handleResponse(requestId, response) {
    const pendingRequest = this.pendingRequests.get(requestId);
    
    if (!pendingRequest) {
      console.warn('[RequestResponseHandler] 未找到待处理请求:', requestId);
      return;
    }
    
    // 清除超时
    clearTimeout(pendingRequest.timeoutId);
    
    // 更新消息状态
    pendingRequest.message.updateStatus(MessageStatus.ACKNOWLEDGED);
    
    // 解析 Promise
    pendingRequest.resolve(response);
    
    // 清理请求
    this.pendingRequests.delete(requestId);
    
    if (this.enableLogging) {
      console.log('[RequestResponseHandler] 请求完成:', requestId);
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('request_completed', {
      requestId,
      response
    });
  }
  
  /**
   * 处理错误
   * @param {string} requestId - 请求 ID
   * @param {Error} error - 错误对象
   */
  handleError(requestId, error) {
    const pendingRequest = this.pendingRequests.get(requestId);
    
    if (!pendingRequest) {
      return;
    }
    
    // 清除超时
    clearTimeout(pendingRequest.timeoutId);
    
    // 更新消息状态
    pendingRequest.message.updateStatus(MessageStatus.FAILED);
    pendingRequest.message.setError(error);
    
    // 拒绝 Promise
    pendingRequest.reject(error);
    
    // 清理请求
    this.pendingRequests.delete(requestId);
    
    if (this.enableLogging) {
      console.error('[RequestResponseHandler] 请求失败:', requestId, error.message);
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('request_failed', {
      requestId,
      error: error.message
    });
  }
  
  /**
   * 处理超时
   * @param {string} requestId - 请求 ID
   */
  handleTimeout(requestId) {
    const pendingRequest = this.pendingRequests.get(requestId);
    
    if (!pendingRequest) {
      return;
    }
    
    // 更新消息状态
    pendingRequest.message.updateStatus(MessageStatus.TIMEOUT);
    
    const error = new Error(`请求超时：${requestId}`);
    error.code = 'REQUEST_TIMEOUT';
    
    // 拒绝 Promise
    pendingRequest.reject(error);
    
    // 清理请求
    this.pendingRequests.delete(requestId);
    
    if (this.enableLogging) {
      console.warn('[RequestResponseHandler] 请求超时:', requestId);
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('request_timeout', {
      requestId,
      timeout: pendingRequest.message.timeout
    });
  }
  
  /**
   * 处理接收到的请求（接收方调用）
   * @param {string} requestId - 请求 ID
   * @param {string} fromAgentId - 发送方 Agent ID
   * @param {string} action - 动作类型
   * @param {Object} data - 请求数据
   * @param {number} timeout - 超时时间
   * @returns {Promise<Object>} 响应结果
   */
  async handleReceivedRequest(requestId, fromAgentId, action, data, timeout = 30000) {
    if (this.enableLogging) {
      console.log('[RequestResponseHandler] 收到请求:', {
        requestId,
        fromAgentId,
        action,
        data
      });
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('request_received', {
      requestId,
      from: fromAgentId,
      action,
      data,
      timeout
    });
    
    // 创建响应消息
    const responseMessage = createResponseMessage(requestId, {
      status: 'received',
      timestamp: Date.now()
    }, {
      from: this.agentId,
      to: fromAgentId,
      action
    });
    
    return responseMessage.data;
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
      console.log('[RequestResponseHandler] 发送响应:', {
        requestId,
        from: fromAgentId,
        to: toAgentId,
        action
      });
    }
    
    // 创建响应消息
    const responseMessage = createResponseMessage(requestId, responseData, {
      from: fromAgentId,
      to: toAgentId,
      action
    });
    
    // 发射事件
    agentEventEmitter.emitEvent('response_sent', {
      requestId,
      from: fromAgentId,
      to: toAgentId,
      action,
      data: responseData
    });
    
    return responseMessage;
  }
  
  /**
   * 获取待处理请求数量
   * @returns {number} 待处理请求数量
   */
  getPendingRequestCount() {
    return this.pendingRequests.size;
  }
  
  /**
   * 获取待处理请求列表
   * @returns {Array} 待处理请求列表
   */
  getPendingRequests() {
    return Array.from(this.pendingRequests.entries()).map(([id, request]) => ({
      requestId: id,
      targetAgentId: request.message.to,
      action: request.message.action,
      attempts: request.attempts,
      createdAt: request.createdAt,
      remainingTime: request.remainingTime,
      isExpired: request.isExpired
    }));
  }
  
  /**
   * 取消待处理请求
   * @param {string} requestId - 请求 ID
   * @returns {boolean} 是否成功取消
   */
  cancelRequest(requestId) {
    const pendingRequest = this.pendingRequests.get(requestId);
    
    if (!pendingRequest) {
      return false;
    }
    
    // 清除超时
    clearTimeout(pendingRequest.timeoutId);
    
    // 创建取消错误
    const error = new Error('请求已取消');
    error.code = 'REQUEST_CANCELLED';
    
    // 拒绝 Promise
    pendingRequest.reject(error);
    
    // 清理请求
    this.pendingRequests.delete(requestId);
    
    if (this.enableLogging) {
      console.log('[RequestResponseHandler] 请求已取消:', requestId);
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('request_cancelled', {
      requestId
    });
    
    return true;
  }
  
  /**
   * 清理所有待处理请求
   */
  clearPendingRequests() {
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      clearTimeout(pendingRequest.timeoutId);
      
      const error = new Error('请求被清理');
      error.code = 'REQUEST_CLEANUP';
      
      pendingRequest.reject(error);
    }
    
    this.pendingRequests.clear();
    
    if (this.enableLogging) {
      console.log('[RequestResponseHandler] 已清理所有待处理请求');
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('requests_cleared');
  }
  
  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const requests = Array.from(this.pendingRequests.values());
    const totalAttempts = requests.reduce((sum, req) => sum + req.attempts, 0);
    const expiredCount = requests.filter(req => req.isExpired).length;
    
    return {
      pendingRequests: this.pendingRequests.size,
      totalRequests: this.requestCounter,
      totalAttempts,
      expiredCount,
      averageRemainingTime: requests.length > 0
        ? requests.reduce((sum, req) => sum + req.remainingTime, 0) / requests.length
        : 0,
      defaultTimeout: this.defaultTimeout
    };
  }
}

module.exports = {
  RequestResponseHandler,
  PendingRequest
};
