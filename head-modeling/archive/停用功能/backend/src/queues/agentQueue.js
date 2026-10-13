/**
 * Agent 决策队列
 * 用于处理多 Agent 系统的决策任务
 */

const useMock = process.env.MOCK_DB === 'true' || process.env.MOCK_DB === '1';
const Queue = useMock ? require('../utils/MockBull') : require('bull');
const { createRedisConnection } = require('../config/redis');

// 队列名称常量
const AGENT_QUEUE_NAME = 'agent-decision';

// 队列配置
const queueConfig = {
  // 并发处理数：同时处理 3 个决策任务
  limiter: {
    max: 3,
    duration: 1000
  },
  // 默认作业配置
  defaultJobOptions: {
    // 重试次数：失败后最多重试 5 次（决策任务更重要）
    attempts: 5,
    // 退避策略：指数退避
    backoff: {
      type: 'exponential',
      delay: 3000
    },
    // 作业超时：1 小时
    timeout: 3600000,
    // 移除策略
    removeOnComplete: {
      count: 50,
      age: 24 * 60 * 60
    },
    removeOnFail: {
      count: 200
    }
  }
};

// 创建队列实例（Mock 模式下不需要 Redis 配置）
const agentQueue = useMock
  ? new Queue(AGENT_QUEUE_NAME)
  : new Queue(AGENT_QUEUE_NAME, {
      ...createRedisConnection(),
      ...queueConfig
    });

/**
 * Agent 决策处理函数
 * 
 * @param {Object} job - Bull 作业对象
 * @param {Object} job.data - 作业数据
 * @param {string} job.data.taskType - 任务类型
 * @param {Object} job.data.payload - 任务数据
 * @returns {Promise<Object>} 决策结果
 */
async function processAgentDecision(job) {
  const { taskType, payload } = job.data;
  
  console.log(`[Agent 队列] 开始处理决策任务：${taskType}`, payload);
  
  try {
    // 根据任务类型分发到不同的处理函数
    switch (taskType) {
      case 'order-assignment':
        return await handleOrderAssignment(payload);
      case 'device-scheduling':
        return await handleDeviceScheduling(payload);
      case 'inventory-check':
        return await handleInventoryCheck(payload);
      default:
        throw new Error(`未知的任务类型：${taskType}`);
    }
  } catch (error) {
    console.error(`[Agent 队列] 决策任务失败：${taskType}`, error.message);
    throw error;
  }
}

/**
 * 处理订单分配决策
 * 协调 Agent 决定订单分配给哪个设备
 * 
 * @param {Object} payload - 订单数据
 * @returns {Promise<Object>} 分配结果
 */
async function handleOrderAssignment(payload) {
  const { orderId, orderData } = payload;
  
  console.log(`[Agent 决策] 订单分配：${orderId}`);
  
  // TODO: 实现协调 Agent 逻辑
  // 1. 获取可用设备列表
  // 2. 分析订单需求（材料、尺寸、精度）
  // 3. 匹配最优设备
  // 4. 返回分配结果
  
  return {
    success: true,
    assignedDevice: 'device-001',
    priority: 'normal',
    estimatedStartTime: new Date(Date.now() + 3600000) // 1 小时后
  };
}

/**
 * 处理设备调度决策
 * 动态调整设备任务队列
 * 
 * @param {Object} payload - 调度数据
 * @returns {Promise<Object>} 调度结果
 */
async function handleDeviceScheduling(payload) {
  const { deviceId, currentTask, pendingTasks } = payload;
  
  console.log(`[Agent 决策] 设备调度：${deviceId}`);
  
  // TODO: 实现设备调度逻辑
  // 1. 分析设备当前状态
  // 2. 评估 pending 任务的优先级
  // 3. 优化任务执行顺序
  // 4. 返回调度方案
  
  return {
    success: true,
    nextTask: pendingTasks[0],
    schedule: pendingTasks.map((task, index) => ({
      ...task,
      scheduledTime: new Date(Date.now() + index * 7200000)
    }))
  };
}

/**
 * 处理库存检查决策
 * 库存 Agent 检查材料库存
 * 
 * @param {Object} payload - 检查数据
 * @returns {Promise<Object>} 检查结果
 */
async function handleInventoryCheck(payload) {
  const { materialType, requiredAmount } = payload;
  
  console.log(`[Agent 决策] 库存检查：${materialType}`);
  
  // TODO: 实现库存检查逻辑
  // 1. 查询当前库存
  // 2. 判断是否充足
  // 3. 如不足，触发采购流程
  // 4. 返回检查结果
  
  const currentStock = 1000; // 示例数据
  const isSufficient = currentStock >= requiredAmount;
  
  return {
    success: true,
    materialType,
    currentStock,
    requiredAmount,
    isSufficient,
    actionRequired: !isSufficient ? 'purchase' : null
  };
}

/**
 * 添加 Agent 决策任务到队列
 * 
 * @param {string} taskType - 任务类型
 * @param {Object} payload - 任务数据
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} 作业对象
 */
async function addAgentTask(taskType, payload, options = {}) {
  const taskId = `${taskType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const job = await agentQueue.add(
    { taskType, payload },
    {
      jobId: taskId,
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...queueConfig.defaultJobOptions
    }
  );

  console.log(`[Agent 队列] 任务已加入队列：${taskId}, 类型：${taskType}`);
  return job;
}

/**
 * 获取 Agent 任务状态
 * 
 * @param {string} taskId - 任务 ID
 * @returns {Promise<Object>} 任务状态
 */
async function getAgentTaskStatus(taskId) {
  const job = await agentQueue.getJob(taskId);
  if (!job) {
    return { found: false };
  }
  
  const state = await job.getState();
  const progress = await job.progress();
  
  return {
    found: true,
    taskId,
    state,
    progress,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn
  };
}

// 队列事件监听
agentQueue.on('completed', (job, result) => {
  console.log(`[Agent 队列] 决策完成：${job.data.taskType}`, result);
});

agentQueue.on('failed', (job, error) => {
  console.error(`[Agent 队列] 决策失败：${job.data.taskType}`, error.message);
});

agentQueue.on('stalled', (job) => {
  console.warn(`[Agent 队列] 任务卡住：${job.data.taskType}`);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('[Agent 队列] 正在关闭队列连接...');
  await agentQueue.close();
  console.log('[Agent 队列] 队列连接已关闭');
});

module.exports = {
  agentQueue,
  AGENT_QUEUE_NAME,
  processAgentDecision,
  addAgentTask,
  getAgentTaskStatus,
  handleOrderAssignment,
  handleDeviceScheduling,
  handleInventoryCheck
};
