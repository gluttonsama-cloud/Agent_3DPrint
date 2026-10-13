# Agent 通信协议指南

> 版本：v1.0.0
> 最后更新：2026-03-04

## 目录

- [概述](#概述)
- [架构图](#架构图)
- [核心组件](#核心组件)
- [消息格式](#消息格式)
- [通信模式](#通信模式)
- [超时和重试](#超时和重试)
- [消息队列](#消息队列)
- [API 使用示例](#api 使用示例)
- [最佳实践](#最佳实践)

## 概述

Agent 通信协议为多 Agent 系统提供可靠的消息传递机制，支持请求 - 响应、通知广播等多种通信模式。

### 核心特性

- **标准化消息格式**：统一的消息结构和协议版本
- **请求 - 响应模式**：同步请求处理，支持超时和重试
- **消息队列**：基于 Bull 的持久化队列，支持优先级
- **超时处理**：可配置的超时时间和自动重试
- **事件驱动**：完整的事件发射和监听机制
- **中文支持**：全中文注释和文档

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Messenger                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   AgentMessenger                        │   │
│  │  - sendRequest()    - sendResponse()                    │   │
│  │  - sendNotification() - broadcast()                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│           │                    │                    │           │
│           ▼                    ▼                    ▼           │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐      │
│  │RequestResponse │ │TimeoutRetry    │ │  MessageQueue  │      │
│  │   Handler      │ │   Manager      │ │                │      │
│  │                │ │                │ │                │      │
│  │ - 请求发送     │ │ - 超时检测     │ │ - 消息持久化   │      │
│  │ - 响应等待     │ │ - 指数退避     │ │ - 优先级队列   │      │
│  │ - 关联 ID 匹配  │ │ - 失败回调     │ │ - 消息确认     │      │
│  └────────────────┘ └────────────────┘ └────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Registry                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │Coordinator   │ │Scheduler     │ │Inventory     │            │
│  │Agent         │ │Agent         │ │Agent         │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. Protocol.js - 通信协议定义

定义消息格式、类型、优先级等核心概念。

```javascript
const {
  Message,
  MessageType,
  MessagePriority,
  MessageStatus,
  createRequestMessage,
  createResponseMessage,
  createNotificationMessage
} = require('./communication/Protocol');
```

**消息类型**：
- `REQUEST`: 请求消息（需要响应）
- `RESPONSE`: 响应消息（回复请求）
- `NOTIFICATION`: 通知消息（不需要响应）

**优先级**：
- `URGENT`: 紧急（优先级 1）
- `HIGH`: 高（优先级 2）
- `NORMAL`: 普通（优先级 3）
- `LOW`: 低（优先级 4）

### 2. RequestResponseHandler.js - 请求 - 响应处理器

管理请求发送、响应等待、关联 ID 匹配。

```javascript
const { RequestResponseHandler } = require('./communication/RequestResponseHandler');

const handler = new RequestResponseHandler({
  defaultTimeout: 30000,
  enableLogging: true
});

// 发送请求
const response = await handler.sendRequest(
  'scheduler_agent',
  'allocate_device',
  { orderId: 'order_123' }
);
```

### 3. TimeoutRetryManager.js - 超时和重试管理器

实现超时检测、指数退避重试策略。

```javascript
const { TimeoutRetryManager } = require('./communication/TimeoutRetryManager');

const manager = new TimeoutRetryManager({
  defaultTimeout: 30000,
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000
});

// 注册重试
await manager.registerRetry(
  'req_123',
  'allocate_device',
  async (attempt) => {
    // 重试逻辑
  }
);
```

### 4. MessageQueue.js - 消息队列管理器

基于 Bull 的消息持久化队列。

```javascript
const { messageQueue } = require('./communication/MessageQueue');

// 添加消息到队列
const message = createRequestMessage({
  from: 'coordinator_agent',
  to: 'scheduler_agent',
  action: 'allocate_device',
  data: { orderId: 'order_123' },
  priority: MessagePriority.HIGH
});

await messageQueue.addMessage(message);
```

### 5. AgentMessenger.js - Agent 信使（统一接口）

整合所有通信功能的统一接口。

```javascript
const { AgentMessenger } = require('./communication/AgentMessenger');

const messenger = new AgentMessenger({
  timeout: 30000,
  maxRetries: 3,
  useQueue: true
});

// 发送请求
const response = await messenger.sendRequest(
  'scheduler_agent',
  'allocate_device',
  { orderId: 'order_123' }
);
```

## 消息格式

### 标准消息结构

```javascript
{
  messageId: 'msg_xxx',           // 消息唯一 ID
  from: 'coordinator_agent',      // 发送方 Agent ID
  to: 'scheduler_agent',          // 接收方 Agent ID
  type: 'request',                // 消息类型
  action: 'allocate_device',      // 动作类型
  data: {                         // 消息内容
    orderId: 'order_xxx',
    deviceType: 'sla'
  },
  timestamp: '2026-03-04T08:00:00.000Z',
  priority: 'normal',             // 优先级
  correlationId: 'corr_xxx',      // 关联 ID（请求 - 响应配对）
  timeout: 30000,                 // 超时时间（毫秒）
  maxRetries: 3,                  // 最大重试次数
  protocolVersion: '1.0.0',       // 协议版本
  metadata: {},                   // 元数据
  status: 'pending',              // 消息状态
  attempts: 0,                    // 已尝试次数
  error: null                     // 错误信息
}
```

### 消息验证

所有消息在发送前会自动验证：

```javascript
const message = new Message(config);
const validation = message.validate();

if (!validation.valid) {
  throw new Error(`消息验证失败：${validation.errors.join(', ')}`);
}
```

## 通信模式

### 1. 请求 - 响应模式

```javascript
// 发送请求并等待响应
const response = await messenger.sendRequest(
  'scheduler_agent',        // 目标 Agent
  'allocate_device',        // 动作
  { orderId: 'order_123' }, // 数据
  {
    timeout: 30000,         // 超时配置
    maxRetries: 3           // 重试次数
  }
);

console.log('响应:', response);
```

### 2. 通知模式

```javascript
// 发送通知（不需要响应）
messenger.sendNotification(
  'inventory_agent',
  'stock_alert',
  {
    materialType: 'resin',
    currentStock: 100,
    threshold: 50
  }
);
```

### 3. 广播模式

```javascript
// 广播给所有 Agent
const results = await messenger.broadcast(
  'status_check',
  { timestamp: Date.now() },
  (agent) => agent.state === 'ready' // 过滤函数
);

results.forEach(result => {
  if (result.success) {
    console.log(`${result.agentId}: 正常`);
  } else {
    console.log(`${result.agentId}: ${result.error}`);
  }
});
```

### 4. 队列模式

```javascript
// 通过队列发送请求（异步）
const job = await messenger.sendRequestViaQueue(
  'scheduler_agent',
  'allocate_device',
  { orderId: 'order_123' },
  {
    priority: MessagePriority.HIGH,
    delay: 5000 // 延迟 5 秒执行
  }
);

console.log('作业 ID:', job.jobId);
```

## 超时和重试

### 超时配置

```javascript
const messenger = new AgentMessenger({
  timeout: 30000,      // 默认 30 秒超时
  maxRetries: 3,       // 最多重试 3 次
  retryDelay: 1000     // 基础延迟 1 秒
});
```

### 指数退避策略

重试延迟计算公式：
```
延迟 = Math.pow(2, 尝试次数) * baseDelay
最大延迟 = min(计算延迟，maxDelay)
```

示例：
- 第 1 次重试：1 秒
- 第 2 次重试：2 秒
- 第 3 次重试：4 秒
- 最大延迟：30 秒

### 重试回调

```javascript
await timeoutManager.registerRetry(
  'req_123',
  'allocate_device',
  async (attempt) => {
    console.log(`第 ${attempt} 次尝试`);
    // 重试逻辑
  },
  {
    onSuccess: (result, attempts) => {
      console.log('重试成功:', result);
    },
    onFailure: (error, attempts) => {
      console.error('重试失败:', error);
    }
  }
);
```

## 消息队列

### 队列配置

```javascript
const QUEUE_CONFIG = {
  limiter: {
    max: 10,        // 每秒最多处理 10 个消息
    duration: 1000
  },
  defaultJobOptions: {
    attempts: 3,                    // 失败重试 3 次
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    timeout: 60000,                 // 作业超时 60 秒
    removeOnComplete: {
      count: 100,
      age: 24 * 60 * 60
    }
  }
};
```

### 优先级队列

```javascript
// 紧急消息优先处理
const urgentMessage = createRequestMessage({
  from: 'coordinator_agent',
  to: 'scheduler_agent',
  action: 'emergency_stop',
  priority: MessagePriority.URGENT
});

await messageQueue.addMessage(urgentMessage);
```

### 队列监控

```javascript
const stats = await messageQueue.getStats();
console.log('队列统计:', {
  waiting: stats.waiting,
  active: stats.active,
  completed: stats.completed,
  failed: stats.failed,
  delayed: stats.delayed
});
```

## API 使用示例

### 完整示例：Coordinator Agent 调用 Scheduler Agent

```javascript
const { AgentMessenger } = require('./communication/AgentMessenger');
const { MessagePriority } = require('./communication/Protocol');

// 创建信使
const messenger = new AgentMessenger({
  timeout: 30000,
  maxRetries: 3,
  useQueue: true
});

// 设置 Agent 注册中心
messenger.setAgentRegistry(agentRegistry);

// 监听事件
messenger.on('request_sent', (data) => {
  console.log('请求已发送:', data);
});

messenger.on('response_received', (data) => {
  console.log('响应已接收:', data);
});

messenger.on('timeout', (data) => {
  console.warn('请求超时:', data);
});

// 发送设备分配请求
async function allocateDevice(orderId) {
  try {
    const response = await messenger.sendRequest(
      'scheduler_agent',
      'allocate_device',
      { orderId },
      {
        priority: MessagePriority.HIGH,
        timeout: 60000
      }
    );
    
    console.log('设备分配成功:', response);
    return response;
  } catch (error) {
    console.error('设备分配失败:', error.message);
    throw error;
  }
}

// 使用示例
allocateDevice('order_123');
```

### 事件监听完整示例

```javascript
const { CommunicationEventType } = require('./communication/AgentMessenger');

// 监听所有通信事件
messenger.on(CommunicationEventType.REQUEST_SENT, (data) => {
  console.log('请求发送:', data);
});

messenger.on(CommunicationEventType.RESPONSE_RECEIVED, (data) => {
  console.log('响应接收:', data);
});

messenger.on(CommunicationEventType.TIMEOUT, (data) => {
  console.warn('超时:', data);
});

messenger.on(CommunicationEventType.RETRY, (data) => {
  console.log('重试:', data);
});

messenger.on(CommunicationEventType.ERROR, (data) => {
  console.error('错误:', data);
});
```

## 最佳实践

### 1. 合理设置超时时间

```javascript
// 根据操作类型设置不同超时
const timeouts = {
  read: 10000,      // 读取操作 10 秒
  write: 30000,     // 写入操作 30 秒
  complex: 60000    // 复杂操作 60 秒
};

const response = await messenger.sendRequest(
  targetAgent,
  action,
  data,
  { timeout: timeouts[actionType] }
);
```

### 2. 使用适当的优先级

```javascript
// 紧急操作使用 URGENT
if (isEmergency) {
  priority = MessagePriority.URGENT;
}
// 用户请求使用 HIGH
else if (isUserRequest) {
  priority = MessagePriority.HIGH;
}
// 后台任务使用 NORMAL
else {
  priority = MessagePriority.NORMAL;
}
```

### 3. 实现优雅的错误处理

```javascript
try {
  const response = await messenger.sendRequest(...);
  return response;
} catch (error) {
  if (error.code === 'REQUEST_TIMEOUT') {
    // 超时处理
    logger.warn('请求超时，已记录日志');
  } else if (error.code === 'AGENT_NOT_FOUND') {
    // Agent 不存在
    logger.error('目标 Agent 不存在');
  } else {
    // 其他错误
    logger.error('通信失败:', error.message);
  }
  throw error;
}
```

### 4. 监控和日志

```javascript
// 启用日志
const messenger = new AgentMessenger({
  enableLogging: true
});

// 定期检查统计
setInterval(() => {
  const stats = messenger.getStats();
  console.log('通信统计:', stats);
  
  // 告警
  if (stats.pendingRequests > 100) {
    alert('待处理请求过多');
  }
}, 60000);
```

### 5. 资源清理

```javascript
// 应用关闭时清理
process.on('SIGTERM', async () => {
  console.log('正在关闭...');
  
  // 清理待处理请求
  messenger.clearPendingRequests();
  
  // 关闭信使
  messenger.close();
  
  // 关闭队列
  await messageQueue.close();
  
  process.exit(0);
});
```

### 6. 消息历史管理

```javascript
// 限制历史记录大小
const messenger = new AgentMessenger({
  maxHistorySize: 100
});

// 定期清理历史
setInterval(() => {
  messenger.clearHistory();
}, 3600000); // 每小时清理
```

## 故障排查

### 常见问题

1. **请求超时**
   - 检查目标 Agent 是否在线
   - 增加超时时间
   - 检查网络延迟

2. **重试次数过多**
   - 检查目标 Agent 处理能力
   - 调整重试策略
   - 使用队列模式

3. **消息丢失**
   - 启用消息队列持久化
   - 检查 Redis 连接
   - 启用消息确认

### 调试技巧

```javascript
// 启用详细日志
const messenger = new AgentMessenger({
  enableLogging: true
});

// 监听所有事件
messenger.on('agent_event', (event) => {
  console.log('事件:', event.type, event.data);
});

// 获取待处理请求
const pending = messenger.getPendingRequests();
console.log('待处理请求:', pending);
```

## 参考资料

- [Protocol.js API](./src/agents/communication/Protocol.js)
- [RequestResponseHandler.js API](./src/agents/communication/RequestResponseHandler.js)
- [TimeoutRetryManager.js API](./src/agents/communication/TimeoutRetryManager.js)
- [MessageQueue.js API](./src/agents/communication/MessageQueue.js)
- [AgentMessenger.js API](./src/agents/communication/AgentMessenger.js)
