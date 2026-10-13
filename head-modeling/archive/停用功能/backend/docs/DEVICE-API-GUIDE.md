# 设备管理 API 指南

> 版本：v1.0.0  
> 最后更新：2026-03-04

本文档提供设备管理 API 的完整使用说明，包括端点列表、请求/响应示例、设备状态说明以及最佳实践。

## 目录

- [概述](#概述)
- [API 端点列表](#api 端点列表)
- [设备状态说明](#设备状态说明)
- [详细 API 文档](#详细 api 文档)
- [错误码说明](#错误码说明)
- [最佳实践](#最佳实践)
- [测试指南](#测试指南)

---

## 概述

设备管理 API 提供对 3D 打印设备的完整管理功能，包括设备的创建、查询、更新、删除以及任务分配等。该 API 是生产调度系统的基础，支持调度 Agent 实时追踪和分配设备任务。

### 基础信息

- **基础路径**: `/api/devices`
- **数据格式**: JSON
- **认证方式**: （根据项目配置）

### 核心功能

- ✅ 设备 CRUD 操作
- ✅ 设备状态管理
- ✅ 任务分配与完成
- ✅ 设备筛选与分页
- ✅ 实时事件推送（通过 AgentEventEmitter）

---

## API 端点列表

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| `POST` | `/api/devices` | 创建设备 | 管理员 |
| `GET` | `/api/devices` | 获取设备列表 | 公开 |
| `GET` | `/api/devices/available` | 获取可用设备 | 公开 |
| `GET` | `/api/devices/:id` | 获取设备详情 | 公开 |
| `PATCH` | `/api/devices/:id` | 更新设备信息 | 管理员 |
| `PUT` | `/api/devices/:id/status` | 更新设备状态 | 管理员 |
| `POST` | `/api/devices/:id/assign-task` | 分配任务到设备 | 管理员 |
| `POST` | `/api/devices/:id/complete-task` | 完成当前任务 | 管理员 |
| `DELETE` | `/api/devices/:id` | 删除设备 | 管理员 |

---

## 设备状态说明

设备支持以下四种状态：

| 状态 | 描述 | 可分配任务 | 可删除 |
|------|------|-----------|--------|
| `idle` | 空闲状态，设备可用 | ✅ 是 | ✅ 是 |
| `busy` | 繁忙状态，正在执行任务 | ❌ 否 | ❌ 否 |
| `maintenance` | 维护状态，设备维护中 | ❌ 否 | ✅ 是 |
| `offline` | 离线状态，设备不可用 | ❌ 否 | ✅ 是 |

### 状态流转图

```
idle ──→ busy ──→ idle
 │                │
 └──→ maintenance ─┘
 │                │
 └──→ offline ────┘
```

---

## 详细 API 文档

### 1. 创建设备

**端点**: `POST /api/devices`

**请求体**:

```json
{
  "deviceId": "PRINTER-001",
  "type": "sla",
  "location": "Lab A",
  "capacity": {
    "maxVolume": 100,
    "currentLoad": 0
  },
  "specifications": {
    "buildVolume": {
      "x": 200,
      "y": 200,
      "z": 250
    },
    "resolution": "0.05mm",
    "supportedMaterials": ["resin-standard", "resin-tough"]
  },
  "status": "idle"
}
```

**必填字段**:
- `deviceId`: 设备唯一标识（字符串）
- `type`: 设备类型（`sla` | `fdm` | `sls` | `mjf`）

**可选字段**:
- `status`: 初始状态（默认 `idle`）
- `location`: 设备位置
- `capacity`: 容量信息
- `specifications`: 规格参数

**成功响应** (201):

```json
{
  "success": true,
  "message": "设备创建成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "deviceId": "PRINTER-001",
    "type": "sla",
    "status": "idle",
    "location": "Lab A",
    "capacity": {
      "maxVolume": 100,
      "currentLoad": 0
    },
    "specifications": {
      "buildVolume": { "x": 200, "y": 200, "z": 250 },
      "resolution": "0.05mm",
      "supportedMaterials": ["resin-standard", "resin-tough"]
    },
    "createdAt": "2026-03-04T09:00:00.000Z",
    "updatedAt": "2026-03-04T09:00:00.000Z"
  }
}
```

**错误响应**:

```json
{
  "success": false,
  "error": {
    "code": "DEVICE_ID_EXISTS",
    "message": "设备 ID 已存在"
  }
}
```

---

### 2. 获取设备列表

**端点**: `GET /api/devices`

**查询参数**:

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `page` | number | 1 | 页码（从 1 开始） |
| `limit` | number | 20 | 每页数量 |
| `status` | string | - | 状态筛选（`idle`/`busy`/`maintenance`/`offline`） |
| `type` | string | - | 类型筛选（`sla`/`fdm`/`sls`/`mjf`） |
| `sortBy` | string | `createdAt` | 排序字段 |
| `sortOrder` | string | `desc` | 排序方向（`asc`/`desc`） |

**请求示例**:

```
GET /api/devices?status=idle&type=sla&page=1&limit=20
```

**成功响应** (200):

```json
{
  "success": true,
  "message": "设备列表获取成功",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "deviceId": "PRINTER-001",
      "type": "sla",
      "status": "idle",
      "location": "Lab A",
      "capacity": { "maxVolume": 100, "currentLoad": 0 },
      "specifications": {
        "buildVolume": { "x": 200, "y": 200, "z": 250 },
        "resolution": "0.05mm"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 3. 获取可用设备

**端点**: `GET /api/devices/available`

**查询参数**:

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `type` | string | - | 设备类型筛选（可选） |

**请求示例**:

```
GET /api/devices/available?type=sla
```

**成功响应** (200):

```json
{
  "success": true,
  "message": "找到 3 个可用设备",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "deviceId": "PRINTER-001",
      "type": "sla",
      "status": "idle",
      "capacity": { "maxVolume": 100, "currentLoad": 0 }
    }
  ]
}
```

---

### 4. 获取设备详情

**端点**: `GET /api/devices/:id`

**路径参数**:
- `id`: 设备 MongoDB ObjectId

**请求示例**:

```
GET /api/devices/507f1f77bcf86cd799439011
```

**成功响应** (200):

```json
{
  "success": true,
  "message": "设备详情获取成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "deviceId": "PRINTER-001",
    "type": "sla",
    "status": "busy",
    "currentTask": {
      "orderId": "507f1f77bcf86cd799439022",
      "startedAt": "2026-03-04T09:00:00.000Z",
      "estimatedCompletion": "2026-03-04T12:00:00.000Z"
    },
    "location": "Lab A"
  }
}
```

---

### 5. 更新设备信息

**端点**: `PATCH /api/devices/:id`

**路径参数**:
- `id`: 设备 MongoDB ObjectId

**请求体** (所有字段可选):

```json
{
  "status": "busy",
  "currentTask": {
    "orderId": "507f1f77bcf86cd799439022",
    "startedAt": "2026-03-04T09:00:00.000Z",
    "estimatedCompletion": "2026-03-04T12:00:00.000Z"
  },
  "capacity": {
    "maxVolume": 120,
    "currentLoad": 50
  },
  "location": "Lab B"
}
```

**成功响应** (200):

```json
{
  "success": true,
  "message": "设备信息更新成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "deviceId": "PRINTER-001",
    "type": "sla",
    "status": "busy",
    "currentTask": {
      "orderId": "507f1f77bcf86cd799439022",
      "startedAt": "2026-03-04T09:00:00.000Z",
      "estimatedCompletion": "2026-03-04T12:00:00.000Z"
    }
  }
}
```

---

### 6. 更新设备状态（专用端点）

**端点**: `PUT /api/devices/:id/status`

**路径参数**:
- `id`: 设备 MongoDB ObjectId

**请求体**:

```json
{
  "status": "busy",
  "currentTask": {
    "orderId": "507f1f77bcf86cd799439022",
    "startedAt": "2026-03-04T09:00:00.000Z",
    "estimatedCompletion": "2026-03-04T12:00:00.000Z"
  }
}
```

**必填字段**:
- `status`: 新状态（`idle`/`busy`/`maintenance`/`offline`）

**成功响应** (200):

```json
{
  "success": true,
  "message": "设备状态更新成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "deviceId": "PRINTER-001",
    "status": "busy"
  }
}
```

---

### 7. 分配任务到设备

**端点**: `POST /api/devices/:id/assign-task`

**路径参数**:
- `id`: 设备 MongoDB ObjectId

**请求体**:

```json
{
  "orderId": "507f1f77bcf86cd799439022",
  "estimatedCompletion": "2026-03-04T12:00:00.000Z"
}
```

**必填字段**:
- `orderId`: 订单 MongoDB ObjectId
- `estimatedCompletion`: 预计完成时间（ISO 8601 格式）

**前置条件**:
- 设备必须处于 `idle` 状态

**成功响应** (200):

```json
{
  "success": true,
  "message": "任务分配成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "deviceId": "PRINTER-001",
    "status": "busy",
    "currentTask": {
      "orderId": "507f1f77bcf86cd799439022",
      "startedAt": "2026-03-04T09:00:00.000Z",
      "estimatedCompletion": "2026-03-04T12:00:00.000Z"
    }
  }
}
```

**错误响应** (400):

```json
{
  "success": false,
  "error": {
    "code": "DEVICE_NOT_IDLE",
    "message": "设备当前状态为 busy，无法分配任务"
  }
}
```

---

### 8. 完成当前任务

**端点**: `POST /api/devices/:id/complete-task`

**路径参数**:
- `id`: 设备 MongoDB ObjectId

**前置条件**:
- 设备必须有正在执行的任务

**成功响应** (200):

```json
{
  "success": true,
  "message": "任务已完成",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "deviceId": "PRINTER-001",
    "status": "idle",
    "currentTask": null
  }
}
```

**错误响应** (400):

```json
{
  "success": false,
  "error": {
    "code": "NO_TASK_TO_COMPLETE",
    "message": "设备当前没有任务"
  }
}
```

---

### 9. 删除设备

**端点**: `DELETE /api/devices/:id`

**路径参数**:
- `id`: 设备 MongoDB ObjectId

**前置条件**:
- 设备不能处于 `busy` 状态

**成功响应** (200):

```json
{
  "success": true,
  "message": "设备已删除",
  "data": null
}
```

**错误响应** (400):

```json
{
  "success": false,
  "error": {
    "code": "CANNOT_DELETE_BUSY_DEVICE",
    "message": "无法删除正在运行任务的设备"
  }
}
```

---

## 错误码说明

| 错误码 | HTTP 状态码 | 描述 |
|--------|-----------|------|
| `DEVICE_ID_EXISTS` | 409 | 设备 ID 已存在 |
| `DEVICE_NOT_IDLE` | 400 | 设备不处于空闲状态 |
| `NO_TASK_TO_COMPLETE` | 400 | 设备没有任务可完成 |
| `CANNOT_DELETE_BUSY_DEVICE` | 400 | 无法删除繁忙设备 |
| `NOT_FOUND` | 404 | 设备不存在 |
| `VALIDATION_ERROR` | 400 | 参数验证失败 |

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述信息"
  }
}
```

