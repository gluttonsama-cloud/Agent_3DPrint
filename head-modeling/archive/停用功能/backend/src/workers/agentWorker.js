/**
 * Agent 决策 Worker
 * 
 * 处理 Agent 决策队列中的任务
 */

const { agentQueue, AGENT_QUEUE_NAME, processAgentDecision } = require('../queues/agentQueue');

/**
 * 启动 Agent 决策 Worker
 * 
 * @param {Object} options - Worker 配置选项
 * @param {number} options.concurrency - 并发处理数
 */
async function startAgentWorker(options = {}) {
  const { concurrency = 3 } = options;
  
  console.log(`[Agent Worker] 启动，并发数：${concurrency}`);
  
  // 注册处理器
  agentQueue.process(concurrency, async (job) => {
    console.log(`[Agent Worker] 处理作业：${job.id}`, job.data);
    
    try {
      // 调用 Agent 决策处理函数
      const result = await processAgentDecision(job);
      
      // 更新进度
      await job.progress(100);
      
      return result;
    } catch (error) {
      console.error(`[Agent Worker] 作业失败：${job.id}`, error.message);
      throw error;
    }
  });
  
  console.log('[Agent Worker] 已就绪，等待任务...');
}

/**
 * 停止 Agent 决策 Worker
 */
async function stopAgentWorker() {
  console.log('[Agent Worker] 正在停止...');
  await agentQueue.close();
  console.log('[Agent Worker] 已停止');
}

// 如果直接运行此文件，则启动 Worker
if (require.main === module) {
  startAgentWorker()
    .then(() => {
      console.log('[Agent Worker] 服务已启动');
    })
    .catch((error) => {
      console.error('[Agent Worker] 启动失败:', error);
      process.exit(1);
    });
  
  // 优雅关闭
  process.on('SIGINT', async () => {
    await stopAgentWorker();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await stopAgentWorker();
    process.exit(0);
  });
}

module.exports = {
  startAgentWorker,
  stopAgentWorker
};
