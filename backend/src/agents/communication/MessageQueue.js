/**
 * 消息队列管理器
 * 基于 Bull 实现 Agent 消息的持久化队列
 */

const EventEmitter = require('events');
const useMock = process.env.MOCK_DB === 'true' || process.env.MOCK_DB === '1';
const Queue = useMock ? require('../../utils/MockBull') : require('bull');
const { createRedisConnection } = require('../../config/redis');
const { Message, MessagePriority, MessageStatus } = require('./Protocol');
const { agentEventEmitter } = require('../../utils/AgentEventEmitter');

/**
 * 队列名称常量
 */
const QUEUE_NAME = 'agent-messages';

/**
 * 优先级映射（Bull 使用数字，数字越小优先级越高）
 */
const PRIORITY_MAP = {
  [MessagePriority.URGENT]: 1,
  [MessagePriority.HIGH]: 2,
  [MessagePriority.NORMAL]: 3,
  [MessagePriority.LOW]: 4
};

/**
 * 队列配置
 */
const QUEUE_CONFIG = {
  // 并发处理数
  limiter: {
    max: 10,
    duration: 1000
  },
  // 默认作业配置
  defaultJobOptions: {
    // 重试次数
    attempts: 3,
    // 退避策略
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    // 作业超时
    timeout: 60000,
    // 移除策略
    removeOnComplete: {
      count: 100,
      age: 24 * 60 * 60
    },
    removeOnFail: {
      count: 500
    }
  }
};

/**
 * 消息队列管理类
 */
class MessageQueue extends EventEmitter {
  /**
   * 创建消息队列实例
   * @param {Object} options - 配置选项
   * @param {boolean} options.enableLogging - 是否启用日志，默认 true
   */
  constructor(options = {}) {
    super();
    
    this.enableLogging = options.enableLogging !== false;
    
    // 创建队列（Mock 模式下不需要 Redis 配置）
    this.queue = useMock
      ? new Queue(QUEUE_NAME)
      : new Queue(QUEUE_NAME, {
          ...createRedisConnection(),
          ...QUEUE_CONFIG
        });
    
    // 消息存储
    this.pendingMessages = new Map();
    
    // 事件监听器
    this.setupEventListeners();
    
    if (this.enableLogging) {
      console.log('[MessageQueue] 消息队列已初始化');
    }
  }
  
/**
 * 设置队列事件监听
 */
  setupEventListeners() {
    // 作业完成
    this.queue.on('completed', (job, result) => {
      if (this.enableLogging) {
        console.log('[MessageQueue] 消息处理完成:', job.id, result);
      }
      
      const eventData = {
        messageId: job.data.messageId,
        jobId: job.id,
        result
      };
      
      // 发射事件
      agentEventEmitter.emitEvent('message_completed', eventData);
      this.emit('message_completed', eventData);
    });
    
    // 作业失败
    this.queue.on('failed', (job, error) => {
      console.error('[MessageQueue] 消息处理失败:', job?.id, error.message);
      
      // 更新消息状态
      if (job?.data?.messageId) {
        const message = this.pendingMessages.get(job.data.messageId);
        if (message) {
          message.updateStatus(MessageStatus.FAILED);
          message.setError(error);
        }
      }
      
      const eventData = {
        messageId: job?.data?.messageId,
        jobId: job?.id,
        error: error.message
      };
      
      // 发射事件
      agentEventEmitter.emitEvent('message_failed', eventData);
      this.emit('message_failed', eventData);
    });
    
    // 作业进行中
    this.queue.on('progress', (job, progress) => {
      if (this.enableLogging) {
        console.log('[MessageQueue] 消息处理进度:', job.id, progress);
      }
    });
    
    // 作业卡住
    this.queue.on('stalled', (job) => {
      console.warn('[MessageQueue] 消息处理卡住:', job?.id);
      
      // 发射事件
      agentEventEmitter.emitEvent('message_stalled', {
        messageId: job?.data?.messageId,
        jobId: job?.id
      });
    });
    
    // 错误事件
    this.queue.on('error', (error) => {
      console.error('[MessageQueue] 队列错误:', error.message);
      
      // 发射事件
      agentEventEmitter.emitEvent('queue_error', {
        error: error.message
      });
    });
  }
  