---

## 最佳实践

### 1. 设备创建

```javascript
// ✅ 推荐：包含完整的设备信息
const device = {
  deviceId: 'PRINTER-001',
  type: 'sla',
  location: 'Lab A',
  capacity: { maxVolume: 100, currentLoad: 0 },
  specifications: {
    buildVolume: { x: 200, y: 200, z: 250 },
    resolution: '0.05mm',
    supportedMaterials: ['resin-standard']
  }
};

// ❌ 不推荐：只提供最少信息
const device = {
  deviceId: 'PRINTER-001',
  type: 'sla'
};
```

### 2. 状态管理

```javascript
// ✅ 推荐：使用专用端点更新状态
await axios.put(`/api/devices/${deviceId}/status`, {
  status: 'busy',
  currentTask: { orderId, estimatedCompletion }
});

// ✅ 推荐：任务完成后及时更新状态
await axios.post(`/api/devices/${deviceId}/complete-task`);

// ❌ 不推荐：手动管理状态而不更新 currentTask
await axios.patch(`/api/devices/${deviceId}`, {
  status: 'busy'
  // 缺少 currentTask
});
```

### 3. 任务分配

```javascript
// ✅ 推荐：检查设备状态后再分配
const { data } = await axios.get(`/api/devices/${deviceId}`);
if (data.data.status === 'idle') {
  await axios.post(`/api/devices/${deviceId}/assign-task`, {
    orderId: '507f1f77bcf86cd799439022',
    estimatedCompletion: new Date(Date.now() + 3600000).toISOString()
  });
}

// ❌ 不推荐：不检查状态直接分配
await axios.post(`/api/devices/${deviceId}/assign-task`, {
  orderId: '507f1f77bcf86cd799439022'
});
```

