# API 路由指南

本文档描述 3D 头部建模后端服务的所有 API 端点、请求/响应格式和使用示例。

## 目录

- [统一响应格式](#统一响应格式)
- [错误处理](#错误处理)
- [健康检查](#健康检查)
- [订单管理 API](#订单管理-api)
- [设备管理 API](#设备管理-api)
- [材料管理 API](#材料管理-api)
- [Agent 决策 API](#agent 决策-api)
- [3D 生成 API](#3d 生成-api)

---

## 统一响应格式

所有 API 端点返回统一的 JSON 响应格式：

### 成功响应
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功",
  "timestamp": "2026-03-03T10:00:00.000Z"
}
```

### 错误响应
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": { ... }
  },
  "timestamp": "2026-03-03T10:00:00.000Z"
}
```

### 分页响应
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10
    }
  },
  "message": "获取成功",
  "timestamp": "2026-03-03T10:00:00.000Z"
}
```

---

## 错误处理

### 常见错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-----------|------|
| VALIDATION_ERROR | 400 | 数据验证失败 |
| NOT_FOUND | 404 | 资源未找到 |
| UNAUTHORIZED | 401 | 未授权访问 |
| FORBIDDEN | 403 | 禁止访问 |
| CONFLICT | 409 | 资源冲突（如重复） |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
| DATABASE_ERROR | 500 | 数据库错误 |
| INVALID_STATUS_TRANSITION | 400 | 无效的状态变更 |

### Mongoose 错误自动处理

- **验证错误**：自动返回 400 + 详细错误信息
- **重复键错误**：自动返回 409 + 冲突字段
- **类型转换错误**：自动返回 400 + 无效字段信息

---

## 健康检查

### `GET /health`

检查服务运行状态。

**响应示例：**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "2.0.0",
    "api": "hunyuan-qiniu",
    "database": "connected",
    "environment": "development"
  },
  "message": "服务运行正常",
  "timestamp": "2026-03-03T10:00:00.000Z"
}
```

---

## 订单管理 API

### `POST /api/orders`

创建新订单。

**请求体：**
```json
{
  "userId": "65e1234567890abcdef12345",
  "items": [
    {
      "deviceId": "65e1234567890abcdef12346",
      "materialId": "65e1234567890abcdef12347",
      "quantity": 1,
      "unitPrice": 299.00,
      "specifications": {
        "color": "white",
        "scale": 1.0
      }
    }
  ],
  "totalPrice": 299.00,
  "metadata": {
    "sourcePhotos": ["https://..."],
    "generatedModelUrl": "https://...",
    "notes": "加急订单"
  }
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "_id": "65e1234567890abcdef12348",
    "userId": "65e1234567890abcdef12345",
    "items": [...],
    "totalPrice": 299.00,
    "status": "pending",
    "agentDecisions": [],
    "metadata": {...},
    "createdAt": "2026-03-03T10:00:00.000Z",
    "updatedAt": "2026-03-03T10:00:00.000Z"
  },
  "message": "订单创建成功",
  "timestamp": "2026-03-03T10:00:00.000Z"
}
```

---

### `GET /api/orders`

获取订单列表（支持筛选、分页）。

**查询参数：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| limit | number | 10 | 每页数量 |
| status | string | - | 按状态筛选 |
| userId | string | - | 按用户 ID 筛选 |
| sortBy | string | createdAt | 排序字段 |
| sortOrder | string | desc | 排序方向（asc/desc） |

**请求示例：**
```
GET /api/orders?page=1&limit=10&status=pending&sortBy=createdAt&sortOrder=desc
```

---

### `GET /api/orders/:id`

获取订单详情。

**路径参数：**
- `id` - 订单 ID

**响应示例：**
```json
{
  "success": true,
  "data": {
    "_id": "65e1234567890abcdef12348",
    "userId": {...},
    "items": [
      {
        "deviceId": {...},
        "materialId": {...},
        "quantity": 1,
        "unitPrice": 299.00
      }
    ],
    "status": "pending",
    "agentDecisions": [...],
    "metadata": {...}
  },
  "message": "订单详情获取成功"
}
```

---

### `PATCH /api/orders/:id/status`

更新订单状态。

**请求体：**
```json
{
  "status": "processing",
  "reason": "已分配打印设备"
}
```

**合法状态变更：**
- `pending` → `processing` | `cancelled`
- `processing` → `printing` | `failed` | `cancelled`
- `printing` → `completed` | `failed`
- `failed` → `processing` (重新处理)

**响应示例：**
```json
{
  "success": true,
  "data": {...},
  "message": "订单状态已更新为 processing"
}
```

---

### `DELETE /api/orders/:id`

取消订单（软删除）。

**说明：**
- 已完成的订单无法取消
- 将状态设置为 `cancelled`

---

## 设备管理 API

### `GET /api/devices`

获取设备列表。

**查询参数：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| limit | number | 10 | 每页数量 |
| status | string | - | idle/busy/maintenance/offline |
| type | string | - | sla/fdm/sls/mjf |

---

### `GET /api/devices/:id`

获取设备详情。

---

### `POST /api/devices`

添加设备。

**请求体：**
```json
{
  "deviceId": "PRINTER-001",
  "type": "sla",
  "status": "idle",
  "capacity": {
    "maxVolume": 100,
    "currentLoad": 0
  },
  "specifications": {
    "buildVolume": { "x": 200, "y": 200, "z": 300 },
    "resolution": "0.05mm",
    "supportedMaterials": ["resin-white", "resin-gray"]
  },
  "location": "北京车间 A 区"
}
```

**必填字段：**
- `deviceId` - 设备唯一标识
- `type` - 设备类型（sla/fdm/sls/mjf）

---

### `PATCH /api/devices/:id`

更新设备状态。

**请求体：**
```json
{
  "status": "busy",
  "currentTask": {
    "orderId": "65e1234567890abcdef12348",
    "startedAt": "2026-03-03T10:00:00.000Z",
    "estimatedCompletion": "2026-03-03T14:00:00.000Z"
  },
  "capacity": {
    "currentLoad": 50
  }
}
```

---

### `DELETE /api/devices/:id`

删除设备。

**说明：**
- 正在运行任务的设备无法删除

---

## 材料管理 API

### `GET /api/materials`

获取材料列表。

**查询参数：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| limit | number | 10 | 每页数量 |
| type | string | - | resin/filament/powder/liquid |
| lowStock | boolean | false | 仅返回低库存材料 |

---

### `GET /api/materials/low-stock`

获取低库存材料（快捷方式）。

**响应示例：**
```json
{
  "success": true,
  "data": [
    {
      "_id": "65e1234567890abcdef12349",
      "name": "白色光敏树脂",
      "type": "resin",
      "stock": {
        "quantity": 5,
        "unit": "kg"
      },
      "threshold": 10,
      "needsReorder": true
    }
  ],
  "message": "低库存材料列表获取成功"
}
```

---

### `GET /api/materials/:id`

获取材料详情。

---

### `PATCH /api/materials/:id/stock`

更新库存。

**请求体：**
```json
{
  "quantity": 50,
  "operation": "set"
}
```

**operation 可选值：**
- `set` - 设置为指定值
- `add` - 增加指定数量
- `subtract` - 减少指定数量

**请求示例：**
```
PATCH /api/materials/65e1234567890abcdef12349/stock
{
  "quantity": 10,
  "operation": "add"
}
```

---

## Agent 决策 API

### `POST /api/agents/decide`

触发 Agent 决策并记录。

**请求体：**
```json
{
  "orderId": "65e1234567890abcdef12348",
  "agentId": "device-selector-agent",
  "decisionType": "device_selection",
  "decisionResult": "选择设备 PRINTER-001",
  "confidence": 0.95,
  "inputSnapshot": {
    "availableDevices": [...],
    "orderRequirements": {...}
  },
  "rationale": "设备 PRINTER-001 当前空闲且支持所需材料",
  "alternatives": [
    {
      "option": "PRINTER-002",
      "score": 0.8,
      "reason": "设备负载较高"
    }
  ],
  "impact": {
    "estimatedTime": 240,
    "estimatedCost": 299.00,
    "qualityScore": 0.95
  }
}
```

**必填字段：**
- `orderId` - 关联订单 ID
- `agentId` - Agent 标识
- `decisionType` - 决策类型
- `decisionResult` - 决策结果
- `rationale` - 决策理由
- `inputSnapshot` - 输入快照

---

### `GET /api/agents/decisions/:orderId`

获取订单的决策历史。

**响应示例：**
```json
{
  "success": true,
  "data": [
    {
      "_id": "65e1234567890abcdef12350",
      "orderId": {...},
      "agentId": "device-selector-agent",
      "decisionType": "device_selection",
      "decisionResult": "选择设备 PRINTER-001",
      "confidence": 0.95,
      "rationale": "...",
      "createdAt": "2026-03-03T10:00:00.000Z"
    }
  ],
  "message": "决策历史获取成功"
}
```

---

### `GET /api/agents/status`

获取 Agent 状态统计。

**查询参数：**
- `agentId` - 可选，按 Agent ID 筛选

**响应示例：**
```json
{
  "success": true,
  "data": {
    "totalDecisions": 150,
    "decisionsByType": [
      { "_id": "device_selection", "count": 50, "avgConfidence": 0.92 },
      { "_id": "material_selection", "count": 45, "avgConfidence": 0.88 }
    ],
    "lowConfidenceCount": 5,
    "lowConfidenceDecisions": [...],
    "recentDecisions": [...]
  },
  "message": "Agent 状态获取成功"
}
```

---

## 3D 生成 API

### `POST /api/upload`

上传照片并创建 3D 生成任务。

**请求类型：** `multipart/form-data`

**表单字段：**
- `photos` - 图片文件数组（1-5 张）
- `mode` - 模式：`single`（单图）或 `multiview`（多图）
- `enableBackgroundRemoval` - 是否启用背景移除

**响应示例：**
```json
{
  "success": true,
  "taskId": "task-1709467200000-abc123",
  "status": "PENDING",
  "message": "照片上传成功，任务已创建",
  "photos": ["https://..."],
  "estimatedTime": "3-5 分钟"
}
```

---

### `GET /api/status/:taskId`

查询 3D 生成任务状态。

**响应示例：**
```json
{
  "success": true,
  "data": {
    "taskId": "task-1709467200000-abc123",
    "status": "COMPLETED",
    "progress": 100,
    "statusMessage": "3D 模型生成完成",
    "result": {
      "modelUrl": "https://...",
      "thumbnailUrl": "https://..."
    }
  }
}
```

---

### `GET /api/download/:taskId`

下载生成的 3D 模型文件。

---

### `POST /api/remove-background`

移除图片背景。

**请求类型：** `multipart/form-data`

**表单字段：**
- `image` - 图片文件

---

## 最佳实践

### 1. 错误处理
始终检查响应的 `success` 字段：
```javascript
const response = await fetch('/api/orders');
const data = await response.json();

if (!data.success) {
  console.error(`错误：${data.error.message}`);
  return;
}

// 处理成功数据
console.log(data.data);
```

### 2. 分页处理
使用分页参数获取大数据集：
```javascript
let page = 1;
const limit = 20;

async function loadAllOrders() {
  const response = await fetch(`/api/orders?page=${page}&limit=${limit}`);
  const { data } = await response.json();
  
  // 处理当前页
  console.log(data.items);
  
  // 检查是否有更多页
  if (page < data.pagination.totalPages) {
    page++;
    return loadAllOrders();
  }
}
```

### 3. 状态管理
订单状态变更遵循严格的流转规则，请先检查当前状态：
```javascript
// 获取订单详情
const order = await fetch(`/api/orders/${orderId}`).then(r => r.json());

// 检查是否可以取消
if (order.data.status === 'completed') {
  console.log('已完成的订单无法取消');
}
```

### 4. 重试机制
对于临时错误（5xx），建议实现指数退避重试：
```javascript
async function retryableRequest(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url);
    if (response.status < 500) return response;
    
    // 指数退避
    await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
  }
  throw new Error('重试次数已用尽');
}
```

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 2.0.0 | 2026-03-03 | 模块化路由重构，统一错误处理和响应格式 |
| 1.0.0 | 2026-02-26 | 初始版本 |
