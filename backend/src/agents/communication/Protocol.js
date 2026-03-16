/**
 * Agent 通信协议定义
 * 
 * 定义 Agent 之间通信的消息格式、类型、优先级等
 * 提供消息创建、验证、序列化等功能
 */

const { v4: uuidv4 } = require('uuid');

/**
 * 消息类型枚举
 */
const MessageType = {
  REQUEST: 'request',           // 请求消息（需要响应）
  RESPONSE: 'response',         // 响应消息（回复请求）
  NOTIFICATION: 'notification'  // 通知消息（不需要响应）
};

/**
 * 消息优先级枚举
 */
const MessagePriority = {
  LOW: 'low',       // 低优先级
  NORMAL: 'normal', // 普通优先级
  HIGH: 'high',     // 高优先级
  URGENT: 'urgent'  // 紧急优先级
};

/**
 * 消息状态枚举
 */
const MessageStatus = {
  PENDING: 'pending',     // 待发送
  SENT: 'sent',           // 已发送
  DELIVERED: 'delivered', // 已送达
  ACKNOWLEDGED: 'acknowledged', // 已确认
  FAILED: 'failed',       // 失败
  TIMEOUT: 'timeout',     // 超时
  RETRYING: 'retrying'    // 重试中
};

/**
 * 通信协议版本
 */
const PROTOCOL_VERSION = '1.0.0';

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  timeout: 30000,        // 默认超时时间（30 秒）
  maxRetries: 3,         // 最大重试次数
  retryDelay: 1000,      // 重试延迟（毫秒）
  enableValidation: true // 是否启用消息验证
};

/**
 * 消息格式类
 * 定义标准的消息结构
 */
class Message {
  /**
   * 创建消息对象
   * @param {Object} config - 消息配置
   */
  constructor(config) {
    // 必填字段
    this.messageId = config.messageId || uuidv4();
    this.from = config.from;       // 发送方 Agent ID
    this.to = config.to;           // 接收方 Agent ID
    this.type = config.type;       // 消息类型
    this.action = config.action;   // 动作类型
    this.data = config.data || {}; // 消息内容
    this.timestamp = config.timestamp || new Date().toISOString();
    
    // 可选字段
    this.priority = config.priority || MessagePriority.NORMAL;
    this.correlationId = config.correlationId || null; // 关联 ID（用于请求 - 响应配对）
    this.timeout = config.timeout || DEFAULT_CONFIG.timeout;
    this.maxRetries = config.maxRetries !== undefined ? config.maxRetries : DEFAULT_CONFIG.maxRetries;
    this.protocolVersion = PROTOCOL_VERSION;
    this.metadata = config.metadata || {}; // 元数据
    
    // 状态字段
    this.status = MessageStatus.PENDING;
    this.attempts = 0; // 已尝试次数
    this.lastAttemptAt = null; // 最后尝试时间
    this.deliveredAt = null; // 送达时间
    this.acknowledgedAt = null; // 确认时间
    this.error = null; // 错误信息
  }
  
  /**
   * 将消息转换为纯对象
   * @returns {Object} 消息对象
   */
  toObject() {
    return {
      messageId: this.messageId,
      from: this.from,
      to: this.to,
      type: this.type,
      action: this.action,
      data: this.data,
      timestamp: this.timestamp,
      priority: this.priority,
      correlationId: this.correlationId,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      protocolVersion: this.protocolVersion,
      metadata: this.metadata,
      status: this.status,
      attempts: this.attempts,
      lastAttemptAt: this.lastAttemptAt,
      deliveredAt: this.deliveredAt,
      acknowledgedAt: this.acknowledgedAt,
      error: this.error
    };
  }
  
  /**
   * 将消息序列化为 JSON 字符串
   * @returns {string} JSON 字符串
   */
  toJSON() {
    return JSON.stringify(this.toObject());
  }
  
  /**
   * 从 JSON 字符串反序列化消息
   * @param {string} jsonString - JSON 字符串
   * @returns {Message} 消息对象
   */
  static fromJSON(jsonString) {
    const obj = JSON.parse(jsonString);
    return new Message(obj);
  }
  
