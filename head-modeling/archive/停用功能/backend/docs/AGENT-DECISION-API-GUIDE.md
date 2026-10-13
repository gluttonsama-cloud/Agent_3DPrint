# Agent 决策 API 使用指南

> 版本：v1.0.0
> 最后更新：2026-03-04

## 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [API 端点](#api-端点)
- [Agent 类型说明](#agent-类型说明)
- [决策类型说明](#决策类型说明)
- [请求/响应示例](#请求响应示例)
- [错误码说明](#错误码说明)
- [最佳实践](#最佳实践)

## 概述

Agent 决策 API 提供了一套完整的接口，用于触发多 Agent 系统的决策过程、查询决策历史、获取决策解释等功能。

### 核心功能

- **触发 Agent 决策**：外部触发 Coordinator、Scheduler、Inventory 三种 Agent 的决策过程
- **查询决策历史**：按订单、按 Agent、按时间范围等多种方式查询决策记录
- **获取决策解释**：查看决策的详细解释、替代方案、规则匹配情况
- **低置信度告警**：查询低置信度决策，便于人工审核
- **统计分析**：获取决策统计信息，分析 Agent 性能

### 技术架构

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Client    │────▶│  AgentDecision API   │────▶│  AgentRegistry  │
└─────────────┘     └──────────────────────┘     └─────────────────┘
                           │                            │
                           ▼                            ▼
                    ┌─────────────────┐         ┌──────────────┐
                    │ DecisionLogSvc  │         │  Agents      │
                    └─────────────────┘         │ - Coordinator│
                                                │ - Scheduler  │
                                                │ - Inventory  │
                                                └──────────────┘
```

## 快速开始

### 1. 确保服务已启动

```bash
cd backend
npm install
npm run dev
```

### 2. 验证服务健康状态

```bash
curl http://localhost:3000/health
```

### 3. 测试 Agent 决策 API

```bash
# 触发协调 Agent 审核订单
curl -X POST http://localhost:3000/api/agent-decisions/decide \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "coordinator",
    "action": "review_order",
    "data": {
      "orderId": "507f1f77bcf86cd799439011"
    }
  }'
```

## API 端点

### 基础 URL

```
生产环境：https://your-domain.com/api/agent-decisions
开发环境：http://localhost:3000/api/agent-decisions
```

### 端点列表

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| POST | `/decide` | 触发 Agent 决策 | 否 |
| GET | `/order/:orderId` | 查询订单的决策历史 | 否 |
| GET | `/agent/:agentId` | 查询特定 Agent 的决策 | 否 |
| GET | `/:decisionId` | 查询决策详情 | 否 |
| GET | `/:decisionId/explanation` | 获取决策解释 | 否 |
| GET | `/low-confidence` | 获取低置信度决策 | 否 |
| GET | `/stats` | 获取决策统计信息 | 否 |
| POST | `/batch-record` | 批量记录决策 | 否 |
| GET | `/coordinator/status` | 获取协调 Agent 状态 | 否 |
| POST | `/coordinator/review` | 触发协调 Agent 审核订单 | 否 |
| POST | `/scheduler/allocate` | 触发调度 Agent 分配设备 | 否 |
| POST | `/inventory/check` | 触发库存 Agent 检查库存 | 否 |

---

## API 详细文档

### 1. 触发 Agent 决策

**端点**: `POST /api/agent-decisions/decide`

**描述**: 触发指定 Agent 执行决策过程

**请求体**:

```json
{
  "agentType": "coordinator",
  "action": "review_order",
  "data": {
    "orderId": "507f1f77bcf86cd799439011",
    "context": {}
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| agentType | string | 是 | Agent 类型：coordinator/scheduler/inventory |
| action | string | 是 | 决策动作：review_order/schedule_device/check_inventory 等 |
| data | object | 是 | 决策数据，包含 orderId 等参数 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "decisionId": "dec_1709553600000_507f1f77bcf86cd799439011",
    "agentId": "coordinator_agent",
    "decisionType": "scheduling",
    "decisionResult": "approved",
    "confidence": 0.95,
    "rationale": "所有条件满足，订单可自动批准",
    "alternatives": [],
    "rulesMatched": ["rule_001", "rule_003"],
    "timestamp": "2026-03-04T09:00:00.000Z"
  }
}
```

---

### 2. 查询订单的决策历史

**端点**: `GET /api/agent-decisions/order/:orderId`

**描述**: 查询指定订单的所有决策历史记录

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| orderId | string | 是 | 订单 ID（MongoDB ObjectId） |

**查询参数**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| limit | number | 否 | 50 | 返回数量限制 |
| sort | string | 否 | desc | 排序方式：asc/desc |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "orderId": "507f1f77bcf86cd799439011",
    "decisions": [
      {
        "_id": "dec_001",
        "agentId": "coordinator_agent",
        "decisionType": "scheduling",
        "decisionResult": "approved",
        "confidence": 0.95,
        "rationale": "所有条件满足",
        "createdAt": "2026-03-04T09:00:00.000Z",
        "updatedAt": "2026-03-04T09:00:00.000Z"
      },
      {
        "_id": "dec_002",
        "agentId": "scheduler_agent",
        "decisionType": "device_selection",
        "decisionResult": "PRINTER-001",
        "confidence": 0.88,
        "rationale": "设备评分最高",
        "createdAt": "2026-03-04T09:01:00.000Z",
        "updatedAt": "2026-03-04T09:01:00.000Z"
      }
    ]
  }
}
```

---

### 3. 查询特定 Agent 的决策

**端点**: `GET /api/agent-decisions/agent/:agentId`

**描述**: 查询指定 Agent 的决策记录

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| agentId | string | 是 | Agent ID |

**查询参数**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| decisionType | string | 否 | - | 决策类型过滤 |
| startTime | string | 否 | - | 开始时间（ISO8601） |
| endTime | string | 否 | - | 结束时间（ISO8601） |
| limit | number | 否 | 20 | 返回数量限制 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "agentId": "scheduler_agent",
    "count": 15,
    "decisions": [
      {
        "_id": "dec_sched_001",
        "orderId": "507f1f77bcf86cd799439011",
        "decisionType": "device_selection",
        "decisionResult": "PRINTER-001",
        "confidence": 0.88,
        "rationale": "设备评分最高",
        "createdAt": "2026-03-04T09:01:00.000Z"
      }
    ]
  }
}
```

---

### 4. 查询决策详情

**端点**: `GET /api/agent-decisions/:decisionId`

**描述**: 查询单个决策的完整详情

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| decisionId | string | 是 | 决策 ID（MongoDB ObjectId） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "_id": "dec_001",
    "orderId": {
      "_id": "507f1f77bcf86cd799439011",
      "orderNumber": "ORD-20260304-001",
      "status": "scheduled"
    },
    "agentId": "coordinator_agent",
    "decisionType": "scheduling",
    "decisionResult": "approved",
    "confidence": 0.95,
    "inputSnapshot": {
      "orderId": "507f1f77bcf86cd799439011",
      "status": "pending",
      "itemCount": 2,
      "totalPrice": 299.00
    },
    "rationale": "所有条件满足，订单可自动批准",
    "alternatives": [
      {
        "option": "manual_review",
        "score": 0.6,
        "reason": "人工审核更保守"
      }
    ],
    "rulesMatched": ["rule_001", "rule_003"],
    "impact": {
      "estimatedTime": null,
      "estimatedCost": null,
      "qualityScore": 0.95
    },
    "createdAt": "2026-03-04T09:00:00.000Z",
    "updatedAt": "2026-03-04T09:00:00.000Z"
  }
}
```

---

### 5. 获取决策解释

**端点**: `GET /api/agent-decisions/:decisionId/explanation`

**描述**: 获取决策的详细解释，包括输入快照、规则匹配、替代方案等

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| decisionId | string | 是 | 决策 ID（MongoDB ObjectId） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "decisionId": "dec_001",
    "inputSnapshot": {
      "orderId": "507f1f77bcf86cd799439011",
      "status": "pending",
      "itemCount": 2
    },
    "rulesMatched": [
      {
        "ruleId": "rule_001",
        "ruleName": "自动批准规则",
        "description": "库存充足且设备可用时自动批准"
      },
      {
        "ruleId": "rule_003",
        "ruleName": "高置信度规则",
        "description": "置信度 > 0.9 时采用自动决策"
      }
    ],
    "alternatives": [
      {
        "option": "manual_review",
        "score": 0.6,
        "reason": "人工审核更保守，但耗时更长"
      }
    ],
    "rationale": "所有条件满足，订单可自动批准",
    "confidence": 0.95,
    "decisionType": "scheduling",
    "decisionResult": "approved",
    "impact": {
      "estimatedTime": null,
      "estimatedCost": null,
      "qualityScore": 0.95
    },
    "createdAt": "2026-03-04T09:00:00.000Z"
  }
}
```

---

### 6. 获取低置信度决策

**端点**: `GET /api/agent-decisions/low-confidence`

**描述**: 查询置信度低于阈值的决策，用于人工审核

**查询参数**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| threshold | number | 否 | 0.5 | 置信度阈值 |
| limit | number | 否 | 50 | 返回数量限制 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "threshold": 0.5,
    "count": 3,
    "decisions": [
      {
        "_id": "dec_003",
        "orderId": "507f1f77bcf86cd799439011",
        "agentId": "scheduler_agent",
        "decisionType": "device_selection",
        "decisionResult": "PRINTER-002",
        "confidence": 0.42,
        "rationale": "多个设备评分相近，选择困难",
        "createdAt": "2026-03-04T10:00:00.000Z"
      }
    ]
  }
}
```

