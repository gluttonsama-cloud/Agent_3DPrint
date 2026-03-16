/**
 * 通知队列
 * 用于处理各类异步通知任务
 */

const useMock = process.env.MOCK_DB === 'true' || process.env.MOCK_DB === '1';
const Queue = useMock ? require('../utils/MockBull') : require('bull');
const { createRedisConnection } = require('../config/redis');

// 队列名称常量
const NOTIFICATION_QUEUE_NAME = 'notification';

// 通知类型常量
const NOTIFICATION_TYPES = {
  ORDER_STATUS_UPDATE: 'order-status-update', // 订单状态变更
  DEVICE_TASK_COMPLETE: 'device-task-complete', // 设备任务完成
  INVENTORY_WARNING: 'inventory-warning', // 库存预警
  SYSTEM_ALERT: 'system-alert', // 系统告警
  USER_MESSAGE: 'user-message' // 用户消息
};

// 队列配置
const queueConfig = {
  // 并发处理数：同时处理 10 个通知（通知任务轻量）
  limiter: {
    max: 10,
    duration: 1000
  },
  // 默认作业配置
  defaultJobOptions: {
    // 重试次数：失败后最多重试 2 次
    attempts: 2,
    // 退避策略：固定延迟
    backoff: {
      type: 'fixed',
      delay: 1000
    },
    // 作业超时：5 分钟
    timeout: 300000,
    // 移除策略
    removeOnComplete: {
      count: 1000, // 保留更多完成记录用于审计
      age: 7 * 24 * 60 * 60 // 保留 7 天
    },
    removeOnFail: {
      count: 200
    }
  }
};

// 创建队列实例（Mock 模式下不需要 Redis 配置）
const notificationQueue = useMock
  ? new Queue(NOTIFICATION_QUEUE_NAME)
  : new Queue(NOTIFICATION_QUEUE_NAME, {
      ...createRedisConnection(),
      ...queueConfig
    });

/**
 * 通知处理函数
 * 
 * @param {Object} job - Bull 作业对象
 * @param {Object} job.data - 作业数据
 * @param {string} job.data.type - 通知类型
 * @param {Object} job.data.payload - 通知数据
 * @returns {Promise<Object>} 处理结果
 */
async function processNotification(job) {
  const { type, payload } = job.data;
  
  console.log(`[通知队列] 发送通知：${type}`, payload);
  
  try {
    // 根据通知类型分发到不同的处理函数
    switch (type) {
      case NOTIFICATION_TYPES.ORDER_STATUS_UPDATE:
        return await sendOrderStatusNotification(payload);
      case NOTIFICATION_TYPES.DEVICE_TASK_COMPLETE:
        return await sendDeviceTaskCompleteNotification(payload);
      case NOTIFICATION_TYPES.INVENTORY_WARNING:
        return await sendInventoryWarningNotification(payload);
      case NOTIFICATION_TYPES.SYSTEM_ALERT:
        return await sendSystemAlert(payload);
      case NOTIFICATION_TYPES.USER_MESSAGE:
        return await sendUserMessage(payload);
      default:
        throw new Error(`未知的通知类型：${type}`);
    }
  } catch (error) {
    console.error(`[通知队列] 通知发送失败：${type}`, error.message);
    throw error;
  }
}

/**
 * 发送订单状态变更通知
 * 
 * @param {Object} payload - 通知数据
 * @param {string} payload.orderId - 订单 ID
 * @param {string} payload.status - 新状态
 * @param {string} payload.userId - 用户 ID
 * @returns {Promise<Object>} 发送结果
 */
async function sendOrderStatusNotification(payload) {
  const { orderId, status, userId } = payload;
  
  console.log(`[通知服务] 订单状态通知：用户${userId}, 订单${orderId}, 状态${status}`);
  
  // TODO: 实现通知发送逻辑
  // 1. 查询用户联系方式（微信、短信、邮件）
  // 2. 构建通知消息
  // 3. 调用通知服务发送
  // 4. 记录发送日志
  
  return {
    success: true,
    sent: true,
    channels: ['wechat', 'sms'],
    sentAt: new Date()
  };
}

/**
 * 发送设备任务完成通知
 * 
 * @param {Object} payload - 通知数据
 * @param {string} payload.deviceId - 设备 ID
 * @param {string} payload.taskId - 任务 ID
 * @param {string} payload.operatorId - 操作员 ID
 * @returns {Promise<Object>} 发送结果
 */
