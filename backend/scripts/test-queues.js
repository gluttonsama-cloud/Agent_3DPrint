/**
 * 队列测试脚本
 * 
 * 测试 Bull 任务队列的基本功能
 * 包括：连接测试、添加作业、处理作业、错误处理
 * 
 * 使用方法：
 *   node scripts/test-queues.js
 */

require('dotenv').config({ path: '.env' });

const { testConnection, createRedisClient } = require('../src/config/redis');
const {
  orderQueue: { queue: orderQueue, add: addOrder },
  agentQueue: { queue: agentQueue, add: addAgentTask },
  notificationQueue: { queue: notificationQueue, add: addNotification, types }
} = require('../src/queues');

/**
 * 测试 Redis 连接
 */
async function testRedisConnection() {
  console.log('\n=== 测试 Redis 连接 ===');
  const connected = await testConnection();
  if (!connected) {
    console.error('Redis 连接失败，请检查 Redis 服务是否运行');
    return false;
  }
  console.log('Redis 连接成功 ✓');
  return true;
}

/**
 * 测试订单队列
 */
async function testOrderQueue() {
  console.log('\n=== 测试订单队列 ===');
  
  // 创建测试订单
  const testOrder = {
    orderId: `test-order-${Date.now()}`,
    orderData: {
      userId: 'user-001',
      productName: '3D 打印头部模型',
      material: 'PLA',
      color: '白色',
      quantity: 1,
      notes: '测试订单'
    }
  };
  
  console.log('添加订单到队列:', testOrder.orderId);
  const job = await addOrder(testOrder.orderId, testOrder.orderData);
  
  console.log('作业已添加:', {
    id: job.id,
    name: job.name,
    timestamp: new Date(job.timestamp).toLocaleString()
  });
  
  // 等待作业处理
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 检查作业状态
  const state = await job.getState();
  console.log('作业状态:', state);
  
  // 清理测试作业
  await job.remove();
  console.log('测试作业已清理 ✓');
}

/**
 * 测试 Agent 决策队列
 */
async function testAgentQueue() {
  console.log('\n=== 测试 Agent 决策队列 ===');
  
  // 测试订单分配任务
  console.log('添加订单分配任务...');
  const orderAssignmentJob = await addAgentTask('order-assignment', {
    orderId: 'test-order-001',
    orderData: {
      material: 'PLA',
      size: 'medium',
      precision: 'high'
    }
  });
  console.log('订单分配作业已添加:', orderAssignmentJob.id);
  
  // 测试库存检查任务
  console.log('添加库存检查任务...');
  const inventoryCheckJob = await addAgentTask('inventory-check', {
    materialType: 'PLA',
    requiredAmount: 500
  });
  console.log('库存检查作业已添加:', inventoryCheckJob.id);
  
  // 等待作业处理
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 检查作业状态
  const state1 = await orderAssignmentJob.getState();
  const state2 = await inventoryCheckJob.getState();
  console.log('订单分配作业状态:', state1);
  console.log('库存检查作业状态:', state2);
  
  // 清理测试作业
  await orderAssignmentJob.remove();
  await inventoryCheckJob.remove();
  console.log('测试作业已清理 ✓');
}

/**
 * 测试通知队列
 */
async function testNotificationQueue() {
  console.log('\n=== 测试通知队列 ===');
  
  // 测试订单状态通知
  console.log('添加订单状态通知...');
  const orderNotification = await addNotification(types.ORDER_STATUS_UPDATE, {
    orderId: 'test-order-001',
    status: 'processing',
    userId: 'user-001'
  });
  console.log('订单状态通知已添加:', orderNotification.id);
  
  // 测试库存预警通知
  console.log('添加库存预警通知...');
  const inventoryNotification = await addNotification(types.INVENTORY_WARNING, {
    materialType: 'PLA',
    currentStock: 100,
    threshold: 200
  });
  console.log('库存预警通知已添加:', inventoryNotification.id);
  
  // 等待作业处理
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 检查作业状态
  const state1 = await orderNotification.getState();
  const state2 = await inventoryNotification.getState();
  console.log('订单状态通知作业状态:', state1);
  console.log('库存预警通知作业状态:', state2);
  
  // 清理测试作业
  await orderNotification.remove();
  await inventoryNotification.remove();
  console.log('测试作业已清理 ✓');
}

/**
 * 测试队列统计
 */
async function testQueueStats() {
  console.log('\n=== 队列统计 ===');
  
  const queues = [
    { name: '订单队列', queue: orderQueue },
    { name: 'Agent 队列', queue: agentQueue },
    { name: '通知队列', queue: notificationQueue }
  ];
  
  for (const { name, queue } of queues) {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount()
    ]);
    
    console.log(`${name}:`);
    console.log(`  等待中：${waiting}`);
    console.log(`  进行中：${active}`);
    console.log(`  已完成：${completed}`);
    console.log(`  失败：${failed}`);
  }
}

/**
 * 清理队列
 */
async function cleanupQueues() {
  console.log('\n=== 清理队列 ===');
  
  await orderQueue.close();
  await agentQueue.close();
  await notificationQueue.close();
  
  console.log('所有队列已关闭 ✓');
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('========================================');
  console.log('     Bull 任务队列测试');
  console.log('========================================');
  
  try {
    // 1. 测试 Redis 连接
    const redisOk = await testRedisConnection();
    if (!redisOk) {
      console.error('\n测试中止：Redis 连接失败');
      process.exit(1);
    }
    
    // 2. 测试订单队列
    await testOrderQueue();
    
    // 3. 测试 Agent 队列
    await testAgentQueue();
    
    // 4. 测试通知队列
    await testNotificationQueue();
    
    // 5. 显示队列统计
    await testQueueStats();
    
    console.log('\n========================================');
    console.log('     所有测试完成 ✓');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('\n测试失败:', error);
    process.exit(1);
  } finally {
    // 清理
    await cleanupQueues();
    process.exit(0);
  }
}

// 运行测试
runTests();
