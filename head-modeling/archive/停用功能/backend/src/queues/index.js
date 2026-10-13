/**
 * 队列导出模块
 * 
 * 统一导出所有队列和 Worker
 */

// 队列导出
const orderQueue = require('./orderQueue');
const agentQueue = require('./agentQueue');
const notificationQueue = require('./notificationQueue');

// 导出所有队列
module.exports = {
  // 订单处理队列
  orderQueue: {
    queue: orderQueue.orderQueue,
    name: orderQueue.ORDER_QUEUE_NAME,
    processor: orderQueue.processOrder,
    add: orderQueue.addOrderToQueue,
    getProgress: orderQueue.getOrderProgress,
    updateProgress: orderQueue.updateOrderProgress
  },
  
  // Agent 决策队列
  agentQueue: {
    queue: agentQueue.agentQueue,
    name: agentQueue.AGENT_QUEUE_NAME,
    processor: agentQueue.processAgentDecision,
    add: agentQueue.addAgentTask,
    getStatus: agentQueue.getAgentTaskStatus
  },
  
  // 通知队列
  notificationQueue: {
    queue: notificationQueue.notificationQueue,
    name: notificationQueue.NOTIFICATION_QUEUE_NAME,
    processor: notificationQueue.processNotification,
    add: notificationQueue.addNotification,
    addBulk: notificationQueue.addNotificationsBulk,
    types: notificationQueue.NOTIFICATION_TYPES
  }
};