---

### 7. 获取决策统计信息

**端点**: `GET /api/agent-decisions/stats`

**描述**: 获取决策的统计信息，包括总数、按类型分布、按 Agent 分布等

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startTime | string | 否 | 开始时间（ISO8601） |
| endTime | string | 否 | 结束时间（ISO8601） |
| agentId | string | 否 | Agent ID 过滤 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "total": 150,
    "byType": [
      {
        "type": "scheduling",
        "count": 80,
        "avgConfidence": 0.92
      },
      {
        "type": "device_selection",
        "count": 50,
        "avgConfidence": 0.85
      },
      {
        "type": "material_selection",
        "count": 20,
        "avgConfidence": 0.88
      }
    ],
    "byAgent": [
      {
        "agentId": "coordinator_agent",
        "count": 80,
        "avgConfidence": 0.92
      },
      {
        "agentId": "scheduler_agent",
        "count": 50,
        "avgConfidence": 0.85
      },
      {
        "agentId": "inventory_agent",
        "count": 20,
        "avgConfidence": 0.88
      }
    ],
    "confidenceDistribution": [
      {
        "level": "high (0.8-1.0)",
        "count": 120
      },
      {
        "level": "medium (0.5-0.8)",
        "count": 25
      },
      {
        "level": "low (0-0.5)",
        "count": 5
      }
    ],
    "avgConfidence": 0.89,
    "lowConfidenceCount": 5,
    "lowConfidenceRate": 0.033
  }
}
```

---

## Agent 类型说明

### 1. Coordinator（协调 Agent）

**Agent ID**: `coordinator_agent`

**职责**:
- 接收订单并协调整个处理流程
- 调用其他 Agent（Scheduler、Inventory）
- 做出最终决策（自动批准/人工审核）

**支持的动作**:
- `review_order`: 审核订单
- `process_order`: 处理完整订单流程

**决策类型**:
- `scheduling`: 调度决策

---

### 2. Scheduler（调度 Agent）

**Agent ID**: `scheduler_agent`

**职责**:
- 为订单分配最佳的 3D 打印设备
- 考虑设备负载、打印时间、质量、成本等因素
- 应用调度规则进行智能分配

**支持的动作**:
- `schedule_device`: 分配设备

**决策类型**:
- `device_selection`: 设备选择决策

**分配策略**:
- `fastest`: 最快完成时间优先
- `lowest_cost`: 最低成本优先
- `best_quality`: 最佳质量优先
- `balanced_load`: 负载均衡优先
- `optimal`: 综合最优（默认）

---

### 3. Inventory（库存 Agent）

**Agent ID**: `inventory_agent`

**职责**:
- 检查材料库存状态
- 预测材料消耗
- 生成补货建议
- 检查材料兼容性

**支持的动作**:
- `check_inventory`: 检查库存

**决策类型**:
- `material_selection`: 材料选择决策
- `quality_check`: 库存状态检查

---

## 决策类型说明

| 决策类型 | 说明 | 相关 Agent |
|---------|------|-----------|
| `device_selection` | 设备选择决策 | Scheduler |
| `material_selection` | 材料选择决策 | Inventory |
| `print_parameter` | 打印参数决策 | - |
| `quality_check` | 质量检查决策 | Inventory |
| `error_recovery` | 错误恢复决策 | - |
| `scheduling` | 调度决策 | Coordinator |

---

## 错误码说明

### HTTP 状态码

| 状态码 | 说明 |
|-------|------|
| 200 | 请求成功 |
| 201 | 资源创建成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 业务错误码

| 错误 | 状态码 | 说明 |
|------|--------|------|
| ValidationError | 400 | 请求参数验证失败 |
| NotFoundError | 404 | 资源不存在 |
| AgentNotReadyError | 503 | Agent 未就绪 |

### 错误响应格式

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "orderId 是必填字段"
}
```

