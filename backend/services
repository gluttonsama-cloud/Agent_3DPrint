/**
 * 任务监控与清理服务
 * 提供任务统计和自动清理功能
 */
const taskStore = require('./taskStore');

/**
 * 获取任务统计信息
 * @returns {Object} 任务统计数据
 */
function getStats() {
  const tasks = taskStore.getAllTasks();
  
  const total = tasks.length;
  const pending = tasks.filter(t => t.status === 'PENDING').length;
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const completed = tasks.filter(t => t.status === 'COMPLETED').length;
  const failed = tasks.filter(t => t.status === 'FAILED').length;
  
  const finishedCount = completed + failed;
  const successRate = finishedCount > 0 
    ? Math.round((completed / finishedCount) * 100) 
    : 0;
  
  return {
    total,
    pending,
    inProgress,
    completed,
    failed,
    successRate
  };
}

/**
 * 清理指定天数前的已完成/失败任务
 * @param {number} days - 保留天数
 * @returns {number} 清理的任务数量
 */
function cleanOldTasks(days = 7) {
  const tasks = taskStore.getAllTasks();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  let cleanedCount = 0;
  
  tasks.forEach(task => {
    const taskDate = new Date(task.updatedAt);
    const isOld = taskDate < cutoffDate;
    const isFinished = task.status === 'COMPLETED' || task.status === 'FAILED';
    
    if (isOld && isFinished) {
      taskStore.deleteTask(task.id);
      cleanedCount++;
    }
  });
  
  return cleanedCount;
}

/**
 * 启动定时自动清理任务
 * @param {number} days - 保留天数，默认 7 天
 * @param {number} interval - 清理间隔（毫秒），默认 24 小时
 * @returns {NodeJS.Timeout} 定时器句柄
 */
function autoCleanup(days = 7, interval = 24 * 60 * 60 * 1000) {
  console.log(`🧹 启动自动清理服务：每 ${interval / 1000 / 60} 分钟清理 ${days} 天前的任务`);
  
  const timer = setInterval(() => {
    const cleaned = cleanOldTasks(days);
    if (cleaned > 0) {
      console.log(`🧹 自动清理完成：删除了 ${cleaned} 个旧任务`);
    }
  }, interval);
  
  return timer;
}

module.exports = {
  getStats,
  cleanOldTasks,
  autoCleanup
};