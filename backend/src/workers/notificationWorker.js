/**
 * 通知处理 Worker
 * 
 * 处理通知队列中的任务
 */

const { notificationQueue, NOTIFICATION_QUEUE_NAME, processNotification } = require('../queues/notificationQueue');

/**
 * 启动通知处理 Worker
 * 
 * @param {Object} options - Worker 配置选项
 * @param {number} options.concurrency - 并发处理数
 */
async function startNotificationWorker(options = {}) {
  const { concurrency = 10 } = options;
  
  console.log(`[通知 Worker] 启动，并发数：${concurrency}`);
  
  // 注册处理器
  notificationQueue.process(concurrency, async (job) => {
    console.log(`[通知 Worker] 处理作业：${job.id}`, job.data);
    
    try {
      // 调用通知处理函数
      const result = await processNotification(job);
      
      // 更新进度
      await job.progress(100);
      
      return result;
    } catch (error) {
      console.error(`[通知 Worker] 作业失败：${job.id}`, error.message);
      throw error;
    }
  });
  
  console.log('[通知 Worker] 已就绪，等待任务...');
}

/**
 * 停止通知处理 Worker
 */
async function stopNotificationWorker() {
  console.log('[通知 Worker] 正在停止...');
  await notificationQueue.close();
  console.log('[通知 Worker] 已停止');
}

// 如果直接运行此文件，则启动 Worker
if (require.main === module) {
  startNotificationWorker()
    .then(() => {
      console.log('[通知 Worker] 服务已启动');
    })
    .catch((error) => {
      console.error('[通知 Worker] 启动失败:', error);
      process.exit(1);
    });
  
  // 优雅关闭
  process.on('SIGINT', async () => {
    await stopNotificationWorker();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await stopNotificationWorker();
    process.exit(0);
  });
}

module.exports = {
  startNotificationWorker,
  stopNotificationWorker
};
