# 订单状态机使用指南

## 概述

订单状态机（Order State Machine）是一个有限状态机（FSM）实现，用于管理 3D 打印订单的完整生命周期。它确保订单状态转换的正确性、可追溯性，并提供事件通知机制。

## 核心特性

- ✅ **状态验证**：防止无效的状态转换
- ✅ **转换规则**：严格定义允许的状态流转路径
- ✅ **钩子系统**：支持在状态变更的不同阶段执行自定义逻辑
- ✅ **事件通知**：集成 AgentEventEmitter，实时推送状态变更事件
- ✅ **历史记录**：完整的状态变更历史追溯
- ✅ **终端状态保护**：防止从终端状态继续转换

## 状态定义

订单状态机共定义 9 个状态：

| 状态常量 | 状态值 | 中文名称 | 说明 |
|---------|--------|---------|------|
| `PENDING_REVIEW` | `pending_review` | 待审核 | 订单刚创建，等待管理员审核 |
| `REVIEWING` | `reviewing` | 审核中 | 管理员正在审核订单详情 |
| `SCHEDULED` | `scheduled` | 已排程 | 审核通过，已安排打印计划 |
| `PRINTING` | `printing` | 打印中 | 3D 打印机正在执行打印任务 |
| `POST_PROCESSING` | `post_processing` | 后处理 | 打印完成，正在进行后处理 |
| `COMPLETED` | `completed` | 已完成 | 所有处理完成，等待发货 |
| `SHIPPED` | `shipped` | 已发货 | 订单已发货给客户 |
| `CANCELLED` | `cancelled` | 已取消 | 订单被取消 |
| `REFUNDED` | `refunded` | 已退款 | 订单已完成退款流程 |

### 终端状态

以下状态为终端状态，订单进入这些状态后通常不可继续转换：

- `COMPLETED`（已完成）→ 可转换为 `SHIPPED`
- `SHIPPED`（已发货）→ 可转换为 `REFUNDED`（退货退款）
- `CANCELLED`（已取消）→ 可转换为 `REFUNDED`
- `REFUNDED`（已退款）→ 真正的终端状态，不可再转换

## 状态转换规则

```
待审核 (pending_review)
  ├──→ 审核中 (reviewing)      [开始审核]
  └──→ 已取消 (cancelled)      [取消订单]

审核中 (reviewing)
  ├──→ 已排程 (scheduled)      [审核通过]
  └──→ 已取消 (cancelled)      [审核拒绝]

已排程 (scheduled)
  ├──→ 打印中 (printing)       [开始打印]
  └──→ 已取消 (cancelled)      [取消订单]

打印中 (printing)
  ├──→ 后处理 (post_processing) [打印完成]
  └──→ 已取消 (cancelled)      [取消订单 - 异常]

后处理 (post_processing)
  ├──→ 已完成 (completed)      [后处理完成]
  └──→ 已取消 (cancelled)      [取消订单 - 异常]

已完成 (completed)
  ├──→ 已发货 (shipped)        [订单发货]
  └──→ 已取消 (cancelled)      [取消订单 - 异常]

已发货 (shipped)
  └──→ 已退款 (refunded)       [处理退款 - 退货退款]

已取消 (cancelled)
  └──→ 已退款 (refunded)       [处理退款]

已退款 (refunded)
  └──→ （终端状态，无转换）
```

## 快速开始

### 1. 创建状态机实例

```javascript
const { createOrderStateMachine } = require('./states/OrderStateMachine');
const { OrderStates } = require('./constants/orderStates');

// 创建订单状态机，默认初始状态为待审核
const sm = createOrderStateMachine('ORDER-20250101-001');

// 或指定初始状态
const sm2 = createOrderStateMachine('ORDER-20250101-002', OrderStates.REVIEWING);
```

### 2. 执行状态转换