---

## 请求/响应示例

### 示例 1：触发协调 Agent 审核订单

**请求**:

```bash
curl -X POST http://localhost:3000/api/agent-decisions/coordinator/review \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "507f1f77bcf86cd799439011"
  }'
```

**响应**:

```json
{
  "success": true,
  "data": {
    "decisionId": "dec_1709553600000_507f1f77bcf86cd799439011",
    "agentId": "coordinator_agent",
    "decisionType": "scheduling",
    "decisionResult": "approved",
    "confidence": 0.95,
    "rationale": "所有条件满足，订单可自动批准",
    "timestamp": "2026-03-04T09:00:00.000Z"
  }
}
```

---

### 示例 2：触发调度 Agent 分配设备

**请求**:

```bash
curl -X POST http://localhost:3000/api/agent-decisions/scheduler/allocate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "507f1f77bcf86cd799439011",
    "strategy": "optimal"
  }'
```

**响应**:

```json
{
  "success": true,
  "data": {
    "decisionId": "dec_sched_1709553660000_507f1f77bcf86cd799439011",
    "agentId": "scheduler_agent",
    "decisionType": "device_selection",
    "decisionResult": "PRINTER-001",
    "confidence": 0.88,
    "rationale": "设备评分最高，PRINTER-001 为最优选择",
    "alternatives": [
      {
        "option": "PRINTER-002",
        "score": 0.82,
        "reason": "负载较低，但质量评分略低"
      },
      {
        "option": "PRINTER-003",
        "score": 0.75,
        "reason": "成本最低，但预计完成时间较长"
      }
    ],
    "impact": {
      "estimatedTime": "2026-03-04T15:00:00.000Z",
      "estimatedCost": null,
      "qualityScore": 0.88
    },
    "timestamp": "2026-03-04T09:01:00.000Z"
  }
}
```

