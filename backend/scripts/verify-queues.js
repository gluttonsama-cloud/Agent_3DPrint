/**
 * 队列模块验证脚本
 * 
 * 验证所有队列模块是否可以正确加载（不需要 Redis 连接）
 * 
 * 使用方法：
 *   node scripts/verify-queues.js
 */

const path = require('path');
const fs = require('fs');

console.log('========================================');
console.log('     队列模块验证');
console.log('========================================\n');

let allPassed = true;

/**
 * 验证文件是否存在
 */
function verifyFileExists(filePath, description) {
  const fullPath = path.join(__dirname, '..', filePath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    console.log(`✓ ${description}: ${filePath}`);
    return true;
  } else {
    console.error(`✗ ${description} 不存在：${filePath}`);
    allPassed = false;
    return false;
  }
}

/**
 * 验证模块是否可以加载
 */
function verifyModuleLoad(modulePath, description) {
  try {
    const fullPath = path.join(__dirname, '..', modulePath);
    require(fullPath);
    console.log(`✓ ${description} 加载成功`);
    return true;
  } catch (error) {
    // 忽略 Redis 连接错误，只验证模块语法
    if (error.code === 'ECONNREFUSED' || error.message.includes('Redis')) {
      console.log(`✓ ${description} 模块语法正确（Redis 未运行）`);
      return true;
    }
    console.error(`✗ ${description} 加载失败:`, error.message);
    allPassed = false;
    return false;
  }
}

console.log('1. 验证文件结构');
console.log('----------------------------------------');
verifyFileExists('src/config/redis.js', 'Redis 配置');
verifyFileExists('src/queues/orderQueue.js', '订单队列');
verifyFileExists('src/queues/agentQueue.js', 'Agent 队列');
verifyFileExists('src/queues/notificationQueue.js', '通知队列');
verifyFileExists('src/queues/index.js', '队列导出');
verifyFileExists('src/workers/orderWorker.js', '订单 Worker');
verifyFileExists('src/workers/agentWorker.js', 'Agent Worker');
verifyFileExists('src/workers/notificationWorker.js', '通知 Worker');
verifyFileExists('scripts/test-queues.js', '测试脚本');
verifyFileExists('docs/TASK-QUEUE-GUIDE.md', '使用文档');

console.log('\n2. 验证模块语法');
console.log('----------------------------------------');
verifyModuleLoad('src/config/redis.js', 'Redis 配置');
verifyModuleLoad('src/queues/orderQueue.js', '订单队列');
verifyModuleLoad('src/queues/agentQueue.js', 'Agent 队列');
verifyModuleLoad('src/queues/notificationQueue.js', '通知队列');
verifyModuleLoad('src/workers/orderWorker.js', '订单 Worker');
verifyModuleLoad('src/workers/agentWorker.js', 'Agent Worker');
verifyModuleLoad('src/workers/notificationWorker.js', '通知 Worker');

console.log('\n3. 验证依赖');
console.log('----------------------------------------');
try {
  require.resolve('bull');
  console.log('✓ bull 已安装');
} catch (error) {
  console.error('✗ bull 未安装');
  allPassed = false;
}

try {
  require.resolve('ioredis');
  console.log('✓ ioredis 已安装');
} catch (error) {
  console.error('✗ ioredis 未安装');
  allPassed = false;
}

console.log('\n========================================');
if (allPassed) {
  console.log('     所有验证通过 ✓');
  console.log('========================================');
  console.log('\n提示：运行完整测试需要启动 Redis 服务');
  console.log('命令：npm run test:queues\n');
  process.exit(0);
} else {
  console.log('     部分验证失败 ✗');
  console.log('========================================\n');
  process.exit(1);
}
