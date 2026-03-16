/**
 * 订单处理队列
 * 用于处理用户提交的 3D 打印订单
 */

const useMock = process.env.MOCK_DB === 'true' || process.env.MOCK_DB === '1';
const Queue = useMock ? require('../utils/MockBull') : require('bull');
const { createRedisConnection } = require('../config/redis');

// 队列名称常量
const ORDER_QUEUE_NAME = 'order-processing';

// 队列配置
const queueConfig = {
  limiter: {
    max: 5,
    duration: 1000
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    timeout: 120000,
    removeOnComplete: {
      count: 100
    },
    removeOnFail: {
      count: 50
    }
  }
};

// 创建队列实例（Mock 模式下不需要 Redis 配置）
const orderQueue = useMock
  ? new Queue(ORDER_QUEUE_NAME)
  : new Queue(ORDER_QUEUE_NAME, {
      ...createRedisConnection(),
      ...queueConfig
    });

/**
 * 订单处理函数
 * 处理用户提交的 3D 打印订单
 * 
 * @param {Object} job - Bull 作业对象
 * @param {Object} job.data - 作业数据
 * @param {string} job.data.orderId - 订单 ID
 * @param {Object} job.data.orderData - 订单详细信息
 * @returns {Promise<Object>} 处理结果
 */
async function processOrder(job) {
  const { orderId, orderData } = job.data;
  
  console.log(`[订单队列] 开始处理订单：${orderId}`);
  
  try {
    // 步骤 1: 验证订单数据
    console.log(`[订单队列] 验证订单数据：${orderId}`);
    const validation = await validateOrderData(orderData);
    if (!validation.valid) {
      throw new Error(`订单验证失败：${validation.error}`);
    }

    // 步骤 2: 调用 Agent 进行决策
    console.log(`[订单队列] 调用 Agent 决策：${orderId}`);
    const agentDecision = await callAgentDecision(orderId, orderData);

    // 步骤 3: 更新订单状态
    console.log(`[订单队列] 更新订单状态：${orderId}`);
    const updatedOrder = await updateOrderStatus(orderId, {
      status: 'processing',
      agentDecision,
      updatedAt: new Date()
    });

    console.log(`[订单队列] 订单处理完成：${orderId}`);
    
    return {
      success: true,
      orderId,
      result: updatedOrder
    };
  } catch (error) {
    console.error(`[订单队列] 订单处理失败：${orderId}`, error.message);
    throw error;
  }
}

/**
 * 验证订单数据
 * 
 * @param {Object} orderData - 订单数据
 * @returns {Promise<Object>} 验证结果
 */
async function validateOrderData(orderData) {
  // TODO: 实现订单验证逻辑
  // 检查必填字段、文件格式、打印参数等
  return { valid: true };
}

/**
 * 调用 Agent 进行决策
 * 
 * @param {string} orderId - 订单 ID
 * @param {Object} orderData - 订单数据
 * @returns {Promise<Object>} Agent 决策结果
 */
async function callAgentDecision(orderId, orderData) {
  // TODO: 调用 Agent 决策队列
  // 协调 Agent 将决定订单分配给哪个设备
  return {
    assignedDevice: 'device-001',
    estimatedTime: 120 // 分钟
  };
}

/**
 * 更新订单状态
 * 
 * @param {string} orderId - 订单 ID
 * @param {Object} updateData - 更新数据
 * @returns {Promise<Object>} 更新后的订单
 */
async function updateOrderStatus(orderId, updateData) {
  // TODO: 实现数据库更新逻辑
  return { id: orderId, ...updateData };
}

/**
 * 添加订单到队列
 * 
 * @param {string} orderId - 订单 ID
 * @param {Object} orderData - 订单数据
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} 作业对象
 */
async function addOrderToQueue(orderId, orderData, options = {}) {
  const job = await orderQueue.add(
    { orderId, orderData },
    {
      jobId: orderId, // 使用订单 ID 作为作业 ID
      priority: options.priority || 0, // 优先级
      delay: options.delay || 0, // 延迟执行（毫秒）
      ...queueConfig.defaultJobOptions
    }
  );

  console.log(`[订单队列] 订单已加入队列：${orderId}, 作业 ID: ${job.id}`);
  return job;
}

/**
 * 获取订单处理进度
 * 
 * @param {string} orderId - 订单 ID
 * @returns {Promise<number>} 进度百分比 (0-100)
 */
async function getOrderProgress(orderId) {
  const job = await orderQueue.getJob(orderId);
  if (!job) {
    return 0;
  }
  
  const progress = await job.progress();
  return progress || 0;
}

/**
 * 更新订单处理进度
 * 
 * @param {string} orderId - 订单 ID
 * @param {number} progress - 进度百分比 (0-100)
 */
async function updateOrderProgress(orderId, progress) {
  const job = await orderQueue.getJob(orderId);
  if (job) {
    await job.progress(progress);
  }
}

// 队列事件监听
orderQueue.on('completed', (job, result) => {
  console.log(`[订单队列] 订单完成：${job.data.orderId}`, result);
});

orderQueue.on('failed', (job, error) => {
  console.error(`[订单队列] 订单失败：${job.data.orderId}`, error.message);
});

orderQueue.on('error', (error) => {
  console.error('[订单队列] 队列错误:', error.message);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('[订单队列] 正在关闭队列连接...');
  await orderQueue.close();
  console.log('[订单队列] 队列连接已关闭');
});

module.exports = {
  orderQueue,
  ORDER_QUEUE_NAME,
  processOrder,
  addOrderToQueue,
  getOrderProgress,
  updateOrderProgress
};