```javascript
async function processOrder() {
  const sm = createOrderStateMachine('ORDER-20250101-001');
  
  // 检查是否可以转换
  if (sm.canTransition(OrderStates.REVIEWING)) {
    // 执行转换，传入上下文信息
    const result = await sm.transition(OrderStates.REVIEWING, {
      operator: 'admin-001',
      reviewTime: new Date().toISOString()
    });
    
    console.log('转换成功:', result);
  }
  
  // 继续转换流程
  await sm.transition(OrderStates.SCHEDULED, {
    operator: 'admin-001',
    scheduledTime: '2025-01-02 10:00'
  });
  
  await sm.transition(OrderStates.PRINTING, {
    printerId: 'PRINTER-01',
    operator: 'worker-001'
  });
}
```

### 3. 监听状态变更事件

```javascript
const sm = createOrderStateMachine('ORDER-20250101-001');

// 监听任何状态变化
sm.on('stateChanged', (data) => {
  console.log(`订单 ${data.orderId} 状态变更:`, data);
});

// 监听特定状态
sm.on('state:printing', (data) => {
  console.log(`订单 ${data.orderId} 开始打印!`);
});

// 监听错误
sm.on('error', ({ error }) => {
  console.error('状态机错误:', error.message);
});
```

### 4. 查询状态信息

```javascript
const sm = createOrderStateMachine('ORDER-20250101-001');

// 获取当前状态
console.log('当前状态:', sm.getCurrentState());  // 'pending_review'
console.log('状态标签:', sm.getCurrentStateLabel());  // '待审核'

// 获取可用操作
const actions = sm.getAvailableActions();
console.log('可执行操作:', actions);
// [
//   { toState: 'reviewing', action: 'start_review', label: '开始审核' },
//   { toState: 'cancelled', action: 'cancel_order', label: '取消订单' }
// ]

// 获取状态历史
const history = sm.getHistory();
console.log('状态历史:', history);

// 获取状态机快照
const snapshot = sm.getSnapshot();
console.log('完整快照:', snapshot);
```

## 钩子系统

### 注册自定义钩子

```javascript
const { registerHook } = require('./states/hooks');

// 注册进入状态钩子
registerHook('onEnter', OrderStates.PRINTING, async (context) => {
  console.log(`订单 ${context.orderId} 开始打印，打印机：${context.printerId}`);
  
  // 发送通知
  await sendNotification(context.orderId, '您的订单开始打印');
  
  // 更新库存
  await updateInventory(context.materialType, -context.requiredAmount);
});

// 注册退出状态钩子
registerHook('onExit', OrderStates.PENDING_REVIEW, async (context) => {
  console.log(`订单 ${context.orderId} 审核流程开始`);
});

// 注册转换钩子（特定转换）
registerHook('onTransition', 'reviewing->scheduled', async (context) => {
  console.log(`订单 ${context.orderId} 审核通过，已安排生产`);
  
  // 发送审核通过通知
  await sendApprovalNotification(context.orderId);
});

// 注册通用转换钩子（匹配所有转换）
registerHook('onTransition', '*', async (context) => {
  console.log(`订单状态变更：${context.fromState} -> ${context.toState}`);
  
  // 记录审计日志
  await logAuditEvent(context);
});
```

### 注销钩子

```javascript
const { unregisterHook } = require('./states/hooks');

// 注销特定钩子
const myHook = async (context) => { /* ... */ };
registerHook('onEnter', OrderStates.PRINTING, myHook);
unregisterHook('onEnter', OrderStates.PRINTING, myHook);
```

## 错误处理

### 常见错误类型

```javascript
try {
  await sm.transition('invalid_state');
} catch (error) {
  if (error.code === 'INVALID_STATE') {
    console.error('无效的状态值');
  }
}

try {
  await sm.transition(OrderStates.PRINTING); // 从不允许的状态转换
} catch (error) {
  if (error.code === 'INVALID_TRANSITION') {
    console.error('不允许的状态转换:', error.fromState, '->', error.toState);
  }
}

try {
  await sm.transition(OrderStates.SCHEDULED); // 从终端状态转换
} catch (error) {
  if (error.code === 'TERMINAL_STATE') {
    console.error('当前是终端状态，无法转换');
  }
}
```

### 错误事件监听