  /**
   * 添加消息到队列
   * @param {Message} message - 消息对象
   * @param {Object} options - 可选配置
   * @returns {Promise<Object>} Bull 作业对象
   */
  async addMessage(message, options = {}) {
    // 验证消息
    const validation = message.validate();
    if (!validation.valid) {
      throw new Error(`消息验证失败：${validation.errors.join(', ')}`);
    }
    
    // 转换为队列作业数据
    const jobData = {
      messageId: message.messageId,
      from: message.from,
      to: message.to,
      type: message.type,
      action: message.action,
      data: message.data,
      timestamp: message.timestamp,
      priority: message.priority,
      correlationId: message.correlationId,
      timeout: message.timeout,
      maxRetries: message.maxRetries,
      metadata: message.metadata
    };
    
    // 确定 Bull 优先级
    const bullPriority = PRIORITY_MAP[message.priority] || PRIORITY_MAP[MessagePriority.NORMAL];
    
    // 添加作业
    const job = await this.queue.add(
      jobData,
      {
        jobId: message.messageId,
        priority: bullPriority,
        delay: options.delay || 0,
        timeout: message.timeout,
        attempts: message.maxRetries
      }
    );
    
    // 存储消息引用
    this.pendingMessages.set(message.messageId, message);
    
    // 更新消息状态
    message.updateStatus(MessageStatus.SENT);
    
    if (this.enableLogging) {
      console.log('[MessageQueue] 消息已加入队列:', {
        messageId: message.messageId,
        priority: message.priority,
        bullPriority
      });
    }
    
    // 发射事件
    agentEventEmitter.emitEvent('message_queued', {
      messageId: message.messageId,
      from: message.from,
      to: message.to,
      type: message.type,
      action: message.action
    });
    
    return job;
  }
  
  /**
   * 处理队列中的消息
   * @param {Function} processor - 消息处理函数
   * @returns {Promise<void>}
   */
  async processMessages(processor) {
    if (!processor || typeof processor !== 'function') {
      throw new Error('处理器必须是函数');
    }
    
    // 设置队列处理器
    this.queue.process(async (job) => {
      const { messageId, from, to, type, action, data } = job.data;
      
      if (this.enableLogging) {
        console.log('[MessageQueue] 处理消息:', {
          messageId,
          from,
          to,
          type,
          action
        });
      }
      
      try {
        // 更新消息状态
        const message = this.pendingMessages.get(messageId);
        if (message) {
          message.updateStatus(MessageStatus.DELIVERED);
        }
        
        // 调用处理器
        const result = await processor(job.data);
        
        // 更新消息状态
        if (message) {
          message.updateStatus(MessageStatus.ACKNOWLEDGED);
        }
        
        return result;
      } catch (error) {
        console.error('[MessageQueue] 消息处理失败:', messageId, error.message);
        throw error;
      }
    });
    
    if (this.enableLogging) {
      console.log('[MessageQueue] 消息处理器已启动');
    }
  }
  
  /**
   * 获取消息状态
   * @param {string} messageId - 消息 ID
   * @returns {Promise<Object>} 消息状态
   */
  async getMessageStatus(messageId) {
    const job = await this.queue.getJob(messageId);
    
    if (!job) {
      return {
        found: false,
        messageId
      };
    }
    
    const state = await job.getState();
    const progress = await job.progress();
    
    return {
      found: true,
      messageId,
      state,
      progress,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason
    };
  }
  
  /**
   * 获取队列统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount()
    ]);
    
    return {
      queueName: QUEUE_NAME,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
      pendingMessages: this.pendingMessages.size
    };
  }
  
  /**
   * 获取指定状态的消息列表
   * @param {string} state - 状态（waiting, active, completed, failed, delayed）
   * @param {number} start - 起始索引
   * @param {number} end - 结束索引
   * @returns {Promise<Array>} 消息列表
   */
  async getMessagesByState(state, start = 0, end = 100) {
    const jobs = await this.queue.getJobs([state], start, end);
    
    return jobs.map(job => ({
      jobId: job.id,
      messageId: job.data.messageId,
      from: job.data.from,
      to: job.data.to,
      type: job.data.type,
      action: job.data.action,
      timestamp: job.timestamp,
      state: state
    }));
  }
  
  /**
   * 重试失败的消息
   * @param {string} messageId - 消息 ID
   * @returns {Promise<void>}
   */
  async retryMessage(messageId) {
    const job = await this.queue.getJob(messageId);
    
    if (!job) {
      throw new Error(`消息不存在：${messageId}`);
    }
    
    await job.retry();
    
    if (this.enableLogging) {
      console.log('[MessageQueue] 消息已重试:', messageId);
    }
  }
  
  /**
   * 取消待处理的消息
   * @param {string} messageId - 消息 ID
   * @returns {Promise<void>}
   */
  async cancelMessage(messageId) {
    const job = await this.queue.getJob(messageId);
    
    if (!job) {
      throw new Error(`消息不存在：${messageId}`);
    }
    
    await job.remove();
    this.pendingMessages.delete(messageId);
    
    if (this.enableLogging) {
      console.log('[MessageQueue] 消息已取消:', messageId);
    }
  }
  
  /**
   * 清空队列
   * @returns {Promise<void>}
   */
  async clear() {
    await this.queue.empty();
    this.pendingMessages.clear();
    
    if (this.enableLogging) {
      console.log('[MessageQueue] 队列已清空');
    }
  }
  
  /**
   * 关闭队列
   * @returns {Promise<void>}
   */
  async close() {
    console.log('[MessageQueue] 正在关闭队列...');
    
    await this.queue.close();
    
    console.log('[MessageQueue] 队列已关闭');
  }
}

// 创建单例实例
const messageQueue = new MessageQueue({ enableLogging: true });

module.exports = {
  MessageQueue,
  messageQueue,
  QUEUE_NAME,
  QUEUE_CONFIG,
  PRIORITY_MAP
};
