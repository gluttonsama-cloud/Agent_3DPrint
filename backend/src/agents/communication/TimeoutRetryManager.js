/**
 * 超时和重试管理器
 * 
 * 管理 Agent 通信中的超时检测和重试逻辑
 * 实现指数退避策略、失败回调等功能
 */

const { EventEmitter } = require('events');
const { Message, MessageStatus } = require('./Protocol');
const { agentEventEmitter } = require('../../utils/AgentEventEmitter');

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  defaultTimeout: 30000,      // 默认超时时间（30 秒）
  maxRetries: 3,              // 最大重试次数
  baseDelay: 1000,            // 基础延迟（毫秒）
  maxDelay: 30000,            // 最大延迟（毫秒）
  backoffMultiplier: 2,       // 退避倍数
  enableLogging: true         // 是否启用日志
};

/**
 * 重试记录类
 */
class RetryRecord {
  constructor(requestId, action, maxRetries) {
    this.requestId = requestId;
    this.action = action;
    this.maxRetries = maxRetries;
    this.attempts = 0;
    this.lastAttemptAt = null;
    this.lastError = null;
    this.nextRetryAt = null;
    this.completed = false;
    this.cancelled = false;
  }
  
  canRetry() {
    return !this.completed && !this.cancelled && this.attempts < this.maxRetries;
  }
  
  getDelay() {
    const delay = Math.pow(2, this.attempts) * DEFAULT_CONFIG.baseDelay;
    return Math.min(delay, DEFAULT_CONFIG.maxDelay);
  }
}

/**
 * 超时和重试管理类
 */
class TimeoutRetryManager extends EventEmitter {
  /**
   * 创建管理器实例
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super();
    
    this.config = {
      ...DEFAULT_CONFIG,
      ...options
    };
    
    // 超时定时器映射
    this.timeoutTimers = new Map();
    
    // 重试记录映射
    this.retryRecords = new Map();
    
    // 重试定时器映射
    this.retryTimers = new Map();
    
    // 成功回调映射
    this.successCallbacks = new Map();
    
    // 失败回调映射
    this.failureCallbacks = new Map();
    
    if (this.config.enableLogging) {
      console.log('[TimeoutRetryManager] 初始化完成');
    }
  }
  
  /**
   * 设置超时定时器
   * @param {string} requestId - 请求 ID
   * @param {number} timeout - 超时时间（毫秒）
   * @param {Function} onTimeout - 超时回调函数
   * @returns {NodeJS.Timeout} 定时器 ID
   */
  setTimeout(requestId, timeout, onTimeout) {
    // 清除已存在的定时器
    this.clearTimeout(requestId);
    
    const timer = setTimeout(() => {
      if (this.config.enableLogging) {
        console.log('[TimeoutRetryManager] 请求超时:', requestId);
      }
      
      onTimeout();
      
      // 发射事件
      agentEventEmitter.emitEvent('request_timeout', {
        requestId,
        timeout
      });
      
      this.emit('timeout', { requestId, timeout });
    }, timeout);
    
    this.timeoutTimers.set(requestId, timer);
    
    if (this.config.enableLogging) {
      console.log('[TimeoutRetryManager] 超时定时器已设置:', requestId, timeout);
    }
    
    return timer;
  }
  