```javascript
sm.on('error', ({ orderId, error, fromState, toState }) => {
  console.error(`订单 ${orderId} 状态转换失败:`, {
    message: error.message,
    code: error.code,
    from: fromState,
    to: toState
  });
  
  // 发送告警通知
  sendAlertToAdmin(error);
});
```

## AgentEventEmitter 集成

状态变更会自动发射事件到全局 `AgentEventEmitter`：

```javascript
const { agentEventEmitter } = require('./utils/AgentEventEmitter');

// 监听所有订单状态变更
agentEventEmitter.on('order_state_changed', (event) => {
  console.log('订单状态变更事件:', event.data);
  /*
  {
    orderId: 'ORDER-20250101-001',
    fromState: 'pending_review',
    toState: 'reviewing',
    fromStateLabel: '待审核',
    toStateLabel: '审核中',
    action: 'start_review',
    actionLabel: '开始审核',
    timestamp: '2025-01-01T10:00:00.000Z',
    context: { operator: 'admin-001' }
  }
  */
});

// 监听状态变更错误
agentEventEmitter.on('order_state_error', (event) => {
  console.error('订单状态机错误:', event.data);
});
```

## 实际使用场景

### 场景 1：订单审核流程

```javascript
async function approveOrder(orderId, operatorId) {
  const sm = createOrderStateMachine(orderId);
  
  // 从待审核 -> 审核中
  await sm.transition(OrderStates.REVIEWING, {
    operator: operatorId,
    reviewStartTime: new Date().toISOString()
  });
  
  // 审核逻辑...
  const approved = await performReview(orderId);
  
  if (approved) {
    // 审核通过 -> 已排程
    await sm.transition(OrderStates.SCHEDULED, {
      operator: operatorId,
      approvedAt: new Date().toISOString(),
      scheduledTime: calculatePrintTime(orderId)
    });
  } else {
    // 审核拒绝 -> 已取消
    await sm.transition(OrderStates.CANCELLED, {
      operator: operatorId,
      rejectedAt: new Date().toISOString(),
      cancelReason: '审核不通过'
    });
  }
}
```

### 场景 2：打印完成处理

```javascript
async function handlePrintComplete(orderId, printerId) {
  const sm = createOrderStateMachine(orderId);
  
  // 检查当前状态
  if (sm.getCurrentState() !== OrderStates.PRINTING) {
    throw new Error('订单不在打印中状态');
  }
  
  // 打印完成 -> 后处理
  await sm.transition(OrderStates.POST_PROCESSING, {
    printerId,
    printCompletedAt: new Date().toISOString(),
    operator: 'system'
  });
  
  // 触发后处理工作流
  await startPostProcessing(orderId);
}
```

### 场景 3：订单取消流程

```javascript
async function cancelOrder(orderId, reason, operatorId) {
  const sm = createOrderStateMachine(orderId);
  
  // 检查是否可以取消
  const actions = sm.getAvailableActions();
  const canCancel = actions.some(a => a.toState === OrderStates.CANCELLED);
  
  if (!canCancel) {
    throw new Error('当前状态不允许取消订单');
  }
  
  // 执行取消
  await sm.transition(OrderStates.CANCELLED, {
    cancelReason: reason,
    operator: operatorId,
    cancelledAt: new Date().toISOString()
  });
  
  // 触发退款流程（如果需要）
  if (shouldRefund(reason)) {
    await processRefund(orderId);
  }
}
```

## 测试脚本

创建测试文件 `test-state-machine.js`：