---

### 示例 3：触发库存 Agent 检查库存

**请求**:

```bash
curl -X POST http://localhost:3000/api/agent-decisions/inventory/check \
  -H "Content-Type: application/json" \
  -d '{
    "materialId": "507f191e810c19729de860ea",
    "requiredAmount": 500
  }'
```

**响应**:

```json
{
  "success": true,
  "data": {
    "decisionId": "dec_inv_1709553720000_507f191e810c19729de860ea",
    "agentId": "inventory_agent",
    "decisionType": "material_selection",
    "decisionResult": "SUFFICIENT",
    "confidence": 1.0,
    "rationale": "库存充足，当前库存：1000 克",
    "timestamp": "2026-03-04T09:02:00.000Z"
  }
}
```

---

### 示例 4：查询订单决策历史

**请求**:

```bash
curl http://localhost:3000/api/agent-decisions/order/507f1f77bcf86cd799439011
```

**响应**:

```json
{
  "success": true,
  "data": {
    "orderId": "507f1f77bcf86cd799439011",
    "decisions": [
      {
        "_id": "dec_001",
        "agentId": "coordinator_agent",
        "decisionType": "scheduling",
        "decisionResult": "approved",
        "confidence": 0.95,
        "rationale": "所有条件满足",
        "createdAt": "2026-03-04T09:00:00.000Z"
      },
      {
        "_id": "dec_002",
        "agentId": "scheduler_agent",
        "decisionType": "device_selection",
        "decisionResult": "PRINTER-001",
        "confidence": 0.88,
        "rationale": "设备评分最高",
        "createdAt": "2026-03-04T09:01:00.000Z"
      },
      {
        "_id": "dec_003",
        "agentId": "inventory_agent",
        "decisionType": "material_selection",
        "decisionResult": "SUFFICIENT",
        "confidence": 1.0,
        "rationale": "库存充足",
        "createdAt": "2026-03-04T09:02:00.000Z"
      }
    ]
  }
}
```