  /**
   * 更新消息状态
   * @param {string} newStatus - 新状态
   */
  updateStatus(newStatus) {
    this.status = newStatus;
    
    // 根据状态更新时间戳
    switch (newStatus) {
      case MessageStatus.SENT:
      case MessageStatus.RETRYING:
        this.lastAttemptAt = new Date().toISOString();
        this.attempts++;
        break;
      case MessageStatus.DELIVERED:
        this.deliveredAt = new Date().toISOString();
        break;
      case MessageStatus.ACKNOWLEDGED:
        this.acknowledgedAt = new Date().toISOString();
        break;
      case MessageStatus.FAILED:
      case MessageStatus.TIMEOUT:
        this.lastAttemptAt = new Date().toISOString();
        break;
    }
  }
  
  /**
   * 设置错误信息
   * @param {Error} error - 错误对象
   */
  setError(error) {
    this.error = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  
  /**
   * 验证消息是否有效
   * @returns {Object} 验证结果
   */
  validate() {
    const errors = [];
    
    // 验证必填字段
    if (!this.from) {
      errors.push('缺少必填字段：from（发送方 ID）');
    }
    
    if (!this.to) {
      errors.push('缺少必填字段：to（接收方 ID）');
    }
    
    if (!this.type) {
      errors.push('缺少必填字段：type（消息类型）');
    } else if (!Object.values(MessageType).includes(this.type)) {
      errors.push(`无效的消息类型：${this.type}`);
    }
    
    if (!this.action) {
      errors.push('缺少必填字段：action（动作类型）');
    }
    
    // 验证优先级
    if (this.priority && !Object.values(MessagePriority).includes(this.priority)) {
      errors.push(`无效的消息优先级：${this.priority}`);
    }
    
    // 验证超时
    if (this.timeout && (typeof this.timeout !== 'number' || this.timeout <= 0)) {
      errors.push('超时时间必须是正整数');
    }
    
    // 验证重试次数
    if (this.maxRetries && (typeof this.maxRetries !== 'number' || this.maxRetries < 0)) {
      errors.push('最大重试次数必须是非负整数');
    }
    
    // 验证请求 - 响应配对
    if (this.type === MessageType.RESPONSE && !this.correlationId) {
      errors.push('响应消息必须包含 correlationId');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * 检查消息是否已过期
   * @returns {boolean} 是否已过期
   */
  isExpired() {
    if (!this.timestamp) {
      return false;
    }
    
    const now = Date.now();
    const messageTime = new Date(this.timestamp).getTime();
    const elapsed = now - messageTime;
    
    return elapsed > this.timeout;
  }
  
  /**
   * 获取剩余时间（毫秒）
   * @returns {number} 剩余时间
   */
  getRemainingTime() {
    if (!this.timestamp) {
      return this.timeout;
    }
    
    const now = Date.now();
    const messageTime = new Date(this.timestamp).getTime();
    const elapsed = now - messageTime;
    
    return Math.max(0, this.timeout - elapsed);
  }
}

/**
 * 消息构建器
 * 使用链式调用创建消息
 */
class MessageBuilder {
  constructor() {
    this.config = {};
  }
  
  /**
   * 设置发送方
   * @param {string} from - 发送方 Agent ID
   * @returns {MessageBuilder} 构建器实例
   */
  from(from) {
    this.config.from = from;
    return this;
  }
  
  /**
   * 设置接收方
   * @param {string} to - 接收方 Agent ID
   * @returns {MessageBuilder} 构建器实例
   */
  to(to) {
    this.config.to = to;
    return this;
  }
  
  /**
   * 设置消息类型
   * @param {string} type - 消息类型
   * @returns {MessageBuilder} 构建器实例
   */
  type(type) {
    this.config.type = type;
    return this;
  }
  
  /**
   * 设置动作
   * @param {string} action - 动作类型
   * @returns {MessageBuilder} 构建器实例
   */
  action(action) {
    this.config.action = action;
    return this;
  }
  
  /**
   * 设置消息数据
   * @param {Object} data - 消息数据
   * @returns {MessageBuilder} 构建器实例
   */
  data(data) {
    this.config.data = data;
    return this;
  }
  
  /**
   * 设置优先级
   * @param {string} priority - 优先级
   * @returns {MessageBuilder} 构建器实例
   */
  priority(priority) {
    this.config.priority = priority;
    return this;
  }
  
  /**
   * 设置关联 ID
   * @param {string} correlationId - 关联 ID
   * @returns {MessageBuilder} 构建器实例
   */
  correlationId(correlationId) {
    this.config.correlationId = correlationId;
    return this;
  }
  
  /**
   * 设置超时时间
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {MessageBuilder} 构建器实例
   */
  timeout(timeout) {
    this.config.timeout = timeout;
    return this;
  }
  
  /**
   * 设置最大重试次数
   * @param {number} maxRetries - 最大重试次数
   * @returns {MessageBuilder} 构建器实例
   */
  maxRetries(maxRetries) {
    this.config.maxRetries = maxRetries;
    return this;
  }
  
  /**
   * 设置元数据
   * @param {Object} metadata - 元数据
   * @returns {MessageBuilder} 构建器实例
   */
  metadata(metadata) {
    this.config.metadata = metadata;
    return this;
  }
  
  /**
   * 设置消息 ID
   * @param {string} messageId - 消息 ID
   * @returns {MessageBuilder} 构建器实例
   */
  messageId(messageId) {
    this.config.messageId = messageId;
    return this;
  }
  
  /**
   * 设置时间戳
   * @param {string} timestamp - 时间戳
   * @returns {MessageBuilder} 构建器实例
   */
  timestamp(timestamp) {
    this.config.timestamp = timestamp;
    return this;
  }
  
  /**
   * 构建消息对象
   * @param {boolean} validate - 是否验证消息，默认 true
   * @returns {Message} 消息对象
   */
  build(validate = true) {
    const message = new Message(this.config);
    
    if (validate) {
      const validation = message.validate();
      if (!validation.valid) {
        throw new Error(`消息验证失败：${validation.errors.join(', ')}`);
      }
    }
    
    return message;
  }
}

/**
 * 创建请求消息
 * @param {Object} config - 消息配置
 * @returns {Message} 请求消息
 */
function createRequestMessage(config) {
  return new MessageBuilder()
    .from(config.from)
    .to(config.to)
    .type(MessageType.REQUEST)
    .action(config.action)
    .data(config.data)
    .priority(config.priority || MessagePriority.NORMAL)
    .timeout(config.timeout)
    .maxRetries(config.maxRetries)
    .metadata(config.metadata)
    .build();
}

/**
 * 创建响应消息
 * @param {string} correlationId - 关联 ID（请求消息的 ID）
 * @param {Object} responseData - 响应数据
 * @param {Object} config - 其他配置
 * @returns {Message} 响应消息
 */
function createResponseMessage(correlationId, responseData, config = {}) {
  return new MessageBuilder()
    .from(config.from)
    .to(config.to)
    .type(MessageType.RESPONSE)
    .action(config.action)
    .data(responseData)
    .correlationId(correlationId)
    .priority(config.priority || MessagePriority.NORMAL)
    .build();
}

/**
 * 创建通知消息
 * @param {Object} config - 消息配置
 * @returns {Message} 通知消息
 */
function createNotificationMessage(config) {
  return new MessageBuilder()
    .from(config.from)
    .to(config.to)
    .type(MessageType.NOTIFICATION)
    .action(config.action)
    .data(config.data)
    .priority(config.priority || MessagePriority.LOW)
    .metadata(config.metadata)
    .build();
}

module.exports = {
  Message,
  MessageBuilder,
  MessageType,
  MessagePriority,
  MessageStatus,
  PROTOCOL_VERSION,
  DEFAULT_CONFIG,
  createRequestMessage,
  createResponseMessage,
  createNotificationMessage
};
