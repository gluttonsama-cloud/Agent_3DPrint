# 订单管理 API 指南

> 版本：v1.0.0  
> 最后更新：2026-03-04

本文档介绍 3D 打印订单管理系统的 API 接口，包括订单创建、查询、状态更新、取消等操作的完整说明。

## 目录

- [概述](#概述)
- [API 端点列表](#api-端点列表)
- [请求/响应示例](#请求响应示例)
- [状态流转说明](#状态流转说明)
- [错误码说明](#错误码说明)
- [认证说明](#认证说明)
- [最佳实践](#最佳实践)

---

## 概述

订单管理 API 提供完整的订单生命周期管理功能，包括：

- **订单创建**：创建新的 3D 打印订单
- **订单查询**：查询订单列表和详情
- **状态管理**：更新订单状态（基于状态机）
- **订单取消**：取消未完成的订单
- **队列处理**：异步处理订单（集成 Bull 队列）
- **Agent 集成**：智能决策（集成协调 Agent）

### 技术架构

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│   Client    │ ───> │  Express API │ ───> │  OrderService   │
└─────────────┘      └──────────────┘      └────────┬────────┘
                                                    │
                     ┌──────────────────────────────┼──────────────────────────────┐
                     │                              │                              │
                     ▼                              ▼                              ▼
           ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
           │ OrderStateMachine│           │   orderQueue    │           │ CoordinatorAgent│
           │  (状态管理)     │           │   (异步处理)    │           │  (智能决策)     │
           └─────────────────┘           └─────────────────┘           └─────────────────┘
```

### 订单状态

| 状态 | 值 | 说明 |
|------|-----|------|
| 待审核 | `pending_review` | 订单刚创建，等待管理员审核 |
| 审核中 | `reviewing` | 管理员正在审核订单详情 |
| 已排程 | `scheduled` | 审核通过，已安排打印计划 |
| 打印中 | `printing` | 3D 打印机正在执行打印任务 |
| 后处理 | `post_processing` | 打印完成，正在进行后处理 |
| 已完成 | `completed` | 所有处理完成，等待发货 |
| 已发货 | `shipped` | 订单已发货给客户 |
| 已取消 | `cancelled` | 订单被取消（审核拒绝或客户取消） |
| 已退款 | `refunded` | 订单已完成退款流程 |

---

## API 端点列表

### 基础信息

- **基础 URL**: `http://localhost:3000/api`
- **Content-Type**: `application/json`

### 端点概览

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/orders` | 创建新订单 |
| GET | `/api/orders` | 查询订单列表 |
| GET | `/api/orders/:orderId` | 查询订单详情 |
| PATCH | `/api/orders/:orderId/status` | 更新订单状态 |
| DELETE | `/api/orders/:orderId` | 取消订单 |
| POST | `/api/orders/:orderId/process` | 触发订单处理 |
| GET | `/api/orders/user/:userId` | 查询用户订单 |
| GET | `/api/orders/stats` | 获取订单统计 |
| POST | `/api/orders/batch` | 批量查询订单 |

---

## 请求/响应示例

### 1. 创建订单

**请求**

```http
POST /api/orders
Content-Type: application/json

{
  "userId": "507f1f77bcf86cd799439011",
  "photos": [
    "https://example.com/photo1.jpg",
    "https://example.com/photo2.jpg"
  ],
  "deviceType": "sla",
  "material": "resin-standard",
  "quantity": 1,
  "specifications": {
    "scale": 1.0,
    "orientation": "upright"
  },
  "totalPrice": 299.00
}
```

**响应（成功）**

```json
{
  "success": true,
  "message": "订单创建成功，已进入审核队列",
  "data": {
    "orderId": "65e1234567890abcdef12345",
    "status": "pending_review",
    "statusLabel": "待审核",
    "order": {
      "_id": "65e1234567890abcdef12345",
      "userId": "507f1f77bcf86cd799439011",
      "items": [
        {
          "quantity": 1,
          "unitPrice": 299,
          "specifications": {
            "deviceType": "sla",
            "materialType": "resin-standard"
          }
        }
      ],
      "totalPrice": 299,
      "status": "pending_review",
      "metadata": {
        "sourcePhotos": [
          "https://example.com/photo1.jpg",
          "https://example.com/photo2.jpg"
        ],
        "deviceType": "sla",
        "materialType": "resin-standard"
      },
      "createdAt": "2026-03-04T10:00:00.000Z",
      "updatedAt": "2026-03-04T10:00:00.000Z"
    }
  }
}
```

**响应（失败）**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "userId 是必填字段"
  }
}
```

---

### 2. 查询订单列表

**请求**

```http
GET /api/orders?page=1&limit=20&status=pending_review&sortBy=createdAt&sortOrder=desc
```

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| limit | number | 20 | 每页数量 |
| status | string | - | 状态筛选 |
| userId | string | - | 用户 ID 筛选 |
| deviceType | string | - | 设备类型筛选 |
| sortBy | string | createdAt | 排序字段 |
| sortOrder | string | desc | 排序方向（asc/desc） |

**响应**

```json
{
  "success": true,
  "message": "订单列表获取成功",
  "data": [
    {
      "_id": "65e1234567890abcdef12345",
      "userId": "507f1f77bcf86cd799439011",
      "status": "pending_review",
      "totalPrice": 299,
      "createdAt": "2026-03-04T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

### 3. 查询订单详情

**请求**

```http
GET /api/orders/65e1234567890abcdef12345
```

**响应**

```json
{
  "success": true,
  "message": "订单详情获取成功",
  "data": {
    "_id": "65e1234567890abcdef12345",
    "userId": "507f1f77bcf86cd799439011",
    "items": [
      {
        "quantity": 1,
        "unitPrice": 299,
        "specifications": {
          "deviceType": "sla",
          "materialType": "resin-standard"
        }
      }
    ],
    "totalPrice": 299,
    "status": "pending_review",
    "agentDecisions": [],
    "metadata": {
      "sourcePhotos": [
        "https://example.com/photo1.jpg",
        "https://example.com/photo2.jpg"
      ]
    },
    "stateMachineStatus": {
      "currentState": "pending_review",
      "currentStateLabel": "待审核",
      "isTerminal": false,
      "canContinue": true,
      "availableActions": [
        { "toState": "reviewing", "action": "start_review", "label": "开始审核" }
      ]
    }
  }
}
```

---

### 4. 更新订单状态

**请求**

```http
PATCH /api/orders/65e1234567890abcdef12345/status
Content-Type: application/json

{
  "status": "reviewing",
  "reason": "开始审核",
  "operator": "admin_user"
}
```

**响应**

```json
{
  "success": true,
  "message": "订单状态已更新为 审核中",
  "data": {
    "orderId": "65e1234567890abcdef12345",
    "previousStatus": "pending_review",
    "currentStatus": "reviewing",
    "previousStatusLabel": "待审核",
    "currentStatusLabel": "审核中",
    "stateMachine": {
      "orderId": "65e1234567890abcdef12345",
      "currentState": "reviewing",
      "currentStateLabel": "审核中",
      "isTerminal": false,
      "canContinue": true
    }
  }
}
```

---

### 5. 取消订单

**请求**

```http
DELETE /api/orders/65e1234567890abcdef12345
Content-Type: application/json

{
  "reason": "客户申请退款"
}
```

**响应**

```json
{
  "success": true,
  "message": "订单已取消",
  "data": {
    "orderId": "65e1234567890abcdef12345",
    "status": "cancelled",
    "statusLabel": "已取消",
    "reason": "客户申请退款",
    "cancelledAt": "2026-03-04T12:00:00.000Z"
  }
}
```

---

### 6. 触发订单处理

**请求**

```http
POST /api/orders/65e1234567890abcdef12345/process
```

**响应**

```json
{
  "success": true,
  "message": "订单已加入处理队列",
  "data": {
    "orderId": "65e1234567890abcdef12345",
    "jobId": "order-processing-65e1234567890abcdef12345",
    "status": "queued",
    "queuedAt": "2026-03-04T10:00:00.000Z"
  }
}
```

---

### 7. 查询用户订单

**请求**

```http
GET /api/orders/user/507f1f77bcf86cd799439011?page=1&limit=20
```

**响应**

```json
{
  "success": true,
  "message": "用户订单列表获取成功",
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "pages": 1
  }
}
```

---

### 8. 获取订单统计

**请求**

```http
GET /api/orders/stats?startDate=2026-01-01&endDate=2026-12-31
```

**响应**

```json
{
  "success": true,
  "message": "订单统计信息获取成功",
  "data": {
    "totalOrders": 150,
    "totalRevenue": 45000,
    "byStatus": {
      "pending_review": {
        "count": 10,
        "totalRevenue": 3000,
        "label": "待审核"
      },
      "reviewing": {
        "count": 5,
        "totalRevenue": 1500,
        "label": "审核中"
      },
      "completed": {
        "count": 100,
        "totalRevenue": 30000,
        "label": "已完成"
      }
    }
  }
}
```

---

## 状态流转说明

### 状态流转图

```
┌─────────────────┐
│  pending_review │ ──┐
│    (待审核)     │    │
└────────┬────────┘    │
         │              │
         ▼              │
┌─────────────────┐     │
│    reviewing    │     │
│    (审核中)     │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│    scheduled    │     │
│    (已排程)     │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│    printing     │     │
│    (打印中)     │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│ post_processing │     │
│   (后处理)      │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │      ┌──────────────┐
│    completed    │─────┼─────>│   shipped    │
│    (已完成)     │     │      │  (已发货)    │
└─────────────────┘     │      └──────────────┘
                        │
         ┌──────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│    cancelled    │<────│   refunded   │
│    (已取消)     │     │  (已退款)    │
└─────────────────┘     └──────────────┘
```

### 状态转换规则

| 当前状态 | 允许转换到的状态 |
|----------|-----------------|
| `pending_review` | `reviewing`, `cancelled` |
| `reviewing` | `scheduled`, `cancelled` |
| `scheduled` | `printing`, `cancelled` |
| `printing` | `post_processing`, `failed` |
| `post_processing` | `completed`, `failed` |
| `completed` | `shipped`, `cancelled` |
| `shipped` | `cancelled` (仅退款场景) |
| `cancelled` | `refunded` |
| `refunded` | (终端状态) |

### 状态机集成

系统使用 `OrderStateMachine` 管理状态流转，确保所有状态变更都符合业务规则：

```javascript
const { createOrderStateMachine } = require('../states/OrderStateMachine');

// 创建状态机
const stateMachine = createOrderStateMachine(orderId, currentStatus);

// 检查是否可以转换
if (stateMachine.canTransition('reviewing')) {
  // 执行转换
  await stateMachine.transition('reviewing', {
    reason: '开始审核',
    operator: 'admin_user'
  });
}
```

---

## 错误码说明

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 资源创建成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如重复取消） |
| 500 | 服务器内部错误 |

### 业务错误码

| 错误码 | 说明 | HTTP 状态码 |
|--------|------|------------|
| `VALIDATION_ERROR` | 参数验证失败 | 400 |
| `NOT_FOUND` | 资源不存在 | 404 |
| `INVALID_STATUS_TRANSITION` | 无效的状态转换 | 400 |
| `CANNOT_CANCEL_COMPLETED_ORDER` | 已完成的订单无法取消 | 400 |
| `ORDER_ALREADY_CANCELLED` | 订单已取消 | 400 |
| `CANNOT_CANCEL_SHIPPED_ORDER` | 已发货的订单无法取消 | 400 |
| `CANNOT_CANCEL_CURRENT_STATE` | 当前状态无法取消 | 400 |
| `CANNOT_PROCESS_CURRENT_STATE` | 当前状态无法处理 | 400 |

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "订单状态不能从 待审核 变更为 打印中",
    "details": {
      "fromState": "pending_review",
      "toState": "printing"
    }
  }
}
```

---

## 认证说明

### 当前实现

当前 API 实现**不包含**身份验证层。在生产环境中，建议添加以下认证机制：

1. **JWT Token 认证**：用户登录后获取 token，后续请求携带 token
2. **API Key 认证**：服务间调用使用 API Key
3. **Session 认证**：基于 Cookie 的 Session 管理

### 建议实现

```javascript
// 中间件示例
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '未提供认证 token' }
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: '无效的 token' }
    });
  }
};

// 路由使用
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  // req.user 包含用户信息
}));
```

---

## 最佳实践

### 1. 订单创建

- **验证用户 ID**：确保 userId 是有效的 MongoDB ObjectId
- **照片 URL 验证**：建议使用七牛云等对象存储的 URL
- **价格计算**：在前端计算总价，后端进行二次验证
- **规格参数**：使用 specifications 对象存储自定义参数

### 2. 状态管理

- **使用状态机**：始终通过状态机进行状态变更，不要直接修改数据库
- **记录变更历史**：每次状态变更都应记录原因和操作者
- **终端状态保护**：已完成、已取消等终端状态不可逆

### 3. 错误处理

- **统一错误格式**：使用标准错误响应格式
- **友好错误消息**：错误消息应清晰描述问题
- **错误日志**：服务器端记录详细错误日志用于排查

### 4. 性能优化

- **分页查询**：列表查询始终使用分页
- **索引优化**：确保常用查询字段有索引
- **populate 优化**：只 populate 需要的字段

### 5. 队列处理

- **异步处理**：订单创建后自动加入队列
- **重试机制**：队列配置自动重试
- **进度跟踪**：使用 `updateOrderProgress` 更新处理进度

### 6. Agent 集成

- **异步调用**：Agent 决策不阻塞订单创建
- **降级处理**：Agent 不可用时使用默认逻辑
- **决策记录**：所有 Agent 决策都应记录到数据库

---

## 测试

### 运行测试脚本

```bash
# 设置环境变量
export BASE_URL=http://localhost:3000/api
export TEST_USER_ID=507f1f77bcf86cd799439011

# 运行测试
node scripts/test-order-api.js
```

### 测试用例

1. ✅ 创建订单
2. ✅ 查询订单列表
3. ✅ 查询订单详情
4. ✅ 更新订单状态
5. ✅ 触发订单处理
6. ✅ 查询订单统计
7. ✅ 查询无效订单 ID（错误处理）
8. ✅ 取消订单
9. ✅ 重复取消订单（错误处理）

---

## 相关文件

- **路由**: `backend/src/routes/orders.js`
- **服务**: `backend/src/services/OrderService.js`
- **模型**: `backend/src/models/Order.js`
- **状态机**: `backend/src/states/OrderStateMachine.js`
- **队列**: `backend/src/queues/orderQueue.js`
- **Agent**: `backend/src/agents/CoordinatorAgent.js`

---

## 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0.0 | 2026-03-04 | 初始版本，包含完整 CRUD 和状态机集成 |