---

### 示例 5：获取低置信度决策

**请求**:

```bash
curl "http://localhost:3000/api/agent-decisions/low-confidence?threshold=0.5&limit=10"
```

**响应**:

```json
{
  "success": true,
  "data": {
    "threshold": 0.5,
    "count": 2,
    "decisions": [
      {
        "_id": "dec_010",
        "orderId": "507f1f77bcf86cd799439022",
        "agentId": "scheduler_agent",
        "decisionType": "device_selection",
        "decisionResult": "PRINTER-002",
        "confidence": 0.42,
        "rationale": "多个设备评分相近，选择困难",
        "createdAt": "2026-03-04T10:00:00.000Z"
      },
      {
        "_id": "dec_011",
        "orderId": "507f1f77bcf86cd799439033",
        "agentId": "coordinator_agent",
        "decisionType": "scheduling",
        "decisionResult": "manual_review",
        "confidence": 0.48,
        "rationale": "订单金额较大，建议人工审核",
        "createdAt": "2026-03-04T10:05:00.000Z"
      }
    ]
  }
}
```

---

## 最佳实践

### 1. 决策追溯

建议在关键业务流程中记录决策 ID，便于后续追溯：

```javascript
// 订单处理完成后，保存决策 ID
const order = await Order.findById(orderId);
order.decisionHistory = [
  ...(order.decisionHistory || []),
  {
    decisionId: result.decisionId,
    agentId: result.agentId,
    timestamp: new Date()
  }
];
await order.save();
```

### 2. 低置信度告警处理

定期检查低置信度决策，进行人工审核：

```javascript
// 每小时检查一次低置信度决策
async function checkLowConfidenceDecisions() {
  const response = await fetch(
    'http://localhost:3000/api/agent-decisions/low-confidence?threshold=0.5&limit=50'
  );
  const data = await response.json();
  
  if (data.data.count > 0) {
    console.warn(`发现 ${data.data.count} 个低置信度决策，需要人工审核`);
    // 发送告警通知
  }
}
```

### 3. 批量记录决策

对于离线处理的决策，可以使用批量记录接口：

```javascript
const decisions = [
  {
    agentId: 'scheduler_agent',
    decisionType: 'device_selection',
    decisionResult: 'PRINTER-001',
    confidence: 0.88,
    rationale: '设备评分最高',
    orderId: '507f1f77bcf86cd799439011'
  },
  // ... 更多决策
];

const response = await fetch(
  'http://localhost:3000/api/agent-decisions/batch-record',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decisions })
  }
);
```

### 4. 决策分析

利用统计接口分析 Agent 性能，优化决策规则：

```javascript
// 获取上周的决策统计
const stats = await fetch(
  'http://localhost:3000/api/agent-decisions/stats?' +
  'startTime=2026-02-26T00:00:00.000Z&' +
  'endTime=2026-03-04T23:59:59.999Z'
).then(res => res.json());

console.log('平均置信度:', stats.data.avgConfidence);
console.log('低置信度比例:', stats.data.lowConfidenceRate);
```

### 5. 错误处理

 always handle errors gracefully:

```javascript
try {
  const response = await fetch(
    'http://localhost:3000/api/agent-decisions/decide',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentType: 'coordinator',
        action: 'review_order',
        data: { orderId: '507f1f77bcf86cd799439011' }
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const result = await response.json();
  console.log('决策成功:', result.data);
} catch (error) {
  console.error('决策失败:', error.message);
  // 降级处理：转人工审核
}
```

---

## 相关文档

- [决策日志服务文档](./DECISION-LOG-SERVICE.md)
- [Agent 架构文档](./AGENT-ARCHITECTURE.md)
- [多 Agent 系统设计](./MULTI-AGENT-SYSTEM.md)

## 更新日志

### v1.0.0 (2026-03-04)
- 初始版本发布
- 支持 Coordinator、Scheduler、Inventory 三种 Agent
- 提供决策触发、查询、解释等完整 API
- 集成 DecisionLogService 决策日志服务