### 4. 设备查询

```javascript
// ✅ 推荐：使用筛选和分页
const { data } = await axios.get('/api/devices', {
  params: {
    status: 'idle',
    type: 'sla',
    page: 1,
    limit: 20
  }
});

// ✅ 推荐：获取可用设备使用专用端点
const { data } = await axios.get('/api/devices/available', {
  params: { type: 'sla' }
});

// ❌ 不推荐：获取所有设备再在客户端筛选
const { data } = await axios.get('/api/devices');
const idleDevices = data.data.filter(d => d.status === 'idle');
```

---

## 事件推送

设备状态变更时会通过 `AgentEventEmitter` 发射事件：

### 事件类型

```javascript
// 设备创建
{
  type: 'device_created',
  data: {
    deviceId: 'PRINTER-001',
    type: 'sla',
    status: 'idle',
    location: 'Lab A'
  }
}

// 设备状态变更
{
  type: 'device_changed',
  data: {
    deviceId: 'PRINTER-001',
    previousStatus: 'idle',
    currentStatus: 'busy',
    currentTask: {
      orderId: '507f1f77bcf86cd799439022',
      startedAt: '2026-03-04T09:00:00.000Z',
      estimatedCompletion: '2026-03-04T12:00:00.000Z'
    }
  }
}

// 设备删除
{
  type: 'device_deleted',
  data: {
    deviceId: 'PRINTER-001',
    type: 'sla',
    location: 'Lab A'
  }
}
```

