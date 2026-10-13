# 库存 Agent 使用指南

## 目录

1. [概述](#概述)
2. [架构设计](#架构设计)
3. [核心功能](#核心功能)
4. [预测算法](#预测算法)
5. [API 接口](#api-接口)
6. [配置选项](#配置选项)
7. [使用示例](#使用示例)
8. [最佳实践](#最佳实践)

---

## 概述

库存 Agent（Inventory Agent）是 3D 打印材料管理的核心组件，负责：

- **库存检查**：实时监控材料库存状态
- **消耗预测**：基于历史数据预测未来材料消耗
- **补货建议**：生成智能采购建议，避免库存不足
- **兼容性检查**：验证材料与设备的兼容性

### 主要特点

- 🎯 三种预测算法：简单移动平均、加权移动平均、线性回归
- 📊 智能补货建议，考虑安全库存和交货周期
- 🔔 低库存自动通知
- 🔍 材料兼容性检查和替代方案推荐

---

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    Inventory Agent                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  预测算法模块   │  │      规则管理模块           │  │
│  │  - 简单移动平均 │  │  - 库存状态检查             │  │
│  │  - 加权移动平均 │  │  - 补货判断                 │  │
│  │  - 线性回归     │  │  - 兼容性检查               │  │
│  └─────────────────┘  └─────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │            消耗计算工具                         │  │
│  │  - 订单消耗计算  - 历史数据获取                │  │
│  │  - 安全库存计算  - 补货量计算                  │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────┐
        │      数据库/API 层             │
        │  - Material 模型              │
        │  - Order 模型                 │
        │  - 通知队列                   │
        └───────────────────────────────┘
```

### 文件结构

```
backend/
├── src/
│   ├── agents/
│   │   ├── InventoryAgent.js              # 库存 Agent 主类
│   │   ├── algorithms/
│   │   │   └── InventoryForecastAlgorithm.js  # 预测算法
│   │   └── rules/
│   │       └── inventoryRules.js          # 库存规则
│   ├── utils/
│   │   └── consumptionCalculator.js       # 消耗计算工具
│   └── routes/
│       └── agents.js                      # API 路由（包含库存端点）
└── docs/
    └── INVENTORY-AGENT-GUIDE.md           # 本文档
```

---

## 核心功能

### 1. 库存检查

检查当前库存量，判断是否低于预警阈值，是否满足订单需求。

**检查维度**：
- 当前库存量
- 库存状态（充足/低库存/严重不足/缺货）
- 可用天数
- 低于阈值百分比

**返回示例**：
```json
{
  "success": true,
  "summary": {
    "total": 10,
    "sufficient": 6,
    "lowStock": 2,
    "critical": 1,
    "outOfStock": 1
  },
  "details": [
    {
      "materialId": "60f7b3b3b3b3b3b3b3b3b3b3",
      "materialName": "光敏树脂 - 白色",
      "materialType": "resin",
      "status": "low_stock",
      "currentStock": 800,
      "threshold": 1000,
      "percentage": "80.00",
      "isBelowThreshold": true
    }
  ]
}
```

### 2. 消耗预测

基于历史订单数据，使用三种算法预测未来材料消耗。

**预测算法对比**：

| 算法 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| 简单移动平均 | 消耗稳定的材料 | 计算简单，响应快 | 不考虑趋势 |
| 加权移动平均 | 近期变化较大的材料 | 重视近期数据 | 权重需调整 |
| 线性回归 | 有明显趋势的材料 | 捕捉趋势 | 需要足够数据 |

**返回示例**：
```json
{
  "success": true,
  "forecast": {
    "method": "simple_moving_average",
    "predictedConsumption": 3500,
    "averageDailyConsumption": 500,
    "forecastDays": 7,
    "confidence": 0.85,
    "trend": "increasing",
    "historicalDataPoints": 30
  }
}
```

### 3. 补货建议

根据预测结果和当前库存，生成智能采购建议。

**计算逻辑**：
```
目标库存 = 预测消耗量 + 安全库存
安全库存 = 平均日消耗 × 交货周期 × 安全系数
建议补货量 = 目标库存 - 当前库存
```

**优先级判定**：
- 🔴 **紧急**：库存 ≤ 阈值 × 0.5
- 🟠 **高**：库存 ≤ 阈值
- 🟡 **中**：库存 ≤ 阈值 × 1.2
- 🟢 **低**：库存 > 阈值 × 1.2

**返回示例**：
```json
{
  "success": true,
  "suggestions": [
    {
      "materialId": "60f7b3b3b3b3b3b3b3b3b3b3",
      "materialName": "光敏树脂 - 白色",
      "priority": "urgent",
      "priorityScore": 85,
      "reorderAmount": 5000,
      "unit": "g",
      "estimatedCost": 250,
      "availableDays": 2,
      "supplier": {
        "name": "供应商 A",
        "contactInfo": "contact@example.com"
      }
    }
  ]
}
```

### 4. 材料兼容性检查

检查材料与设备的兼容性，提供替代方案。

**检查项**：
- 设备是否支持该材料类型
- 材料库存是否充足
- 打印温度是否在设备范围内

**返回示例**：
```json
{
  "success": true,
  "compatible": false,
  "details": {
    "isSupported": false,
    "hasStock": true,
    "temperatureCompatible": true,
    "issues": ["设备不支持该材料类型"]
  },
  "alternatives": [
    {
      "material": {
        "name": "光敏树脂 - 黑色",
        "type": "resin"
      },
      "matchScore": 100,
      "reasons": ["相同材料类型", "相同颜色", "有库存"]
    }
  ]
}
```

---

## 预测算法

### 1. 简单移动平均（Simple Moving Average）

最基础的预测方法，计算过去 N 天的平均消耗量。

**公式**：
```
平均日消耗 = Σ(过去 N 天消耗量) / N
预测消耗 = 平均日消耗 × 预测天数
```

**适用场景**：消耗稳定、无明显趋势的材料

### 2. 加权移动平均（Weighted Moving Average）

给近期数据更高权重，更敏感地反映最新变化。

**公式**：
```
权重：[1, 2, 3, ..., N] 归一化
加权平均 = Σ(第 i 天消耗 × 权重 i) / Σ权重
```

**适用场景**：近期消耗变化较大的材料

### 3. 线性回归（Linear Regression）

使用最小二乘法拟合趋势线，进行趋势外推预测。

**公式**：
```
y = slope × x + intercept
slope = (n×Σxy - Σx×Σy) / (n×Σx² - (Σx)²)
```

**适用场景**：有明显上升或下降趋势的材料

---

## API 接口

### 基础信息

- **Base URL**: `http://localhost:3000/api/agents`
- **认证**: 根据项目配置（如 JWT）

### 接口列表

#### 1. 检查库存

```http
POST /api/agents/inventory/check
Content-Type: application/json

{
  "materialId": "60f7b3b3b3b3b3b3b3b3b3b3",  // 可选，不传则检查所有材料
  "requiredAmount": 500                      // 可选，需求量（克）
}
```

**响应**：
```json
{
  "success": true,
  "message": "库存检查完成",
  "data": {
    "taskId": "inv_1234567890_all",
    "summary": { ... },
    "details": [ ... ]
  }
}
```

#### 2. 获取消耗预测

```http
GET /api/agents/inventory/forecast?materialId=xxx&forecastDays=7&method=simple_moving_average
```

**查询参数**：
- `materialId`（可选）：材料 ID
- `forecastDays`（可选）：预测天数，默认 7
- `method`（可选）：预测方法

**方法枚举**：
- `simple_moving_average` - 简单移动平均
- `weighted_moving_average` - 加权移动平均
- `linear_regression` - 线性回归

#### 3. 获取补货建议

```http
GET /api/agents/inventory/reorder-suggestions?materialId=xxx
```

**响应**：
```json
{
  "success": true,
  "message": "补货建议获取成功",
  "data": {
    "totalMaterials": 10,
    "needReorder": 3,
    "suggestions": [ ... ]
  }
}
```

#### 4. 获取低库存材料列表

```http
GET /api/agents/inventory/low-stock?includeCritical=true
```

**查询参数**：
- `includeCritical`（可选）：是否包含严重不足的材料，默认 true

#### 5. 检查材料兼容性

```http
POST /api/agents/inventory/compatibility
Content-Type: application/json

{
  "materialId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "deviceId": "device_001"
}
```

#### 6. 获取库存 Agent 状态

```http
GET /api/agents/inventory/status
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "inventory_agent",
    "name": "库存 Agent",
    "state": "ready",
    "tools": ["checkInventory", "getForecast", "getReorderSuggestion", ...],
    "inventoryTasks": {
      "total": 5,
      "processing": 0,
      "completed": 5,
      "failed": 0
    }
  }
}
```

---

## 配置选项

### 创建库存 Agent 时的配置

```javascript
const inventoryAgent = await agentRegistry.createInventoryAgent({
  // 基础配置
  id: 'inventory_agent',                    // Agent ID
  name: '库存 Agent',                       // 名称
  description: '负责材料库存管理',           // 描述
  
  // LLM 配置（可选，用于智能决策）
  llmConfig: { ... },
  
  // 通知配置
  enableNotifications: true,                // 是否启用通知
  notificationThresholds: {
    lowStock: true,                         // 低库存通知
    critical: true,                         // 严重不足通知
    outOfStock: true                        // 缺货通知
  },
  
  // 预测配置
  defaultForecastDays: 7,                   // 默认预测天数
  defaultForecastMethod: 'simple_moving_average',  // 默认预测方法
  
  // 其他配置
  enableLogging: true                       // 是否启用日志
});
```

### 规则管理器配置

```javascript
const ruleManager = new InventoryRuleManager({
  lowStockThreshold: 1.2,      // 低库存阈值百分比（相对于阈值）
  criticalThreshold: 0.5,       // 严重不足阈值百分比
  defaultLeadTimeDays: 7,       // 默认交货周期（天）
  defaultSafetyFactor: 1.5      // 默认安全系数
});
```

---

## 使用示例

### 示例 1：检查所有材料库存

```javascript
const response = await fetch('http://localhost:3000/api/agents/inventory/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
});

const result = await response.json();
console.log('库存检查结果:', result.data.summary);
```

### 示例 2：获取特定材料的消耗预测

```javascript
const response = await fetch(
  'http://localhost:3000/api/agents/inventory/forecast?' +
  'materialId=60f7b3b3b3b3b3b3b3b3b3b3&' +
  'forecastDays=14&' +
  'method=linear_regression'
);

const result = await response.json();
console.log('预测结果:', result.data.forecast);
```

### 示例 3：获取紧急补货建议

```javascript
const response = await fetch(
  'http://localhost:3000/api/agents/inventory/reorder-suggestions'
);

const result = await response.json();
const urgentSuggestions = result.data.suggestions.filter(
  s => s.priority === 'urgent'
);

console.log('紧急补货建议:', urgentSuggestions);
```

### 示例 4：检查材料兼容性

```javascript
const response = await fetch('http://localhost:3000/api/agents/inventory/compatibility', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    materialId: '60f7b3b3b3b3b3b3b3b3b3b3',
    deviceId: 'sla_printer_01'
  })
});

const result = await response.json();
if (!result.data.compatible) {
  console.log('不兼容，替代方案:', result.data.alternatives);
}
```

---

## 最佳实践

### 1. 预测方法选择

- **稳定消耗** → 简单移动平均
- **季节波动** → 加权移动平均（增加近期权重）
- **增长趋势** → 线性回归

### 2. 安全库存设置

```
安全库存 = 平均日消耗 × 交货周期 × 安全系数
```

推荐安全系数：
- 关键材料：2.0
- 常用材料：1.5
- 备用材料：1.2

### 3. 通知阈值调整

根据业务需求调整通知阈值，避免通知疲劳：

```javascript
{
  notificationThresholds: {
    lowStock: false,     // 关闭低库存通知
    critical: true,      // 仅接收严重不足通知
    outOfStock: true     // 接收缺货通知
  }
}
```

### 4. 定期预测更新

建议每天更新一次消耗预测：

```javascript
// 使用定时任务每天凌晨 2 点更新预测
cron.schedule('0 2 * * *', async () => {
  const forecast = await inventoryAgent.getForecast(null, 7);
  console.log('每日预测已更新');
});
```

### 5. 补货批量处理

合并多个材料的补货建议，优化采购流程：

```javascript
const suggestions = await inventoryAgent.getReorderSuggestion();
const groupedBySupplier = suggestions.data.suggestions.reduce((acc, s) => {
  const supplier = s.supplier?.name || 'unknown';
  if (!acc[supplier]) acc[supplier] = [];
  acc[supplier].push(s);
  return acc;
}, {});
```

---

## 故障排除

### 问题 1：预测结果不准确

**原因**：历史数据不足或消耗模式变化

**解决方案**：
1. 确保至少有 14 天的历史订单数据
2. 尝试不同的预测方法
3. 调整权重配置

### 问题 2：补货建议过多

**原因**：安全系数过高或阈值设置不合理

**解决方案**：
1. 降低安全系数（从 1.5 调整为 1.2）
2. 检查材料阈值是否设置过低
3. 审核历史消耗数据准确性

### 问题 3：库存 Agent 未就绪

**原因**：Agent 未正确初始化

**解决方案**：
```javascript
// 检查 Agent 状态
const stats = await fetch('/api/agents/inventory/status');
console.log('Agent 状态:', stats.data.state);

// 如果未就绪，重新创建
const inventoryAgent = await agentRegistry.createInventoryAgent({...});
```

---

## 更新日志

### v1.0.0 (2026-03-04)
- ✨ 初始版本发布
- ✅ 实现三种预测算法
- ✅ 实现库存检查和补货建议
- ✅ 实现材料兼容性检查
- ✅ 低库存自动通知

---

## 联系方式

如有问题或建议，请联系开发团队。