  /**
   * 清除超时定时器
   * @param {string} requestId - 请求 ID
   */
  clearTimeout(requestId) {
    const timer = this.timeoutTimers.get(requestId);
    
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(requestId);
      
      if (this.config.enableLogging) {
        console.log('[TimeoutRetryManager] 超时定时器已清除:', requestId);
      }
    }
  }
  
  /**
   * 注册重试
   * @param {string} requestId - 请求 ID
   * @param {string} action - 动作类型
   * @param {Function} retryFn - 重试函数
   * @param {Object} options - 可选配置
   * @returns {Promise<Object>} 最终结果
   */
  async registerRetry(requestId, action, retryFn, options = {}) {
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.config.maxRetries;
    
    // 创建重试记录
    const record = new RetryRecord(requestId, action, maxRetries);
    this.retryRecords.set(requestId, record);
    
    // 注册回调
    if (options.onSuccess) {
      this.successCallbacks.set(requestId, options.onSuccess);
    }
    
    if (options.onFailure) {
      this.failureCallbacks.set(requestId, options.onFailure);
    }
    
    if (this.config.enableLogging) {
      console.log('[TimeoutRetryManager] 重试已注册:', {
        requestId,
        action,
        maxRetries
      });
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('retry_registered', {
      requestId,
      action,
      maxRetries
    });
    
    // 执行重试逻辑
    return this.executeRetry(requestId, retryFn);
  }
  
  /**
   * 执行重试
   * @param {string} requestId - 请求 ID
   * @param {Function} retryFn - 重试函数
   * @returns {Promise<Object>} 最终结果
   */
  async executeRetry(requestId, retryFn) {
    const record = this.retryRecords.get(requestId);
    
    if (!record) {
      throw new Error(`重试记录不存在：${requestId}`);
    }
    
    record.attempts++;
    record.lastAttemptAt = Date.now();
    
    if (this.config.enableLogging) {
      console.log('[TimeoutRetryManager] 执行重试:', {
        requestId,
        attempt: record.attempts,
        maxRetries: record.maxRetries
      });
    }
    
    try {
      // 执行重试函数
      const result = await retryFn(record.attempts);
      
      // 成功
      record.completed = true;
      
      // 清除重试定时器
      this.clearRetryTimer(requestId);
      
      if (this.config.enableLogging) {
        console.log('[TimeoutRetryManager] 重试成功:', requestId);
      }
      
      // 调用成功回调
      const successCallback = this.successCallbacks.get(requestId);
      if (successCallback) {
        await successCallback(result, record.attempts);
      }
      
      // 发射事件
      agentEventEmitter.emitEvent('retry_success', {
        requestId,
        attempts: record.attempts
      });
      
      this.emit('retry_success', {
        requestId,
        attempts: record.attempts,
        result
      });
      
      return result;
    } catch (error) {
      record.lastError = error;
      
      if (this.config.enableLogging) {
        console.warn('[TimeoutRetryManager] 重试失败:', {
          requestId,
          attempt: record.attempts,
          error: error.message
        });
      }
      
      // 检查是否可以继续重试
      if (record.canRetry()) {
        // 计算延迟时间
        const delay = record.getDelay();
        record.nextRetryAt = Date.now() + delay;
        
        if (this.config.enableLogging) {
          console.log('[TimeoutRetryManager] 安排下次重试:', {
            requestId,
            delay,
            nextAttempt: record.nextRetryAt
          });
        }
        
        // 发射事件
        agentEventEmitter.emitEvent('retry_scheduled', {
          requestId,
          delay,
          nextAttempt: record.attempts + 1
        });
        
        // 设置重试定时器
        return this.scheduleRetry(requestId, retryFn, delay);
      } else {
        // 达到最大重试次数
        record.completed = true;
        
        if (this.config.enableLogging) {
          console.error('[TimeoutRetryManager] 达到最大重试次数:', requestId);
        }
        
        // 调用失败回调
        const failureCallback = this.failureCallbacks.get(requestId);
        if (failureCallback) {
          await failureCallback(error, record.attempts);
        }
        
        // 发射事件
        agentEventEmitter.emitEvent('retry_exhausted', {
          requestId,
          attempts: record.attempts,
          error: error.message
        });
        
        this.emit('retry_exhausted', {
          requestId,
          attempts: record.attempts,
          error
        });
        
        throw error;
      }
    }
  }
  
  /**
   * 安排延迟重试
   * @param {string} requestId - 请求 ID
   * @param {Function} retryFn - 重试函数
   * @param {number} delay - 延迟时间（毫秒）
   */
  scheduleRetry(requestId, retryFn, delay) {
    // 清除已存在的重试定时器
    this.clearRetryTimer(requestId);
    
    const timer = setTimeout(async () => {
      try {
        await this.executeRetry(requestId, retryFn);
      } catch (error) {
        // 错误已在 executeRetry 中处理
      }
    }, delay);
    
    this.retryTimers.set(requestId, timer);
    
    // 发射事件
    agentEventEmitter.emitEvent('retry_timer_scheduled', {
      requestId,
      delay
    });
  }
  
  /**
   * 清除重试定时器
   * @param {string} requestId - 请求 ID
   */
  clearRetryTimer(requestId) {
    const timer = this.retryTimers.get(requestId);
    
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(requestId);
      
      if (this.config.enableLogging) {
        console.log('[TimeoutRetryManager] 重试定时器已清除:', requestId);
      }
    }
  }
  
  /**
   * 取消重试
   * @param {string} requestId - 请求 ID
   */
  cancelRetry(requestId) {
    const record = this.retryRecords.get(requestId);
    
    if (!record) {
      return false;
    }
    
    record.cancelled = true;
    
    // 清除定时器
    this.clearTimeout(requestId);
    this.clearRetryTimer(requestId);
    
    // 清理回调
    this.successCallbacks.delete(requestId);
    this.failureCallbacks.delete(requestId);
    
    if (this.config.enableLogging) {
      console.log('[TimeoutRetryManager] 重试已取消:', requestId);
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('retry_cancelled', {
      requestId
    });
    
    this.emit('retry_cancelled', { requestId });
    
    return true;
  }
  
  /**
   * 获取重试记录
   * @param {string} requestId - 请求 ID
   * @returns {Object|null} 重试记录
   */
  getRetryRecord(requestId) {
    const record = this.retryRecords.get(requestId);
    
    if (!record) {
      return null;
    }
    
    return {
      requestId: record.requestId,
      action: record.action,
      attempts: record.attempts,
      maxRetries: record.maxRetries,
      lastAttemptAt: record.lastAttemptAt,
      lastError: record.lastError?.message,
      nextRetryAt: record.nextRetryAt,
      completed: record.completed,
      cancelled: record.cancelled,
      canRetry: record.canRetry()
    };
  }
  
  /**
   * 获取所有重试记录
   * @returns {Array} 重试记录列表
   */
  getAllRetryRecords() {
    return Array.from(this.retryRecords.values()).map(record => ({
      requestId: record.requestId,
      action: record.action,
      attempts: record.attempts,
      maxRetries: record.maxRetries,
      lastAttemptAt: record.lastAttemptAt,
      lastError: record.lastError?.message,
      nextRetryAt: record.nextRetryAt,
      completed: record.completed,
      cancelled: record.cancelled,
      canRetry: record.canRetry()
    }));
  }
  
  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const records = Array.from(this.retryRecords.values());
    const activeRetries = records.filter(r => !r.completed && !r.cancelled);
    const completedRetries = records.filter(r => r.completed && !r.cancelled);
    const failedRetries = records.filter(r => r.completed && r.lastError);
    
    return {
      totalRetries: records.length,
      activeRetries: activeRetries.length,
      completedRetries: completedRetries.length,
      failedRetries: failedRetries.length,
      cancelledRetries: records.filter(r => r.cancelled).length,
      totalAttempts: records.reduce((sum, r) => sum + r.attempts, 0),
      activeTimers: {
        timeouts: this.timeoutTimers.size,
        retries: this.retryTimers.size
      },
      config: {
        defaultTimeout: this.config.defaultTimeout,
        maxRetries: this.config.maxRetries,
        baseDelay: this.config.baseDelay,
        maxDelay: this.config.maxDelay
      }
    };
  }
  
  /**
   * 清理所有定时器
   */
  clearAll() {
    // 清除所有超时定时器
    for (const [requestId, timer] of this.timeoutTimers.entries()) {
      clearTimeout(timer);
    }
    this.timeoutTimers.clear();
    
    // 清除所有重试定时器
    for (const [requestId, timer] of this.retryTimers.entries()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    
    // 清理所有记录
    this.retryRecords.clear();
    this.successCallbacks.clear();
    this.failureCallbacks.clear();
    
    if (this.config.enableLogging) {
      console.log('[TimeoutRetryManager] 已清理所有定时器和记录');
    }
  }
}

module.exports = {
  TimeoutRetryManager,
  RetryRecord,
  DEFAULT_CONFIG
};