```javascript
const { createOrderStateMachine } = require('./states/OrderStateMachine');
const { OrderStates } = require('./constants/orderStates');

async function runTests() {
  console.log('=== 订单状态机测试 ===\n');
  
  // 测试 1：基本状态转换
  console.log('测试 1: 基本状态转换');
  const sm1 = createOrderStateMachine('TEST-001');
  console.log('初始状态:', sm1.getCurrentStateLabel());
  
  await sm1.transition(OrderStates.REVIEWING, { operator: 'test' });
  console.log('转换后状态:', sm1.getCurrentStateLabel());
  
  await sm1.transition(OrderStates.SCHEDULED, { operator: 'test' });
  console.log('再次转换后状态:', sm1.getCurrentStateLabel());
  console.log('✓ 测试 1 通过\n');
  
  // 测试 2：状态历史
  console.log('测试 2: 状态历史');
  const history = sm1.getHistory();
  console.log('历史记录数量:', history.length);
  console.log('历史状态:', history.map(h => h.state).join(' -> '));
  console.log('✓ 测试 2 通过\n');
  
  // 测试 3：无效转换
  console.log('测试 3: 无效转换处理');
  try {
    await sm1.transition(OrderStates.SHIPPED); // 不允许的跳跃
    console.log('✗ 应该抛出错误');
  } catch (error) {
    console.log('✓ 正确抛出错误:', error.code);
  }
  console.log();
  
  // 测试 4：可用操作
  console.log('测试 4: 获取可用操作');
  const sm2 = createOrderStateMachine('TEST-002');
  const actions = sm2.getAvailableActions();
  console.log('可用操作:', actions.map(a => a.label).join(', '));
  console.log('✓ 测试 4 通过\n');
  
  // 测试 5：状态机快照
  console.log('测试 5: 状态机快照');
  const snapshot = sm1.getSnapshot();
  console.log('快照:', JSON.stringify(snapshot, null, 2));
  console.log('✓ 测试 5 通过\n');
  
  console.log('=== 所有测试完成 ===');
}

runTests().catch(console.error);
```

运行测试：

```bash
node test-state-machine.js
```

## 文件结构

```
backend/src/
├── constants/
│   └── orderStates.js          # 状态常量定义
├── states/
│   ├── transitions.js          # 状态转换规则
│   ├── hooks.js                # 状态变更钩子
│   └── OrderStateMachine.js    # 状态机核心类
└── utils/
    └── AgentEventEmitter.js    # 事件发射器（已有）

backend/docs/
└── ORDER-STATE-MACHINE-GUIDE.md  # 本文档
```

## API 参考

### OrderStateMachine 类

#### 构造函数
- `new OrderStateMachine(orderId, initialState)` - 创建状态机实例

#### 方法
- `canTransition(toState)` - 检查是否可以转换到目标状态
- `getAvailableActions()` - 获取当前可执行的操作列表
- `transition(toState, context)` - 执行状态转换
- `getCurrentState()` - 获取当前状态值
- `getCurrentStateLabel()` - 获取当前状态中文标签
- `getHistory(limit)` - 获取状态历史
- `getPreviousState()` - 获取上一个状态
- `isTerminalState()` - 检查是否为终端状态
- `canContinue()` - 检查是否可以继续转换
- `updateMetadata(data)` - 更新元数据
- `getMetadata()` - 获取元数据
- `reset(newInitialState)` - 重置状态机
- `getSnapshot()` - 获取状态机完整快照

#### 事件
- `stateChanged` - 状态变更时触发
- `state:{stateName}` - 进入特定状态时触发
- `error` - 发生错误时触发

### 钩子函数

- `registerHook(hookType, state, callback)` - 注册钩子
- `unregisterHook(hookType, state, callback)` - 注销钩子

钩子类型：
- `onEnter` - 进入状态时触发
- `onExit` - 退出状态时触发
- `onTransition` - 状态转换时触发

## 最佳实践

1. **始终检查转换合法性**：在调用 `transition()` 前使用 `canTransition()` 检查
2. **提供完整的上下文信息**：在 `context` 中传入操作者、时间等审计信息
3. **监听错误事件**：始终监听 `error` 事件以捕获异常
4. **使用钩子处理副作用**：将通知、日志等副作用逻辑放在钩子中
5. **保留状态历史**：使用 `getHistory()` 进行审计和调试
6. **终端状态保护**：使用 `isTerminalState()` 检查是否可以继续操作

## 注意事项

- ⚠️ 状态机实例与订单 ID 绑定，一个订单对应一个状态机实例
- ⚠️ 终端状态（如 `REFUNDED`）无法转换到其他状态
- ⚠️ 钩子函数中的错误不会中断状态转换，但会被记录
- ⚠️ 状态变更会自动发射 AgentEventEmitter 事件，确保监听器正确处理
