# 材料管理 API 指南

> 版本：v1.0.0
> 最后更新：2026-03-04

本文档描述了 3D 打印材料管理系统的完整 API 接口，包括材料查询、库存更新、低库存预警、补货建议等功能。

## 目录

- [概述](#概述)
- [API 端点](#api-端点)
- [请求/响应示例](#请求响应示例)
- [库存预警说明](#库存预警说明)
- [补货建议算法](#补货建议算法)
- [错误码说明](#错误码说明)
- [最佳实践](#最佳实践)

---

## 概述

### 基础信息

- **基础路径**: `/api/materials`
- **数据格式**: JSON
- **认证方式**: 暂无（计划中添加）

### 数据模型

Material 材料模型包含以下字段：

```javascript
{
  _id: "ObjectId",              // 材料 ID
  name: "string",               // 材料名称
  type: "resin|filament|powder|liquid",  // 材料类型
  stock: {
    quantity: number,           // 库存数量
    unit: "kg|g|L|mL|spool|cartridge"  // 单位
  },
  threshold: number,            // 补货阈值（低于此值触发预警）
  properties: {                 // 材料属性（可选）
    color: string,
    density: number,
    tensileStrength: string,
    printTemperature: { min: number, max: number }
  },
  supplier: {                   // 供应商信息（可选）
    name: string,
    contactInfo: string,
    sku: string
  },
  costPerUnit: number,          // 单位成本
  createdAt: "ISODate",         // 创建时间
  updatedAt: "ISODate"          // 更新时间
}
```

---

## API 端点

### 1. 查询材料列表

**请求**

```http
GET /api/materials?type=resin&page=1&limit=20
```

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| type | string | 否 | - | 材料类型过滤（resin/filament/powder/liquid） |
| name | string | 否 | - | 材料名称模糊搜索 |
| lowStock | boolean | 否 | false | 是否只查询低库存材料 |
| page | number | 否 | 1 | 页码（从 1 开始） |
| limit | number | 否 | 20 | 每页数量 |

**响应示例**

```json
{
  "success": true,
  "message": "材料列表获取成功",
  "data": [
    {
      "_id": "mat_xxx",
      "name": "标准树脂 - 白色",
      "type": "resin",
      "stock": {
        "quantity": 500,
        "unit": "g"
      },
      "threshold": 100,
      "costPerUnit": 0.5
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 2. 查询材料详情

**请求**

```http
GET /api/materials/:materialId
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| materialId | string | 是 | 材料 ID（ObjectId） |

**响应示例**

```json
{
  "success": true,
  "message": "材料详情获取成功",
  "data": {
    "_id": "mat_xxx",
    "name": "标准树脂 - 白色",
    "type": "resin",
    "stock": {
      "quantity": 500,
      "unit": "g"
    },
    "threshold": 100,
    "needsReorder": false,
    "availableDays": 30,
    "properties": {
      "color": "白色",
      "density": 1.2
    }
  }
}
```

---

### 3. 更新库存

**请求**

```http
PATCH /api/materials/:materialId/stock
Content-Type: application/json

{
  "quantityChange": -50,
  "reason": "订单消耗",
  "orderId": "order_xxx"
}
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| materialId | string | 是 | 材料 ID |

**请求体参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| quantityChange | number | 是 | 库存变化量（正数增加，负数减少） |
| reason | string | 否 | 变化原因（默认："手动更新"） |
| orderId | string | 否 | 关联订单 ID |

**响应示例**

```json
{
  "success": true,
  "message": "库存已更新：-50 g",
  "data": {
    "_id": "mat_xxx",
    "name": "标准树脂 - 白色",
    "stock": {
      "quantity": 450,
      "unit": "g"
    },
    "threshold": 100
  }
}
```

---

### 4. 获取低库存材料

**请求**

```http
GET /api/materials/low-stock?includeCritical=true
```

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| includeCritical | boolean | 否 | true | 是否包含严重不足的材料 |

**响应示例**

```json
{
  "success": true,
  "message": "低库存材料列表获取成功",
  "data": [
    {
      "_id": "mat_xxx",
      "name": "柔性树脂 - 黑色",
      "type": "resin",
      "stock": {
        "quantity": 50,
        "unit": "g"
      },
      "threshold": 100,
      "percentage": "50.00%",
      "status": "low_stock"
    }
  ],
  "meta": {
    "total": 1,
    "critical": 0
  }
}
```

---

### 5. 获取补货建议

**请求**

```http
GET /api/materials/reorder-suggestions
```

**响应示例**

```json
{
  "success": true,
  "message": "补货建议获取成功",
  "data": [
    {
      "materialId": "mat_xxx",
      "name": "柔性树脂 - 黑色",
      "type": "resin",
      "currentStock": 50,
      "threshold": 100,
      "suggestedAmount": 200,
      "unit": "g",
      "priority": "high",
      "priorityScore": 85,
      "estimatedCost": 160,
      "availableDays": 3,
      "forecast": {
        "method": "simple_moving_average",
        "predictedConsumption": 150,
        "trend": "increasing"
      },
      "supplier": {
        "name": "供应商 A",
        "contactInfo": "supplier-a@example.com",
        "sku": "RESIN-BLK-001"
      }
    }
  ],
  "meta": {
    "totalMaterials": 5,
    "needReorder": 2
  }
}
```

**字段说明**

- `priority`: 优先级（high/medium/low）
  - `high`: 库存 ≤ 25% 阈值
  - `medium`: 库存 ≤ 50% 阈值
  - `low`: 库存 ≤ 100% 阈值
- `priorityScore`: 优先级分数（0-100，越高越紧急）
- `estimatedCost`: 预估成本（suggestedAmount × costPerUnit）
- `availableDays`: 预计可用天数（基于历史消耗预测）

---

### 6. 批量更新库存

**请求**

```http
POST /api/materials/bulk-stock-update
Content-Type: application/json

{
  "updates": [
    {
      "materialId": "mat_1",
      "quantityChange": -30,
      "orderId": "order_001"
    },
    {
      "materialId": "mat_2",
      "quantityChange": 100
    }
  ]
}
```

**请求体参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| updates | Array | 是 | 更新操作数组 |
| updates[].materialId | string | 是 | 材料 ID |
| updates[].quantityChange | number | 是 | 库存变化量 |
| updates[].orderId | string | 否 | 关联订单 ID |

**响应示例（全部成功）**

```json
{
  "success": true,
  "message": "批量更新成功",
  "data": [
    {
      "materialId": "mat_1",
      "success": true,
      "data": {
        "_id": "mat_1",
        "stock": {
          "quantity": 470,
          "unit": "g"
        }
      }
    }
  ]
}
```

**响应示例（部分失败）**

```json
{
  "success": false,
  "data": {
    "results": [
      {
        "materialId": "mat_1",
        "success": true,
        "data": { ... }
      }
    ],
    "errors": [
      {
        "materialId": "mat_999",
        "error": "材料不存在"
      }
    ],
    "total": 2,
    "successCount": 1,
    "failCount": 1
  }
}
```

---

### 7. 检查材料充足性

**请求**

```http
POST /api/materials/:materialId/check-sufficiency
Content-Type: application/json

{
  "requiredAmount": 100
}
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| materialId | string | 是 | 材料 ID |

**请求体参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| requiredAmount | number | 是 | 需求量（必须 ≥ 0） |

**响应示例**

```json
{
  "success": true,
  "message": "材料充足性检查完成",
  "data": {
    "materialId": "mat_xxx",
    "materialName": "标准树脂 - 白色",
    "materialType": "resin",
    "currentStock": 500,
    "requiredAmount": 100,
    "isSufficient": true,
    "isBelowThreshold": false,
    "unit": "g",
    "remainingAfterUse": 400,
    "status": "sufficient"
  }
}
```

**状态说明**

| 状态 | 说明 |
|------|------|
| `out_of_stock` | 库存为 0 |
| `critical` | 库存 ≤ 25% 阈值 |
| `low_stock` | 库存 ≤ 100% 阈值 |
| `adequate` | 库存 ≤ 200% 阈值 |
| `sufficient` | 库存 > 200% 阈值 |

---

### 8. 创建新材料

**请求**

```http
POST /api/materials
Content-Type: application/json

{
  "name": "高温树脂 - 灰色",
  "type": "resin",
  "stock": {
    "quantity": 1000,
    "unit": "g"
  },
  "threshold": 200,
  "costPerUnit": 0.8,
  "properties": {
    "color": "灰色",
    "density": 1.3,
    "printTemperature": {
      "min": 70,
      "max": 90
    }
  },
  "supplier": {
    "name": "供应商 B",
    "contactInfo": "supplier-b@example.com",
    "sku": "RESIN-GRY-001"
  }
}
```

**必填字段**

- `name`: 材料名称
- `type`: 材料类型（resin/filament/powder/liquid）
- `stock`: 库存信息
  - `stock.quantity`: 库存数量
  - `stock.unit`: 单位（kg/g/L/mL/spool/cartridge）
- `threshold`: 补货阈值
- `costPerUnit`: 单位成本

**响应示例**

```json
{
  "success": true,
  "message": "材料创建成功",
  "data": {
    "_id": "mat_xxx",
    "name": "高温树脂 - 灰色",
    "type": "resin",
    "stock": {
      "quantity": 1000,
      "unit": "g"
    },
    "threshold": 200,
    "costPerUnit": 0.8
  }
}
```

---

### 9. 更新材料信息

**完整更新（PUT）**

```http
PUT /api/materials/:materialId
Content-Type: application/json

{
  "name": "新名称",
  "type": "resin",
  "threshold": 150
  // ... 其他所有字段
}
```

**部分更新（PATCH）**

```http
PATCH /api/materials/:materialId
Content-Type: application/json

{
  "threshold": 150,
  "costPerUnit": 0.6
}
```

---

### 10. 删除材料

**请求**

```http
DELETE /api/materials/:materialId
```

**响应示例**

```json
{
  "success": true,
  "message": "材料已删除"
}
```

---

## 库存预警说明

### 预警触发条件

系统在以下情况会触发库存预警事件：

1. **库存更新时**: 当调用 `PATCH /api/materials/:id/stock` 且更新后库存 ≤ 阈值
2. **低库存检查**: 当调用 `GET /api/materials/low-stock` 时

### 预警事件格式

```javascript
{
  type: 'inventory_low',
  data: {
    materialId: "mat_xxx",
    materialName: "标准树脂 - 白色",
    materialType: "resin",
    currentStock: 50,
    threshold: 100,
    unit: "g",
    suggestedAmount: 200,
    orderId: "order_xxx",  // 可选，触发预警的订单 ID
    reason: "库存低于阈值"
  },
  timestamp: "2026-03-04T10:30:00.000Z"
}
```

### 预警监听

```javascript
const { agentEventEmitter } = require('./utils/AgentEventEmitter');

agentEventEmitter.on('inventory_low', (event) => {
  console.log('收到库存预警:', event.data);
  // 执行预警处理逻辑（如发送邮件、短信通知等）
});
```

---

## 补货建议算法

### 算法流程

1. **获取材料列表**: 从数据库查询所有材料
2. **库存状态检查**: 筛选出库存 ≤ 阈值的材料
3. **消耗预测**: 调用 InventoryAgent 获取 7 天消耗预测
4. **优先级计算**: 根据库存百分比和材料类型计算优先级分数
5. **建议生成**: 生成补货建议列表并按优先级排序

### 优先级分数计算

```javascript
// 基础分数 = (1 - 库存百分比) × 100
const baseScore = (1 - (currentStock / threshold)) × 100;

// 类型系数
let typeMultiplier = 1;
if (type === 'resin') typeMultiplier = 1.2;    // 树脂材料优先级 +20%
if (type === 'filament') typeMultiplier = 1.1; // 线材优先级 +10%

// 最终分数 = min(100, baseScore × typeMultiplier)
```

### 补货量计算

```javascript
// 建议补货量 = 阈值 × 2（向上取整）
const suggestedAmount = Math.ceil(threshold × 2);
```

---

## 错误码说明

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 207 | 批量操作部分成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 业务错误码

| 错误信息 | 状态码 | 说明 |
|----------|--------|------|
| `无效的材料 ID 格式` | 400 | ObjectId 格式不正确 |
| `材料不存在` | 404 | 指定的材料 ID 不存在 |
| `quantityChange 是必填字段` | 400 | 缺少必填参数 |
| `quantityChange 必须是数字` | 400 | 参数类型错误 |
| `库存不足，当前库存：X g` | 400 | 更新后库存将为负数 |
| `requiredAmount 必须大于等于 0` | 400 | 需求量不能为负数 |
| `材料名称是必填的` | 400 | 创建材料时缺少名称 |
| `材料类型是必填的` | 400 | 创建材料时缺少类型 |
| `库存信息是必填的` | 400 | 创建材料时缺少库存信息 |
| `补货阈值是必填的` | 400 | 创建材料时缺少阈值 |
| `单位成本是必填的` | 400 | 创建材料时缺少成本 |

### 错误响应格式

```json
{
  "success": false,
  "error": "错误信息",
  "message": "详细描述（可选）"
}
```

---

## 最佳实践

### 1. 库存更新最佳实践

**推荐**: 使用 `quantityChange` 进行增量更新

```javascript
// ✓ 好的做法：清楚记录变化量
PATCH /api/materials/mat_xxx/stock
{
  "quantityChange": -50,
  "reason": "订单消耗",
  "orderId": "order_123"
}
```

**不推荐**: 直接设置库存数量（难以追溯历史）

```javascript
// ✗ 不推荐：无法知道变化原因
PATCH /api/materials/mat_xxx/stock
{
  "quantityChange": -100  // 一次性变化过大
}
```

### 2. 批量更新最佳实践

**推荐**: 合理分组批量更新

```javascript
// ✓ 好的做法：按订单分组
POST /api/materials/bulk-stock-update
{
  "updates": [
    {
      "materialId": "mat_1",
      "quantityChange": -30,
      "orderId": "order_001"
    },
    {
      "materialId": "mat_2",
      "quantityChange": -50,
      "orderId": "order_001"
    }
  ]
}
```

### 3. 补货建议使用最佳实践

**推荐**: 定期检查补货建议

```javascript
// ✓ 好的做法：每天检查补货建议
const suggestions = await axios.get('/api/materials/reorder-suggestions');

// 按优先级处理
suggestions.data.data
  .filter(item => item.priority === 'high')
  .forEach(item => {
    console.log(`紧急补货：${item.name} - 建议补货 ${item.suggestedAmount} ${item.unit}`);
  });
```

### 4. 错误处理最佳实践

**推荐**: 完整的错误处理

```javascript
try {
  const response = await axios.patch(`/api/materials/${materialId}/stock`, {
    quantityChange: -50,
    reason: '订单消耗'
  });
  
  console.log('更新成功:', response.data.message);
} catch (error) {
  if (error.response) {
    // API 返回错误
    console.error('API 错误:', error.response.data.error);
  } else {
    // 网络错误
    console.error('网络错误:', error.message);
  }
}
```

### 5. 性能优化建议

**分页查询**: 当材料数量较多时，使用分页避免响应过大

```javascript
// ✓ 好的做法：限制每页数量
GET /api/materials?page=1&limit=50
```

**按需查询**: 只查询需要的数据

```javascript
// ✓ 好的做法：只查询低库存材料
GET /api/materials?lowStock=true

// ✓ 好的做法：按类型过滤
GET /api/materials?type=resin
```

---

## 附录

### 材料类型枚举

| 类型 | 说明 | 常用单位 |
|------|------|----------|
| `resin` | 光敏树脂 | g, kg, mL, L |
| `filament` | 热熔线材 | g, kg, spool |
| `powder` | 金属/尼龙粉末 | g, kg |
| `liquid` | 液态材料 | mL, L |

### 库存单位枚举

| 单位 | 说明 | 适用材料类型 |
|------|------|--------------|
| `g` | 克 | resin, filament, powder |
| `kg` | 千克 | resin, filament, powder |
| `mL` | 毫升 | resin, liquid |
| `L` | 升 | resin, liquid |
| `spool` | 卷 | filament |
| `cartridge` | 盒/ cartridge | resin |

### 测试脚本

项目包含完整的 API 测试脚本：

```bash
# 运行测试
node backend/scripts/test-material-api.js

# 指定 API 地址
API_URL=http://localhost:3000/api node backend/scripts/test-material-api.js
```

### 相关文件

- `backend/src/models/Material.js` - Material 数据模型
- `backend/src/services/MaterialService.js` - 材料业务逻辑层
- `backend/src/routes/materials.js` - 材料 API 路由
- `backend/src/agents/InventoryAgent.js` - 库存 Agent（补货预测）
- `backend/src/utils/AgentEventEmitter.js` - 事件发射器

---

**文档版本**: v1.0.0  
**最后更新**: 2026-03-04  
**维护者**: 3D 头部建模 AI 智能体团队
