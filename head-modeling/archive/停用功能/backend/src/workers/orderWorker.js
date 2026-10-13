/**
 * 订单处理 Worker
 * 
 * 处理订单队列中的任务
 */

const { orderQueue, ORDER_QUEUE_NAME, processOrder } = require('../queues/orderQueue');

/**
 * 启动订单处理 Worker
 * 
 * @param {Object} options - Worker 配置选项
 * @param {number} options.concurrency - 并发处理数
 */
async function startOrderWorker(options = {}) {
  const { concurrency = 5 } = options;
  
  console.log(`[订单 Worker] 启动，并发数：${concurrency}`);
  
  // 注册处理器
  orderQueue.process(concurrency, async (job) => {
    console.log(`[订单 Worker] 处理作业：${job.id}`, job.data);
    
    try {
      // 调用订单处理函数
      const result = await processOrder(job);
      
      // 更新进度
      await job.progress(100);
      
      return result;
    } catch (error) {
      console.error(`[订单 Worker] 作业失败：${job.id}`, error.message);
      throw error;
    }
  });
  
  console.log('[订单 Worker] 已就绪，等待任务...');
}

/**
 * 停止订单处理 Worker
 */
async function stopOrderWorker() {
  console.log('[订单 Worker] 正在停止...');
  await orderQueue.close();
  console.log('[订单 Worker] 已停止');
}

// 如果直接运行此文件，则启动 Worker
if (require.main === module) {
  startOrderWorker()
    .then(() => {
      console.log('[订单 Worker] 服务已启动');
    })
    .catch((error) => {
      console.error('[订单 Worker] 启动失败:', error);
      process.exit(1);
    });
  
  // 优雅关闭
  process.on('SIGINT', async () => {
    await stopOrderWorker();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await stopOrderWorker();
    process.exit(0);
  });
}

module.exports = {
  startOrderWorker,
  stopOrderWorker
};