### 监听事件

```javascript
const { agentEventEmitter } = require('./utils/AgentEventEmitter');

// 监听设备状态变更
agentEventEmitter.on('device_changed', (event) => {
  console.log(`设备 ${event.data.deviceId} 状态从 ${event.data.previousStatus} 变为 ${event.data.currentStatus}`);
});

// 监听所有设备事件
agentEventEmitter.on('agent_event', (event) => {
  if (event.type.startsWith('device_')) {
    console.log('设备事件:', event);
  }
});
```

---

## 测试指南

### 运行测试脚本

```bash
# 确保后端服务正在运行
npm run dev

# 在新终端运行测试
node scripts/test-device-api.js
```

### 测试覆盖

测试脚本覆盖以下场景：

1. ✅ 创建设备（多个设备）
2. ✅ 查询设备列表
3. ✅ 按状态筛选设备
4. ✅ 按类型筛选设备
5. ✅ 获取可用设备
6. ✅ 获取设备详情
7. ✅ 更新设备状态
8. ✅ 使用专用端点更新状态
9. ✅ 验证状态更新
10. ✅ 尝试删除繁忙设备（应失败）
11. ✅ 删除空闲设备

### 手动测试

使用 Postman 或 curl 进行手动测试：

```bash
# 创建设备
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "TEST-001",
    "type": "sla",
    "location": "Test Lab"
  }'

# 查询设备列表
curl http://localhost:3000/api/devices

# 获取可用设备
curl http://localhost:3000/api/devices/available
```

---

## 相关文件

- **路由文件**: `backend/src/routes/devices.js`
- **服务层**: `backend/src/services/DeviceService.js`
- **模型**: `backend/src/models/Device.js`
- **事件发射器**: `backend/src/utils/AgentEventEmitter.js`
- **测试脚本**: `backend/scripts/test-device-api.js`

---

## 更新日志

### v1.0.0 (2026-03-04)

- ✅ 实现完整的设备 CRUD API
- ✅ 实现设备状态管理
- ✅ 实现任务分配与完成功能
- ✅ 集成 AgentEventEmitter 事件推送
- ✅ 提供中文文档和测试脚本
