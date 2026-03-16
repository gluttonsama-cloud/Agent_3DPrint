# 调度 Agent (Scheduler Agent) 使用指南

## 目录

1. [概述](#概述)
2. [架构图](#架构图)
3. [设备分配算法](#设备分配算法)
4. [评分公式详解](#评分公式详解)
5. [分配策略对比](#分配策略对比)
6. [API 使用说明](#api 使用说明)
7. [配置选项](#配置选项)
8. [最佳实践](#最佳实践)

---

## 概述

调度 Agent（Scheduler Agent）是多 Agent 系统中负责 3D 打印设备智能分配的核心组件。它根据订单需求、设备类型、设备负载、预计时间等多个维度进行综合评估，为每个订单分配最合适的 3D 打印设备。

### 核心功能

- **智能设备分配**：基于多维度评分算法选择最优设备
- **多策略支持**：支持最快完成、最低成本、最优质量、负载均衡等多种分配策略
- **调度规则引擎**：支持紧急订单插队、设备维护避让、材料批量等规则
- **批量分配**：支持为多个订单同时分配设备
- **可追溯性**：记录每次分配的详细评分和决策理由

### 技术特性

- 加权评分算法
- 可配置的权重系统
- 规则引擎支持
- 实时负载计算
- 预计时间估算

---

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Coordinator Agent                       │
│                    (协调 Agent - 调用方)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ 发送调度请求
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Scheduler Agent                         │
│                    (调度 Agent - 核心)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                调度任务执行器                         │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                      │                             │
│         ▼                      ▼                             │
│  ┌─────────────┐        ┌─────────────┐                     │
│  │ 分配算法    │        │ 规则管理器  │                     │
│  │ Algorithm   │        │ RuleManager │                     │
│  └─────────────┘        └─────────────┘                     │
│         │                      │                             │
│         └──────────┬───────────┘                             │
│                    ▼                                         │
│           ┌────────────────┐                                 │
│           │  设备评分引擎  │                                 │
│           │ Score Engine   │                                 │
│           └────────────────┘                                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ 查询/更新
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Device Model (MongoDB)                    │
│                  (设备数据模型 - 状态/负载)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 设备分配算法

### 分配流程

```
1. 接收调度请求
   │
   ▼
2. 获取订单详情
   │
   ▼
3. 获取可用设备列表
   │
   ▼
4. 筛选兼容设备
   ├── 设备类型匹配
   ├── 材料兼容性检查
   └── 设备状态检查
   │
   ▼
5. 应用调度规则
   ├── 紧急订单规则
   ├── 设备维护规则
   ├── 材料批量规则
   └── 负载均衡规则
   │
   ▼
6. 计算设备评分
   ├── 负载评分
   ├── 时间评分
   ├── 质量评分
   └── 成本评分
   │
   ▼
7. 根据策略排序
   │
   ▼
8. 生成推荐结果
   ├── 推荐设备
   ├── 备选设备
   └── 分配理由
   │
   ▼
9. 更新设备状态
   │
   ▼
10. 返回分配结果
```

### 算法伪代码

```javascript
async function allocateDevice(order) {
  // 1. 获取所有可用设备
  const devices = await Device.find({ 
    status: { $nin: ['maintenance', 'offline'] }
  });
  
  // 2. 筛选兼容设备
  const compatible = devices.filter(d => 
    d.type === order.deviceType &&
    d.supportedMaterials.includes(order.material)
  );
  
  // 3. 应用调度规则
  const ruleAdjustments = await ruleManager.applyAllRules({
    order,
    devices: compatible
  });
  
  // 4. 计算每个设备的评分
  const scored = await Promise.all(
    compatible.map(async device => {
      const score = await calculateScore(device, order);
      const estimatedTime = await calculateTime(device, order);
      return { device, score, estimatedTime };
    })
  );
  
  // 5. 应用规则调整
  scored.forEach(item => {
    const deviceId = item.device._id.toString();
    if (ruleAdjustments.devicePenalties[deviceId]) {
      item.score -= ruleAdjustments.devicePenalties[deviceId];
    }
    if (ruleAdjustments.deviceBonuses[deviceId]) {
      item.score += ruleAdjustments.deviceBonuses[deviceId];
    }
  });
  
  // 6. 按策略排序
  scored.sort((a, b) => b.score - a.score);
  
  // 7. 返回最佳设备
  return {
    recommendedDevice: scored[0].device,
    alternativeDevices: scored.slice(1, 4),
    rationale: generateRationale(scored[0])
  };
}
```

---

## 评分公式详解

### 综合评分公式

```
总分 = w1 × 负载分 + w2 × 时间分 + w3 × 质量分 + w4 × 成本分
```

### 默认权重

| 评分项 | 权重 | 说明 |
|--------|------|------|
| 负载分 (w1) | 0.30 | 设备当前负载越低，分数越高 |
| 时间分 (w2) | 0.30 | 预计完成时间越早，分数越高 |
| 质量分 (w3) | 0.25 | 设备精度越高，分数越高 |
| 成本分 (w4) | 0.15 | 运营成本越低，分数越高 |

### 各项评分计算

#### 1. 负载评分 (Load Score)

```javascript
负载分 = 1 - (当前负载 / 最大负载)

// 示例：
// 设备当前负载 30%，最大负载 100%
负载分 = 1 - (30 / 100) = 0.7
```

**说明**：负载越低，分数越高。空载设备得分为 1，满载设备得分为 0。

#### 2. 时间评分 (Time Score)

```javascript
时间分 = 1 - (预计时间 / 最大可接受时间)

// 示例：
// 预计打印时间 60 分钟，最大可接受时间 480 分钟 (8 小时)
时间分 = 1 - (60 / 480) = 0.875
```

**说明**：时间越短，分数越高。立即完成得分为 1，超过最大时间得分为 0。

#### 3. 质量评分 (Quality Score)

```javascript
// 基于设备分辨率估算
质量分 = 1 - ((分辨率值 - 0.05) / 0.45)

// 示例：
// 设备分辨率 0.1mm
质量分 = 1 - ((0.1 - 0.05) / 0.45) = 0.89
```

**说明**：分辨率值越小（精度越高），分数越高。0.05mm 得分为 1，0.5mm 得分为 0。

#### 4. 成本评分 (Cost Score)

```javascript
成本分 = 1 - (每小时成本 / 最大可接受成本)

// 示例：
// 每小时成本 100 元，最大可接受成本 500 元
成本分 = 1 - (100 / 500) = 0.8
```

**说明**：成本越低，分数越高。免费得分为 1，超过最大成本得分为 0。

---

## 分配策略对比

### 策略类型

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **optimal** (综合最优) | 默认策略，加权评分最高 | 大多数场景 |
| **fastest** (最快完成) | 选择预计完成时间最早的设备 | 紧急订单 |
| **lowest_cost** (最低成本) | 选择成本最低的设备 | 预算敏感订单 |
| **best_quality** (最优质量) | 选择精度最高的设备 | 高细节要求订单 |
| **balanced_load** (负载均衡) | 选择负载最低的设备 | 系统负载优化 |

### 策略效果对比

假设一个订单需要 SLA 设备打印，以下是不同策略的对比：

| 设备 | 负载分 | 时间分 | 质量分 | 成本分 | optimal | fastest | lowest_cost |
|------|--------|--------|--------|--------|---------|---------|-------------|
| 设备 A | 0.9 | 0.6 | 0.8 | 0.5 | **0.735** | 2 小时 | ¥80 |
| 设备 B | 0.5 | 0.9 | 0.7 | 0.6 | 0.665 | **1 小时** | ¥90 |
| 设备 C | 0.7 | 0.7 | 0.9 | 0.4 | 0.680 | 3 小时 | **¥60** |

### 策略选择建议

- **日常订单**：使用 `optimal` 策略，平衡各项因素
- **加急订单**：使用 `fastest` 策略，优先时间
- **大订单**：使用 `lowest_cost` 策略，控制成本
- **精细模型**：使用 `best_quality` 策略，保证质量
- **高负载期**：使用 `balanced_load` 策略，避免设备过载

---

## API 使用说明

### 1. 请求设备分配

**端点**: `POST /api/agents/schedule`

**请求体**:
```json
{
  "orderId": "64f5b8c9d1234567890abcde",
  "strategy": "optimal"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "taskId": "sched_1677654321000_64f5b8c9d1234567890abcde",
    "result": {
      "success": true,
      "strategy": "optimal",
      "recommendations": [
        {
          "device": {
            "_id": "...",
            "deviceId": "SLA-001",
            "type": "sla",
            "status": "idle"
          },
          "score": 0.85,
          "estimatedStartTime": "2026-03-03T10:00:00.000Z",
          "estimatedCompletionTime": "2026-03-03T12:00:00.000Z",
          "estimatedCost": 150,
          "rationale": "综合评分最高；当前负载较低；设备精度高"
        }
      ],
      "alternatives": [...],
      "totalScored": 5
    },
    "appliedRules": [
      {
        "ruleId": "urgent_order",
        "ruleName": "紧急订单插队",
        "message": "紧急订单，优先分配"
      }
    ]
  },
  "message": "设备分配完成"
}
```

### 2. 查询分配结果

**端点**: `GET /api/agents/schedule/:orderId`

**响应**:
```json
{
  "success": true,
  "data": {
    "orderId": "64f5b8c9d1234567890abcde",
    "tasks": [
      {
        "id": "sched_1677654321000_64f5b8c9d1234567890abcde",
        "type": "schedule_device",
        "status": "completed",
        "startTime": 1677654321000,
        "endTime": 1677654325000,
        "result": {...}
      }
    ]
  },
  "message": "分配结果查询成功"
}
```

### 3. 获取可用设备列表

**端点**: `GET /api/agents/devices/available?deviceType=sla`

**查询参数**:
- `deviceType` (可选): 设备类型 (sla/fdm/sls/mjf)

**响应**:
```json
{
  "success": true,
  "data": {
    "count": 3,
    "devices": [
      {
        "deviceId": "SLA-001",
        "type": "sla",
        "status": "idle",
        "location": "车间 A",
        "currentLoad": 30,
        "specifications": {
          "buildVolume": { "x": 200, "y": 200, "z": 200 },
          "resolution": "0.05mm",
          "supportedMaterials": ["resin_standard", "resin_tough"]
        }
      }
    ]
  },
  "message": "可用设备列表获取成功"
}
```

### 4. 批量分配设备

**端点**: `POST /api/agents/schedule/batch`

**请求体**:
```json
{
  "orderIds": [
    "64f5b8c9d1234567890abcde",
    "64f5b8c9d1234567890abcdf"
  ],
  "strategy": "optimal"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "total": 2,
    "successful": 2,
    "failed": 0,
    "results": [
      {
        "orderId": "64f5b8c9d1234567890abcde",
        "success": true,
        "result": {...}
      }
    ]
  },
  "message": "批量分配完成"
}
```

### 5. 获取调度 Agent 状态

**端点**: `GET /api/agents/scheduler/status`

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "scheduler_agent",
    "name": "调度 Agent",
    "state": "ready",
    "schedulingTasks": {
      "total": 10,
      "processing": 1,
      "completed": 8,
      "failed": 1
    },
    "allocationAlgorithm": {
      "defaultStrategy": "optimal",
      "weights": {
        "load": 0.3,
        "time": 0.3,
        "quality": 0.25,
        "cost": 0.15
      }
    },
    "rules": {
      "enabled": true,
      "count": 5
    }
  },
  "message": "调度 Agent 状态获取成功"
}
```

---

## 配置选项

### 创建调度 Agent 时的配置

```javascript
const scheduler = new SchedulerAgent({
  id: 'scheduler_agent',              // Agent 唯一标识
  name: '调度 Agent',                 // Agent 名称
  description: '负责设备分配',         // Agent 描述
  llmConfig: {},                      // LLM 配置
  
  // 调度器特定配置
  enableRules: true,                  // 是否启用调度规则 (默认：true)
  enableLogging: true,                // 是否启用日志 (默认：true)
  defaultStrategy: 'optimal'          // 默认分配策略 (默认：optimal)
});
```

### 权重配置

```javascript
// 通过 allocationAlgorithm 更新权重
scheduler.allocationAlgorithm.updateWeights({
  load: 0.25,    // 负载权重
  time: 0.35,    // 时间权重
  quality: 0.25, // 质量权重
  cost: 0.15     // 成本权重
});
```

### 策略配置

```javascript
// 可用的策略值
const strategies = {
  OPTIMAL: 'optimal',           // 综合最优
  FASTEST: 'fastest',           // 最快完成
  LOWEST_COST: 'lowest_cost',   // 最低成本
  BEST_QUALITY: 'best_quality', // 最优质量
  BALANCED_LOAD: 'balanced_load' // 负载均衡
};
```

---

## 最佳实践

### 1. 权重调优

根据业务需求调整权重配置：

- **快速交付场景**：提高时间权重 (time: 0.4-0.5)
- **成本控制场景**：提高成本权重 (cost: 0.25-0.3)
- **高质量要求**：提高质量权重 (quality: 0.35-0.4)
- **设备保护**：提高负载权重 (load: 0.4-0.5)

### 2. 规则使用

启用调度规则可以优化分配效果：

- **紧急订单插队**：确保紧急订单优先处理
- **设备维护避让**：避免分配即将维护的设备
- **材料批量**：减少换料时间，提高效率
- **负载均衡**：防止某些设备过载

### 3. 批量分配

对于多个订单，使用批量分配可以提高效率：

```javascript
// 批量分配（推荐）
const result = await scheduler.execute({
  type: 'batch_allocate',
  orderIds: ['order1', 'order2', 'order3'],
  strategy: 'optimal'
});

// 而不是逐个分配
for (const orderId of orderIds) {
  await scheduler.execute({
    type: 'schedule_device',
    orderId
  });
}
```

### 4. 监控和日志

启用日志并定期检查 Agent 状态：

```javascript
// 创建时启用日志
const scheduler = new SchedulerAgent({
  enableLogging: true
});

// 定期检查状态
const stats = scheduler.getStats();
console.log('调度任务统计:', stats.schedulingTasks);
```

### 5. 错误处理

始终捕获并处理分配失败：

```javascript
try {
  const result = await scheduler.execute({
    type: 'schedule_device',
    orderId
  });
  
  if (!result.result.success) {
    console.error('分配失败:', result.result.error);
    // 使用备选策略或人工介入
  }
} catch (error) {
  console.error('调度异常:', error.message);
  // 错误处理逻辑
}
```

### 6. 性能优化

- **缓存设备列表**：定期刷新设备列表，避免频繁查询数据库
- **批量操作**：使用批量分配而非逐个分配
- **异步处理**：对于非紧急订单，使用异步分配

---

## 故障排查

### 常见问题

#### 1. 没有可用设备

**原因**:
- 所有设备都在维护或离线状态
- 设备类型不匹配
- 材料不兼容

**解决方案**:
- 检查设备状态：`GET /api/agents/devices/available`
- 确认订单的设备类型要求
- 更新设备支持的材料列表

#### 2. 分配结果不符合预期

**原因**:
- 权重配置不合理
- 调度规则影响
- 设备信息不准确

**解决方案**:
- 调整权重配置
- 检查应用的规则：查看 `appliedRules`
- 更新设备状态和规格信息

#### 3. 调度 Agent 未就绪

**原因**:
- Agent 未正确初始化
- 数据库连接失败
- 依赖模块缺失

**解决方案**:
- 检查 Agent 状态：`GET /api/agents/scheduler/status`
- 确认 MongoDB 连接正常
- 检查依赖是否安装

---

## 更新日志

### v1.0.0 (2026-03-03)

- 初始版本发布
- 支持 5 种分配策略
- 集成 5 种调度规则
- 提供完整的 API 接口
- 中文文档支持

---

## 联系支持

如有问题或建议，请联系开发团队。
