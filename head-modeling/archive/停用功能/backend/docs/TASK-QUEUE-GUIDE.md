# Bull 任务队列使用指南

## 概述

本项目使用 [Bull](https://github.com/OptimalBits/bull) 作为任务队列系统，配合 Redis 实现异步任务处理。Bull 是一个基于 Node.js 的高性能任务队列库，具有稳定、高效、易于使用的特点。

### 为什么使用任务队列？

1. **异步处理**：将耗时操作从请求响应周期中剥离，提升用户体验
2. **削峰填谷**：在高峰期缓冲大量请求，避免系统过载
3. **可靠执行**：内置重试机制，确保任务可靠完成
4. **任务调度**：支持延迟执行、定时任务等高级功能
5. **多 Agent 协作**：支持多进程、多实例并发处理

### 队列架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   生产者    │────▶│  Redis + Bull │────▶│   Worker    │
│  (添加任务)  │     │   (队列存储)  │     │  (处理任务)  │
└─────────────┘     └──────────────┘     └─────────────┘
```

## 环境要求

- **Node.js**: >= 18.0.0
- **Redis**: >= 6.0 (推荐 7.0+)
- **npm**: >= 9.0.0

## 安装

### 1. 安装依赖

```bash
cd backend
npm install bull ioredis
```

### 2. 配置 Redis

在项目根目录创建 `.env` 文件：

```env
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

### 3. 启动 Redis

**本地开发**：

```bash
# macOS (使用 Homebrew)
brew services start redis

# Windows (使用 WSL 或 Docker)
docker run -d -p 6379:6379 --name redis redis:latest

# Linux
sudo systemctl start redis
```

**验证 Redis 连接**：

```bash
redis-cli ping
# 应返回：PONG
```

## 队列类型

本项目定义了三种队列类型：

### 1. 订单处理队列 (order-processing)

**用途**：处理用户提交的 3D 打印订单

**处理流程**：
1. 验证订单数据
2. 调用 Agent 进行决策
3. 更新订单状态

**配置参数**：
- 并发数：5
- 超时时间：30 分钟
- 重试次数：3 次
- 退避策略：指数退避（初始 2 秒）

**使用示例**：

```javascript
const { orderQueue } = require('./src/queues');

// 添加订单到队列
await orderQueue.add('order-123', {
  orderId: 'order-123',
  orderData: {
    userId: 'user-001',
    productName: '3D 打印头部模型',
    material: 'PLA',
    quantity: 1
  }
});
```

### 2. Agent 决策队列 (agent-decision)

**用途**：处理多 Agent 系统的决策任务

**支持的任务类型**：
- `order-assignment`: 订单分配决策
- `device-scheduling`: 设备调度决策
- `inventory-check`: 库存检查

**配置参数**：
- 并发数：3
- 超时时间：1 小时
- 重试次数：5 次
- 退避策略：指数退避（初始 3 秒）

**使用示例**：

```javascript
const { agentQueue } = require('./src/queues');

// 订单分配任务
await agentQueue.add('task-123', {
  taskType: 'order-assignment',
  payload: {
    orderId: 'order-123',
    orderData: { /* 订单数据 */ }
  }
});

// 库存检查任务
await agentQueue.add('task-124', {
  taskType: 'inventory-check',
  payload: {
    materialType: 'PLA',
    requiredAmount: 500
  }
});
```

### 3. 通知队列 (notification)

**用途**：处理各类异步通知任务

**支持的通知类型**：
- `order-status-update`: 订单状态变更通知
- `device-task-complete`: 设备任务完成通知
- `inventory-warning`: 库存预警通知
- `system-alert`: 系统告警
- `user-message`: 用户消息

**配置参数**：
- 并发数：10
- 超时时间：5 分钟
- 重试次数：2 次
- 退避策略：固定延迟（1 秒）

**使用示例**：

```javascript
const { notificationQueue, types } = require('./src/queues');

// 订单状态通知
await notificationQueue.add('notify-123', {
  type: types.ORDER_STATUS_UPDATE,
  payload: {
    orderId: 'order-123',
    status: 'processing',
    userId: 'user-001'
  }
});

// 批量添加通知
await notificationQueue.addBulk([
  {
    name: 'notify-1',
    data: { type: types.ORDER_STATUS_UPDATE, payload: {...} }
  },
  {
    name: 'notify-2',
    data: { type: types.USER_MESSAGE, payload: {...} }
  }
]);
```

## Worker 使用

### 启动 Worker

**单独启动某个 Worker**：

```bash
# 启动订单处理 Worker
node src/workers/orderWorker.js

# 启动 Agent 决策 Worker
node src/workers/agentWorker.js

# 启动通知处理 Worker
node src/workers/notificationWorker.js
```

**在应用中使用**：

```javascript
const { startOrderWorker } = require('./src/workers/orderWorker');

// 启动 Worker，自定义并发数
await startOrderWorker({ concurrency: 10 });
```

### 停止 Worker

Worker 会监听 `SIGINT` 和 `SIGTERM` 信号，优雅关闭连接：

```javascript
// 手动停止
const { stopOrderWorker } = require('./src/workers/orderWorker');
await stopOrderWorker();
```

## 高级用法

### 1. 作业优先级

```javascript
// 优先级范围：1 (最高) ~ 2,097,152 (最低)
await queue.add(data, {
  priority: 1 // 高优先级
});
```

### 2. 延迟执行

```javascript
// 5 分钟后执行
await queue.add(data, {
  delay: 5 * 60 * 1000
});
```

### 3. 作业进度

```javascript
// 更新进度（0-100）
await job.progress(50);

// 获取进度
const progress = await job.progress();
console.log(`进度：${progress}%`);
```

### 4. 作业依赖

```javascript
// 子作业
const childJob = await queue.add(childData);

// 父作业（等待子作业完成）
const parentJob = await queue.add(parentData, {
  parent: {
    id: childJob.id,
    queueQualifiedName: queue.qualifiedName
  }
});
```

### 5. 作业事件监听

```javascript
// 作业完成
queue.on('completed', (job, result) => {
  console.log('作业完成:', job.id, result);
});

// 作业失败
queue.on('failed', (job, error) => {
  console.error('作业失败:', job.id, error.message);
});

// 作业卡住
queue.on('stalled', (job) => {
  console.warn('作业卡住:', job.id);
});
```

### 6. 获取作业状态

```javascript
const state = await job.getState();
// 返回：'waiting', 'active', 'completed', 'delayed', 'failed', 'paused'

// 获取所有失败的作业
const failedJobs = await queue.getFailed(0, 100);
```

### 7. 重试失败作业

```javascript
// 手动重试失败的作业
await job.retry();

// 重试所有失败的作业
const failedJobs = await queue.getFailed();
for (const job of failedJobs) {
  await job.retry();
}
```

## 最佳实践

### 1. 幂等性设计

确保任务处理函数是幂等的，即使重复执行也不会产生副作用：

```javascript
async function processOrder(job) {
  const { orderId } = job.data;
  
  // 检查订单是否已处理
  const existingOrder = await Order.findById(orderId);
  if (existingOrder.status === 'processed') {
    return { skipped: true, reason: '已处理' };
  }
  
  // 处理订单...
}
```

### 2. 错误处理

使用 try-catch 捕获错误，并返回有意义的错误信息：

```javascript
async function processOrder(job) {
  try {
    // 处理逻辑
  } catch (error) {
    console.error(`订单处理失败：${job.data.orderId}`, {
      error: error.message,
      stack: error.stack
    });
    throw error; // 重新抛出以触发重试
  }
}
```

### 3. 资源清理

在任务完成后清理临时文件、数据库连接等资源：

```javascript
async function processOrder(job) {
  let tempFile = null;
  try {
    tempFile = await createTempFile();
    // 处理逻辑
  } finally {
    if (tempFile) {
      await cleanupTempFile(tempFile);
    }
  }
}
```

### 4. 日志记录

使用结构化日志记录关键信息：

```javascript
console.log('[订单队列] 开始处理', {
  orderId: job.data.orderId,
  timestamp: new Date().toISOString(),
  attempt: job.attemptsMade
});
```

### 5. 监控告警

为关键队列设置监控和告警：

```javascript
queue.on('failed', async (job, error) => {
  // 发送告警通知
  await sendAlert({
    type: 'queue_job_failed',
    queue: queue.name,
    jobId: job.id,
    error: error.message
  });
});
```

## 常见问题

### Q1: Redis 连接失败

**症状**：启动时提示 `Redis connection failed`

**解决方案**：
1. 确认 Redis 服务已启动：`redis-cli ping`
2. 检查 `.env` 文件中的 Redis 配置
3. 检查防火墙设置，确保 6379 端口可访问

### Q2: 作业一直处于 waiting 状态

**症状**：作业已添加但长时间未处理

**可能原因**：
1. Worker 未启动
2. Worker 并发数已满
3. Redis 连接断开

**排查步骤**：
```javascript
// 检查队列状态
const waiting = await queue.getWaitingCount();
const active = await queue.getActiveCount();
console.log(`等待：${waiting}, 进行中：${active}`);
```

### Q3: 作业重复执行

**症状**：同一个作业被执行多次

**解决方案**：
1. 实现幂等性处理逻辑
2. 使用 `jobId` 避免重复添加
3. 检查 Worker 是否正确关闭

```javascript
// 使用唯一 jobId
await queue.add(data, {
  jobId: uniqueId // 如订单 ID
});
```

### Q4: 内存泄漏

**症状**：Worker 运行时间越长，内存占用越高

**解决方案**：
1. 配置 `removeOnComplete` 和 `removeOnFail`
2. 定期清理旧作业
3. 使用 `queue.clean()` 方法

```javascript
// 清理 7 天前的已完成作业
await queue.clean(7 * 24 * 60 * 60 * 1000, 'completed');
```

### Q5: Redis 持久化

**问题**：Redis 重启后作业丢失

**解决方案**：
1. 启用 Redis AOF 持久化
2. 配置 RDB 快照

**redis.conf 配置**：
```
appendonly yes
appendfsync everysec
save 900 1
save 300 10
save 60 10000
```

## 性能优化

### 1. 调整并发数

根据服务器资源和任务类型调整并发数：

```javascript
// CPU 密集型任务：并发数 = CPU 核心数
queue.process(require('os').cpus().length, processor);

// I/O 密集型任务：可以设置更高的并发数
queue.process(50, processor);
```

### 2. 批量处理

对于小任务，使用批量处理减少 Redis 交互：

```javascript
// 批量添加
await queue.addBulk(jobs);

// 批量处理
queue.process(async (jobs) => {
  return await Promise.all(jobs.map(processSingle));
});
```

### 3. Redis 集群

对于高并发场景，使用 Redis Cluster：

```javascript
const Queue = require('bull');

const queue = new Queue('my-queue', {
  redis: {
    nodes: [
      { host: 'redis-node-1', port: 6379 },
      { host: 'redis-node-2', port: 6379 },
      { host: 'redis-node-3', port: 6379 }
    ]
  }
});
```

## 参考资源

- [Bull 官方文档](https://github.com/OptimalBits/bull)
- [Bull 最佳实践](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md)
- [Redis 文档](https://redis.io/documentation)
- [ioredis 文档](https://github.com/luin/ioredis)

## 更新日志

- 2026-03-03: 初始版本，实现订单、Agent、通知三种队列
