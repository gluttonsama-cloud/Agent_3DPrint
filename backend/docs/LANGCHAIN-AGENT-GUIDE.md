# LangChain.js Agent 框架集成指南

> 3D 打印多 Agent 系统 - LangChain.js 框架集成文档

## 目录

1. [架构概述](#架构概述)
2. [安装与配置](#安装与配置)
3. [Agent 架构](#agent-架构)
4. [工具系统](#工具系统)
5. [Agent 注册中心](#agent-注册中心)
6. [事件系统](#事件系统)
7. [LLM 配置](#llm-配置)
8. [使用示例](#使用示例)
9. [最佳实践](#最佳实践)
10. [常见问题](#常见问题)

---

## 架构概述

本系统基于 LangChain.js 框架构建多 Agent 协作系统，用于 3D 打印订单的自动化处理和调度。

### 核心组件

```
┌─────────────────────────────────────────────────────┐
│                  Agent 注册中心                       │
│              (AgentRegistry)                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ 协调 Agent   │  │ 调度 Agent   │  │ 库存 Agent   │ │
│  │Coordinator  │  │ Scheduler   │  │ Inventory   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│         │                │                │         │
│         └────────────────┼────────────────┘         │
│                          │                          │
│              ┌───────────┴───────────┐             │
│              │     工具系统           │             │
│              │  (Tools System)       │             │
│              └───────────────────────┘             │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │           事件发射器 (EventEmitter)          │   │
│  └─────────────────────────────────────────────┘   │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │           LLM 配置 (LLM Config)              │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Agent 类型

1. **协调 Agent (Coordinator)**
   - 接收和处理订单
   - 调用调度 Agent 分配设备
   - 调用库存 Agent 检查材料
   - 做出最终决策（自动通过或转人工）

2. **调度 Agent (Scheduler)**
   - 根据设备类型匹配合适设备
   - 根据设备负载进行任务分配
   - 优化生产排程

3. **库存 Agent (Inventory)**
   - 检查材料库存状态
   - 计算材料消耗量
   - 预测库存趋势
   - 生成补货建议

---

## 安装与配置

### 1. 安装依赖

```bash
cd backend
npm install
```

已安装的 LangChain.js 相关依赖：
- `langchain` - LangChain.js 核心库
- `@langchain/core` - 核心抽象层
- `@langchain/openai` - OpenAI LLM 支持

### 2. 配置环境变量

在 `.env` 文件中配置 LLM 相关环境变量：

```bash
# LLM 配置
LLM_PROVIDER=openai          # LLM 提供商：openai, claude, local
LLM_API_KEY=your-api-key     # API 密钥
LLM_MODEL=gpt-3.5-turbo      # 模型名称
LLM_BASE_URL=                # 自定义 API 端点（可选，用于本地模型）
LLM_TIMEOUT=30000            # 连接超时（毫秒）
LLM_MAX_RETRIES=3            # 最大重试次数
LLM_TEMPERATURE=0.7          # 温度参数（0-1）
LLM_MAX_TOKENS=2048          # 最大 token 数
```

---

## Agent 架构

### BaseAgent 基类

所有 Agent 必须继承 `BaseAgent` 类，并实现必要的方法。

```javascript
const { BaseAgent, AgentState } = require('./agents/BaseAgent');

class CoordinatorAgent extends BaseAgent {
  constructor(config) {
    super({
      id: 'coordinator-001',
      name: '协调 Agent',
      description: '负责订单接收和决策',
      ...config
    });
  }

  // 注册自定义工具
  async registerTools() {
    // 注册订单处理相关工具
    this.registerTool('getPendingOrders', orderTools.getPendingOrders);
    this.registerTool('updateOrderStatus', orderTools.updateOrderStatus);
  }

  // 执行任务
  async execute(task) {
    console.log(`[${this.name}] 执行任务:`, task);
    
    // 获取待处理订单
    const orders = await this.callTool('getPendingOrders', { limit: 5 });
    
    // 处理每个订单
    for (const order of orders.orders) {
      // 调用调度 Agent
      // 调用库存 Agent
      // 做出决策
    }
    
    return { success: true };
  }
}
```

### Agent 生命周期

```javascript
// 1. 创建 Agent 实例
const agent = new CoordinatorAgent();

// 2. 初始化 Agent（加载 LLM、注册工具）
await agent.initialize();

// 3. 执行任务
const result = await agent.execute({ type: 'process_orders' });

// 4. 关闭 Agent（清理资源）
await agent.shutdown();
```

### Agent 状态

- `idle` - 空闲
- `initializing` - 初始化中
- `ready` - 就绪
- `busy` - 忙碌
- `error` - 错误
- `shutdown` - 已关闭

---

## 工具系统

### 工具结构

每个工具包含以下属性：

```javascript
{
  name: '工具名称',
  description: '工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      // 参数定义
    },
    required: ['必需参数']
  },
  execute: async (input) => {
    // 工具执行逻辑
    return result;
  }
}
```

### 工具分类

#### 订单工具 (orderTools)

| 工具名称 | 描述 |
|---------|------|
| `getOrderById` | 根据 ID 查询订单 |
| `getOrdersByStatus` | 根据状态查询订单列表 |
| `updateOrderStatus` | 更新订单状态 |
| `getPendingOrders` | 获取待处理订单 |
| `getUserOrderHistory` | 获取用户订单历史 |

#### 设备工具 (deviceTools)

| 工具名称 | 描述 |
|---------|------|
| `getDeviceById` | 根据 ID 查询设备 |
| `getAllDevices` | 查询所有设备 |
| `getAvailableDevices` | 查询可用设备 |
| `assignTaskToDevice` | 分配任务到设备 |
| `releaseDeviceTask` | 释放设备任务 |
| `updateDeviceStatus` | 更新设备状态 |

#### 库存工具 (materialTools)

| 工具名称 | 描述 |
|---------|------|
| `getMaterialById` | 根据 ID 查询材料 |
| `getAllMaterials` | 查询所有材料 |
| `checkMaterialStock` | 检查材料库存 |
| `updateMaterialStock` | 更新材料库存 |
| `getLowStockMaterials` | 查询低库存材料 |
| `generateReorderSuggestions` | 生成补货建议 |

### 使用工具

```javascript
// 通过 Agent 调用工具
const result = await agent.callTool('getPendingOrders', { limit: 5 });

// 直接调用工具
const { getPendingOrders } = require('./agents/tools/orderTools');
const result = await getPendingOrders.execute({ limit: 5 });
```

---

## Agent 注册中心

### 注册 Agent

```javascript
const { agentRegistry } = require('./agents/registry');
const { CoordinatorAgent } = require('./agents/CoordinatorAgent');

// 创建 Agent 实例
const coordinator = new CoordinatorAgent();

// 注册 Agent
agentRegistry.register(coordinator, {
  type: 'coordinator',
  version: '1.0.0'
});
```

### 管理 Agent

```javascript
// 获取 Agent 实例
const agent = agentRegistry.get('coordinator-001');

// 列出所有 Agent
const allAgents = agentRegistry.list();
const availableAgents = agentRegistry.getAvailableAgents();

// 获取统计信息
const stats = agentRegistry.getStats();
console.log(stats);
// { total: 3, byState: { ready: 2, busy: 1 }, available: 2, busy: 1 }

// 移除 Agent
await agentRegistry.remove('coordinator-001');

// 关闭所有 Agent
await agentRegistry.shutdownAll();
```

---

## 事件系统

### 事件类型

| 事件类型 | 描述 |
|---------|------|
| `decision_made` | Agent 做出决策 |
| `task_assigned` | 任务分配给 Agent |
| `inventory_checked` | 库存检查完成 |
| `order_processing_started` | 订单处理开始 |
| `order_processing_completed` | 订单处理完成 |
| `scheduling_started` | 设备调度开始 |
| `scheduling_completed` | 设备调度完成 |
| `agent_error` | Agent 错误 |
| `agent_state_changed` | Agent 状态变化 |
| `tool_call_started` | 工具调用开始 |
| `tool_call_completed` | 工具调用完成 |

### 监听事件

```javascript
const { agentEventEmitter, AgentEventType } = require('./utils/AgentEventEmitter');

// 监听特定事件
agentEventEmitter.on(AgentEventType.DECISION_MADE, (event) => {
  console.log('决策事件:', event.data);
});

// 监听所有 Agent 事件
agentEventEmitter.on('agent_event', (event) => {
  console.log('Agent 事件:', event.type, event.data);
});

// 获取事件历史
const history = agentEventEmitter.getHistory(50);
const decisionHistory = agentEventEmitter.getHistoryByType(
  AgentEventType.DECISION_MADE,
  10
);
```

### SSE 推送集成

```javascript
// 在 Express 路由中
app.get('/api/agent/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 发送事件
  const handler = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  agentEventEmitter.on('agent_event', handler);

  req.on('close', () => {
    agentEventEmitter.off('agent_event', handler);
  });
});
```

---

## LLM 配置

### 配置选项

```javascript
const { createLLM, validateConfig, getConfigInfo } = require('./config/llm');

// 验证配置
const validation = validateConfig();
if (!validation.valid) {
  console.error('缺少配置:', validation.missing);
}

// 获取配置信息
const configInfo = getConfigInfo();
console.log(configInfo);

// 创建 LLM 实例
const llm = createLLM({
  model: 'gpt-4',
  temperature: 0.5
});
```

### 支持多种 LLM

```javascript
const { LLMProvider } = require('./config/llm');

// OpenAI
process.env.LLM_PROVIDER = LLMProvider.OPENAI;
process.env.LLM_MODEL = 'gpt-3.5-turbo';

// Claude（需要安装 @langchain/anthropic）
process.env.LLM_PROVIDER = LLMProvider.CLAUDE;
process.env.LLM_MODEL = 'claude-3-sonnet-20240229';

// 本地模型（如 Ollama）
process.env.LLM_PROVIDER = LLMProvider.LOCAL;
process.env.LLM_MODEL = 'llama2';
process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
```

---

## 使用示例

### 完整示例：创建协调 Agent

```javascript
const { BaseAgent, AgentState } = require('./agents/BaseAgent');
const { agentRegistry } = require('./agents/registry');
const { orderTools, deviceTools, materialTools } = require('./agents/tools');
const { agentEventEmitter } = require('./utils/AgentEventEmitter');

class CoordinatorAgent extends BaseAgent {
  constructor() {
    super({
      id: 'coordinator-001',
      name: '协调 Agent',
      description: '负责订单接收和最终决策'
    });
  }

  async registerTools() {
    // 注册订单工具
    this.registerTool('getPendingOrders', orderTools.getPendingOrders);
    this.registerTool('updateOrderStatus', orderTools.updateOrderStatus);
    
    // 注册设备工具
    this.registerTool('getAvailableDevices', deviceTools.getAvailableDevices);
    
    // 注册库存工具
    this.registerTool('checkMaterialStock', materialTools.checkMaterialStock);
  }

  async execute(task) {
    console.log(`[${this.name}] 开始处理任务`);
    
    // 获取待处理订单
    const ordersResult = await this.callTool('getPendingOrders', { limit: 5 });
    
    for (const order of ordersResult.orders) {
      // 检查库存
      const inventoryResult = await this.callTool('checkMaterialStock', {
        materialId: 'material-001',
        requiredAmount: 100
      });
      
      // 获取可用设备
      const devicesResult = await this.callTool('getAvailableDevices', {
        type: 'sla'
      });
      
      // 做出决策
      const decision = {
        orderId: order.id,
        type: inventoryResult.check.isSufficient ? 'auto_approve' : 'manual_review',
        reasoning: inventoryResult.check.isSufficient 
          ? '库存充足，自动通过' 
          : '库存不足，转人工审核'
      };
      
      // 发射决策事件
      agentEventEmitter.emitDecision(decision);
      
      // 更新订单状态
      await this.callTool('updateOrderStatus', {
        orderId: order.id,
        status: decision.type === 'auto_approve' ? 'processing' : 'pending_review'
      });
    }
    
    return { success: true, processed: ordersResult.count };
  }
}

// 启动 Agent
async function main() {
  const coordinator = new CoordinatorAgent();
  
  // 注册到注册中心
  agentRegistry.register(coordinator);
  
  // 初始化
  await coordinator.initialize();
  
  // 执行任务
  const result = await coordinator.execute({ type: 'process_orders' });
  console.log('任务完成:', result);
  
  // 保持运行
  // await coordinator.shutdown();
}

main().catch(console.error);
```

---

## 最佳实践

### 1. Agent 设计

- **单一职责**：每个 Agent 只负责一个明确的业务领域
- **工具最小化**：只注册必要的工具，保持 Agent 轻量
- **错误处理**：所有工具调用都应该有错误处理
- **状态管理**：正确管理 Agent 状态，避免状态混乱

### 2. 工具开发

- **输入验证**：在工具执行前验证输入参数
- **错误信息**：返回清晰的错误信息，方便调试
- **幂等性**：尽量保证工具可重复调用
- **日志记录**：记录关键操作日志

### 3. 事件使用

- **事件命名**：使用语义清晰的事件名称
- **数据最小化**：事件数据只包含必要信息
- **异步处理**：事件处理应该是异步非阻塞的
- **历史清理**：定期清理事件历史，避免内存泄漏

### 4. LLM 调用

- **超时设置**：设置合理的超时时间
- **重试机制**：实现指数退避重试
- **Token 限制**：注意输入输出的 Token 限制
- **成本控制**：选择合适的模型控制成本

---

## 常见问题

### Q: Agent 初始化失败怎么办？

A: 检查以下几点：
1. LLM 配置是否正确（API 密钥、模型名称）
2. 网络连接是否正常
3. 工具依赖的数据库/服务是否可用

```javascript
try {
  await agent.initialize();
} catch (error) {
  console.error('初始化失败:', error.message);
  // 检查 LLM 配置
  const { validateConfig } = require('./config/llm');
  console.log('配置验证:', validateConfig());
}
```

### Q: 如何调试 Agent？

A: 使用以下方法：
1. 启用详细日志
2. 监听事件系统中的所有事件
3. 使用测试脚本验证工具

```javascript
// 监听所有事件
agentEventEmitter.on('agent_event', (event) => {
  console.log('[DEBUG] 事件:', event.type, JSON.stringify(event.data, null, 2));
});
```

### Q: 如何添加自定义 Agent？

A: 继承 BaseAgent 并实现必要方法：

```javascript
const { BaseAgent } = require('./agents/BaseAgent');

class CustomAgent extends BaseAgent {
  async registerTools() {
    // 注册自定义工具
  }

  async execute(task) {
    // 实现业务逻辑
  }
}
```

### Q: Agent 之间如何通信？

A: 通过事件系统进行通信：

```javascript
// Agent A 发射事件
agentEventEmitter.emitDecision({ agentId: 'A', type: 'scheduling_complete' });

// Agent B 监听事件
agentEventEmitter.on(AgentEventType.DECISION_MADE, (event) => {
  if (event.data.agentId === 'A') {
    // 处理 Agent A 的决策
  }
});
```

---

## 文件结构

```
backend/src/
├── agents/
│   ├── BaseAgent.js           # Agent 基类
│   ├── registry.js            # Agent 注册中心
│   └── tools/
│       ├── index.js           # 工具导出
│       ├── orderTools.js      # 订单工具
│       ├── deviceTools.js     # 设备工具
│       └── materialTools.js   # 库存工具
├── config/
│   └── llm.js                 # LLM 配置
└── utils/
    └── AgentEventEmitter.js   # 事件发射器
```

---

## 更新日志

- **2024-03-03**: 初始版本，包含基础 Agent 框架、工具系统、事件系统