async function sendDeviceTaskCompleteNotification(payload) {
  const { deviceId, taskId, operatorId } = payload;
  
  console.log(`[通知服务] 设备任务完成通知：设备${deviceId}, 任务${taskId}`);
  
  // TODO: 实现通知发送逻辑
  // 通知操作员取件
  
  return {
    success: true,
    sent: true,
    recipient: operatorId,
    channel: 'wechat',
    sentAt: new Date()
  };
}

/**
 * 发送库存预警通知
 * 
 * @param {Object} payload - 通知数据
 * @param {string} payload.materialType - 材料类型
 * @param {number} payload.currentStock - 当前库存
 * @param {number} payload.threshold - 预警阈值
 * @returns {Promise<Object>} 发送结果
 */
async function sendInventoryWarningNotification(payload) {
  const { materialType, currentStock, threshold } = payload;
  
  console.log(`[通知服务] 库存预警：材料${materialType}, 库存${currentStock}, 阈值${threshold}`);
  
  // TODO: 实现通知发送逻辑
  // 通知采购人员
  
  return {
    success: true,
    sent: true,
    channel: 'wechat',
    sentAt: new Date()
  };
}

/**
 * 发送系统告警
 * 
 * @param {Object} payload - 通知数据
 * @param {string} payload.alertType - 告警类型
 * @param {string} payload.message - 告警消息
 * @param {string} payload.severity - 严重程度
 * @returns {Promise<Object>} 发送结果
 */
async function sendSystemAlert(payload) {
  const { alertType, message, severity } = payload;
  
  console.log(`[通知服务] 系统告警：${alertType}, 级别${severity}`);
  
  // TODO: 实现通知发送逻辑
  // 通知管理员
  
  return {
    success: true,
    sent: true,
    channel: 'wechat',
    sentAt: new Date()
  };
}

/**
 * 发送用户消息
 * 
 * @param {Object} payload - 通知数据
 * @param {string} payload.userId - 用户 ID
 * @param {string} payload.message - 消息内容
 * @returns {Promise<Object>} 发送结果
 */
async function sendUserMessage(payload) {
  const { userId, message } = payload;
  
  console.log(`[通知服务] 用户消息：用户${userId}`);
  
  // TODO: 实现通知发送逻辑
  
  return {
    success: true,
    sent: true,
    sentAt: new Date()
  };
}

/**
 * 添加通知到队列
 * 
 * @param {string} type - 通知类型
 * @param {Object} payload - 通知数据
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} 作业对象
 */
async function addNotification(type, payload, options = {}) {
  const notificationId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const job = await notificationQueue.add(
    { type, payload },
    {
      jobId: notificationId,
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...queueConfig.defaultJobOptions
    }
  );

  console.log(`[通知队列] 通知已加入队列：${notificationId}`);
  return job;
}

/**
 * 批量添加通知
 * 
 * @param {Array<Object>} notifications - 通知列表
 * @returns {Promise<Array<Object>>} 作业列表
 */
async function addNotificationsBulk(notifications) {
  const jobs = await notificationQueue.addBulk(
    notifications.map(({ type, payload, options = {} }) => ({
      name: type,
      data: { type, payload },
      opts: {
        jobId: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        priority: options.priority || 0,
        delay: options.delay || 0,
        ...queueConfig.defaultJobOptions
      }
    }))
  );

  console.log(`[通知队列] 批量添加 ${jobs.length} 个通知`);
  return jobs;
}

// 队列事件监听
notificationQueue.on('completed', (job, result) => {
  console.log(`[通知队列] 通知完成：${job.data.type}`, result);
});

notificationQueue.on('failed', (job, error) => {
  console.error(`[通知队列] 通知失败：${job.data.type}`, error.message);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('[通知队列] 正在关闭队列连接...');
  await notificationQueue.close();
  console.log('[通知队列] 队列连接已关闭');
});

module.exports = {
  notificationQueue,
  NOTIFICATION_QUEUE_NAME,
  NOTIFICATION_TYPES,
  processNotification,
  addNotification,
  addNotificationsBulk,
  sendOrderStatusNotification,
  sendDeviceTaskCompleteNotification,
  sendInventoryWarningNotification,
  sendSystemAlert,
  sendUserMessage
};
