# 协调 Agent（Coordinator Agent）开发指南

## 目录

1. [概述](#概述)
2. [架构图](#架构图)
3. [核心组件](#核心组件)
4. [决策规则](#决策规则)
5. [API 使用指南](#api-使用指南)
6. [配置选项](#配置选项)
7. [最佳实践](#最佳实践)

---

## 概述

协调 Agent（Coordinator Agent）是多 Agent 系统的决策中枢，负责：

- **接收订单**：从队列或直接接收待处理订单
- **协调 Agent**：调用调度 Agent、库存 Agent 等完成专业任务
- **智能决策**：基于规则引擎做出自动通过或转人工审核的决策
- **记录决策**：创建可追溯的决策记录
- **更新状态**：使用状态机管理订单状态流转

### 核心特性

- **规则引擎驱动**：基于可配置的决策规则进行评估
- **Agent 间通信**：支持请求 - 响应模式的 Agent 协作
- **超时重试**：内置超时处理和重试机制
- **决策可追溯**：完整的决策历史和解释
- **状态机管理**：使用 OrderStateMachine 确保状态转换正确

---

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     协调 Agent（Coordinator）                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  决策引擎（DecisionEngine）             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │  照片质量   │  │  库存检查   │  │  参数标准   │   │  │
│  │  │    规则     │  │    规则     │  │    规则     │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              通信模块（AgentMessenger）                │  │
│  │   ┌─────────────┐   ┌─────────────┐                  │  │
│  │   │  调度 Agent  │   │  库存 Agent  │                  │  │
│  │   │  Scheduler  │   │  Inventory  │                  │  │
│  │   └─────────────┘   └─────────────┘                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            订单状态机（OrderStateMachine）              │  │
│  │   pending_review → reviewing → scheduled              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   AgentDecision     │
                    │   （决策记录）       │
                    └─────────────────────┘
```

---

## 核心组件

### 1. CoordinatorAgent 类

**文件位置**: `backend/src/agents/CoordinatorAgent.js`

协调 Agent 主类，继承自 BaseAgent，提供以下核心方法：

#### `processOrder(orderId)` - 处理订单

完整的订单处理流程：
1. 获取订单详情
2. 调用调度 Agent 分配设备
3. 调用库存 Agent 检查材料
4. 决策引擎评估
5. 记录决策
6. 更新订单状态

```javascript
const coordinator = agentRegistry.get('coordinator_agent');
const result = await coordinator.execute({
  type: 'process_order',
  orderId: '60f7b3b3b3b3b3b3b3b3b3b3'
});
```

#### `makeDecision(orderId, context)` - 做出决策

使用决策引擎对订单进行评估：

```javascript
const decision = await coordinator.makeDecision(orderId, {
  stockInfo: {
    'material_001': 100,
    'material_002': 50
  }
});

console.log(decision.result);      // 'auto_approve' 或 'manual_review'
console.log(decision.confidence);  // 0.0 - 1.0
console.log(decision.rationale);   // 决策解释
```

#### `scheduleDevice(orderId)` - 调度设备

调用调度 Agent 分配打印设备：

```javascript
const scheduleResult = await coordinator.scheduleDevice(orderId);
```

#### `checkStock(orderId)` - 检查库存

调用库存 Agent 检查材料库存：

```javascript
const stockResult = await coordinator.checkStock(orderId);
console.log(stockResult.stockInfo);
```

#### `recordDecision(orderId, decision)` - 记录决策

创建 AgentDecision 记录并链接到订单：

```javascript
await coordinator.recordDecision(orderId, decision);
```

### 2. DecisionEngine 类

**文件位置**: `backend/src/agents/DecisionEngine.js`

决策规则引擎，负责评估订单并做出决策。

#### 创建决策引擎

```javascript
const { DecisionEngine } = require('../src/agents/DecisionEngine');

const engine = new DecisionEngine({
  enableLogging: true  // 启用日志
});
```

#### 评估订单

```javascript
const decision = await engine.makeDecision(order, {
  stockInfo: { /* 库存信息 */ }
});
```

#### 添加自定义规则

```javascript
engine.addRule({
  id: 'custom_rule',
  name: '自定义规则',
  priority: RulePriority.MEDIUM,
  condition: (order, context) => {
    // 返回 true 表示规则匹配
    return order.metadata?.special === true;
  },
  action: (order, context) => ({
    result: DecisionResult.MANUAL_REVIEW,
    confidence: 0.8,
    reason: '特殊订单需要人工审核'
  }),
  rationale: (order, context) => '这是一个特殊订单'
});
```

### 3. AgentMessenger 类

**文件位置**: `backend/src/agents/communication/AgentMessenger.js`

Agent 间通信模块，提供请求 - 响应模式的通信机制。

#### 发送请求

```javascript
const { AgentMessenger } = require('../src/agents/communication/AgentMessenger');

const messenger = new AgentMessenger({
  timeout: 30000,      // 超时时间（毫秒）
  maxRetries: 3,       // 最大重试次数
  retryDelay: 1000     // 重试延迟（毫秒）
});

messenger.setAgentRegistry(agentRegistry);

const response = await messenger.sendRequest(
  'scheduler_agent',  // 目标 Agent ID
  'schedule_device',  // 请求动作
  { orderId: '...' }, // 请求负载
  { fromAgentId: 'coordinator_agent' }
);
```

#### 事件监听

```javascript
messenger.on('request_sent', (data) => {
  console.log('请求已发送:', data);
});

messenger.on('timeout', (data) => {
  console.log('请求超时:', data);
});

messenger.on('error', (data) => {
  console.error('请求错误:', data);
});
```

---

## 决策规则

### 规则列表

系统预置以下决策规则：

| 规则 ID | 规则名称 | 优先级 | 描述 |
|--------|---------|--------|------|
| `order_completeness_check` | 订单完整性检查 | CRITICAL | 检查订单信息是否完整 |
| `photo_quality_check` | 照片质量检查 | CRITICAL | 检查照片质量是否满足要求 |
| `material_stock_check` | 库存检查 | HIGH | 检查材料库存是否充足 |
| `parameter_standard_check` | 参数标准检查 | MEDIUM | 检查参数是否符合标准 |
| `standard_order_auto_approve` | 标准订单自动通过 | LOW | 标准订单自动通过 |

### 规则优先级

```javascript
const RulePriority = {
  CRITICAL: 1,  // 关键规则（必须满足）
  HIGH: 2,      // 高优先级规则
  MEDIUM: 3,    // 中等优先级规则
  LOW: 4        // 低优先级规则
};
```

### 决策结果

```javascript
const DecisionResult = {
  AUTO_APPROVE: 'auto_approve',   // 自动通过
  MANUAL_REVIEW: 'manual_review', // 转人工审核
  REJECT: 'reject'                // 拒绝
};
```

### 冲突解决策略

当多个规则匹配时，系统按以下策略解决冲突：

1. **拒绝优先**：任何规则要求拒绝，则最终拒绝
2. **人工审核优先**：任何规则要求人工审核，则转人工
3. **自动通过**：选择优先级最高的自动通过规则
4. **默认**：返回优先级最高的规则

---

## API 使用指南

### 触发协调 Agent 处理订单

```http
POST /api/agents/coordinate
Content-Type: application/json

{
  "orderId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "force": false
}
```

**响应示例**:

```json
{
  "success": true,
  "message": "订单协调处理完成",
  "data": {
    "orderId": "60f7b3b3b3b3b3b3b3b3b3b3",
    "decision": {
      "result": "auto_approve",
      "confidence": 0.95,
      "reason": "标准订单，自动通过",
      "rationale": "订单符合所有标准..."
    },
    "status": "completed"
  }
}
```

### 查询订单协调状态

```http
GET /api/agents/coordination/:orderId
```

**响应示例**:

```json
{
  "success": true,
  "message": "协调状态查询成功",
  "data": {
    "order": { ... },
    "coordinationTasks": [...],
    "stateMachine": { ... }
  }
}
```

### 获取协调 Agent 状态

```http
GET /api/agents/coordinator/status
```

**响应示例**:

```json
{
  "success": true,
  "message": "协调 Agent 状态获取成功",
  "data": {
    "id": "coordinator_agent",
    "state": "ready",
    "coordinationTasks": {
      "total": 10,
      "processing": 2,
      "completed": 7,
      "failed": 1
    },
    "decisionEngine": {
      "rulesCount": 5
    }
  }
}
```

### 手动触发决策评估

```http
POST /api/agents/coordinator/decision
Content-Type: application/json

{
  "orderId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "context": {
    "stockInfo": {
      "material_001": 100
    }
  }
}
```

---

## 配置选项

### CoordinatorAgent 配置

```javascript
const coordinator = new CoordinatorAgent({
  id: 'coordinator_agent',          // Agent 唯一标识
  name: '协调 Agent',                // Agent 名称
  description: '多 Agent 系统决策中枢', // 描述
  llmConfig: {                      // LLM 配置（可选）
    provider: 'openai',
    model: 'gpt-4'
  }
});
```

### DecisionEngine 配置

```javascript
const engine = new DecisionEngine({
  enableLogging: true,    // 是否启用日志
  rules: customRules      // 自定义规则列表（可选）
});
```

### AgentMessenger 配置

```javascript
const messenger = new AgentMessenger({
  timeout: 30000,         // 默认超时时间（毫秒）
  maxRetries: 3,          // 最大重试次数
  retryDelay: 1000,       // 重试延迟（毫秒）
  enableLogging: true     // 是否启用日志
});
```

---

## 最佳实践

### 1. 规则设计原则

- **单一职责**：每条规则只检查一个条件
- **优先级明确**：关键检查使用 CRITICAL 优先级
- **可解释性**：提供清晰的 rationale 说明
- **可测试性**：规则条件应该是纯函数

### 2. 错误处理

```javascript
try {
  const result = await coordinator.processOrder(orderId);
} catch (error) {
  if (error.code === 'AGENT_NOT_FOUND') {
    // 处理 Agent 不可用的情况
    console.error('调度 Agent 不可用');
  } else if (error.code === 'TIMEOUT_EXCEEDED') {
    // 处理超时情况
    console.error('请求超时');
  } else {
    // 其他错误
    throw error;
  }
}
```

### 3. 性能优化

- **批量处理**：使用 `batchMakeDecision` 批量评估订单
- **缓存状态机**：协调 Agent 内部缓存 OrderStateMachine 实例
- **异步通信**：Agent 间通信使用异步模式

### 4. 监控和日志

```javascript
// 启用详细日志
const coordinator = new CoordinatorAgent();
await coordinator.initialize();

// 监听事件
coordinator.on('state_changed', (data) => {
  console.log('状态变化:', data);
});

// 获取统计信息
const stats = coordinator.getStats();
console.log('处理统计:', stats);
```

### 5. 测试建议

运行测试脚本验证功能：

```bash
node backend/scripts/test-coordinator-agent.js
```

测试覆盖：
- 决策结果枚举
- 订单决策规则
- 决策引擎功能
- 异步决策评估
- Agent Messenger 通信
- Coordinator Agent 创建
- Agent Registry 集成

---

## 相关文件

- `backend/src/agents/CoordinatorAgent.js` - 协调 Agent 主类
- `backend/src/agents/DecisionEngine.js` - 决策引擎
- `backend/src/agents/rules/orderRules.js` - 订单决策规则
- `backend/src/agents/communication/AgentMessenger.js` - Agent 通信模块
- `backend/src/agents/registry.js` - Agent 注册中心
- `backend/src/routes/agents.js` - Agent API 路由
- `backend/scripts/test-coordinator-agent.js` - 测试脚本

---

## 更新日志

### v1.0.0 (2026-03-03)
- 初始版本
- 实现协调 Agent 核心功能
- 实现决策规则引擎
- 实现 Agent 间通信模块
- 创建 API 端点
- 创建测试脚本
