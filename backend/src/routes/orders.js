/**
 * 订单管理 API 路由
 * 
 * 处理订单的创建、查询、状态更新、取消等操作
 * 集成 OrderService 进行业务逻辑处理
 * 集成状态机管理状态流转
 * 集成队列进行异步处理
 * 集成 Agent 进行智能决策
 */

const express = require('express');
const router = express.Router();
const { orderService } = require('../services/OrderService');
const { agentRegistry } = require('../agents/registry');
const { asyncHandler, NotFoundError, ValidationError, AppError } = require('../middleware/errorHandler');
const { responseMiddleware } = require('../utils/response');

// 使用全局 Agent 注册中心（在 app.js 中初始化）
orderService.setAgentRegistry(agentRegistry);

// 使用响应中间件
router.use(responseMiddleware());

/**
 * POST /api/orders
 * 创建新订单
 * 
 * 请求体：
 * {
 *   userId: "user_xxx",
 *   photos: ["url1", "url2"],
 *   deviceType: "sla",
 *   material: "resin-standard",
 *   quantity: 1,
 *   specifications: {...},
 *   totalPrice: 299.00
 * }
 */
router.post('/', asyncHandler(async (req, res) => {
  const orderData = req.body;
  
  // 创建订单
  const order = await orderService.createOrder(orderData);
  
  res.success(
    {
      orderId: order._id.toString(),
      status: order.status,
      statusLabel: order.stateMachineStatus?.currentStateLabel || '待审核',
      order
    },
    '订单创建成功，已进入审核队列',
    201
  );
}));

/**
 * GET /api/orders
 * 获取订单列表（支持筛选、分页、排序）
 * 
 * 查询参数：
 * - status: 状态筛选（pending_review, reviewing, scheduled, printing, post_processing, completed, shipped, cancelled, refunded）
 * - userId: 用户 ID 筛选
 * - deviceType: 设备类型筛选
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 20）
 * - sortBy: 排序字段（默认 createdAt）
 * - sortOrder: 排序方向（asc/desc，默认 desc）
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    status,
    userId,
    deviceType,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;
  
  const filters = {};
  if (status) filters.status = status;
  if (userId) filters.userId = userId;
  if (deviceType) filters.deviceType = deviceType;
  
  const pagination = {
    page: parseInt(page),
    limit: parseInt(limit)
  };
  
  const sorting = {
    sortBy,
    sortOrder: sortOrder === 'asc' ? 'asc' : 'desc'
  };
  
  const result = await orderService.getOrders(filters, pagination, sorting);
  
  res.paginated(
    result.orders,
    {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      pages: result.pagination.pages
    },
    '订单列表获取成功'
  );
}));

/**
 * GET /api/orders/:orderId
 * 获取订单详情
 * 
 * 路径参数：
 * - orderId: 订单 ID
 */
router.get('/:orderId', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  
  const order = await orderService.getOrderById(orderId);
  
  res.success(order, '订单详情获取成功');
}));

/**
 * PATCH /api/orders/:orderId/status
 * 更新订单状态
 * 
 * 请求体：
 * {
 *   status: "reviewing",
 *   reason: "开始审核"
 * }
 * 
 * 可用状态：
 * - pending_review: 待审核
 * - reviewing: 审核中
 * - scheduled: 已排程
 * - printing: 打印中
 * - post_processing: 后处理
 * - completed: 已完成
 * - shipped: 已发货
 * - cancelled: 已取消
 * - refunded: 已退款
 */
router.patch('/:orderId/status', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status, reason, operator } = req.body;
  
  if (!status) {
    throw new ValidationError('status 字段是必填项');
  }
  
  const context = {};
  if (reason) context.reason = reason;
  if (operator) context.operator = operator;
  
  const result = await orderService.updateOrderStatus(orderId, status, context);
  
  res.success(result, `订单状态已更新为 ${result.currentStatusLabel}`);
}));

/**
 * DELETE /api/orders/:orderId
 * 取消订单
 * 
 * 请求体（可选）：
 * {
 *   reason: "客户申请退款"
 * }
 * 
 * 注意：
 * - 已完成、已发货、已取消的订单无法取消
 */
router.delete('/:orderId', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  
  const cancelReason = reason || '用户取消订单';
  
  const result = await orderService.cancelOrder(orderId, cancelReason);
  
  res.success(result, '订单已取消');
}));

/**
 * POST /api/orders/:orderId/process
 * 触发订单处理（加入队列）
 * 
 * 用于手动触发订单处理流程
 * 通常订单创建后会自动加入队列，此接口用于重新处理或手动触发
 */
router.post('/:orderId/process', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  
  const result = await orderService.processOrder(orderId);
  
  res.success(result, '订单已加入处理队列');
}));

/**
 * GET /api/orders/user/:userId
 * 查询用户的所有订单
 * 
 * 路径参数：
 * - userId: 用户 ID
 * 
 * 查询参数：
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 20）
 * - sortBy: 排序字段（默认 createdAt）
 * - sortOrder: 排序方向（asc/desc，默认 desc）
 */
router.get('/user/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;
  
  const pagination = {
    page: parseInt(page),
    limit: parseInt(limit)
  };
  
  const sorting = {
    sortBy,
    sortOrder: sortOrder === 'asc' ? 'asc' : 'desc'
  };
  
  const result = await orderService.getUserOrders(userId, pagination, sorting);
  
  res.paginated(
    result.orders,
    {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      pages: result.pagination.pages
    },
    '用户订单列表获取成功'
  );
}));

/**
 * GET /api/orders/stats
 * 获取订单统计信息
 * 
 * 查询参数：
 * - startDate: 开始日期（ISO 格式）
 * - endDate: 结束日期（ISO 格式）
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  
  const stats = await orderService.getOrderStats(filters);
  
  res.success(stats, '订单统计信息获取成功');
}));

/**
 * POST /api/orders/batch
 * 批量查询订单（按 ID 列表）
 * 
 * 请求体：
 * {
 *   orderIds: ["order_id_1", "order_id_2", ...]
 * }
 */
router.post('/batch', asyncHandler(async (req, res) => {
  const { orderIds } = req.body;
  
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new ValidationError('orderIds 必须是非空数组');
  }
  
  const orders = await orderService.getOrdersByIds(orderIds);
  
  res.success(
    { orders, count: orders.length },
    `批量查询成功，共 ${orders.length} 个订单`
  );
}));

/**
 * PUT /api/orders/:orderId
 * 完整更新订单信息
 */
router.put('/:orderId', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const updateData = req.body;
  
  const order = await orderService.updateOrder(orderId, updateData);
  
  res.success(order, '订单更新成功');
}));

/**
 * POST /api/orders/:orderId/assign
 * 分配订单到设备
 */
router.post('/:orderId/assign', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { deviceId } = req.body;
  
  if (!deviceId) {
    throw new ValidationError('deviceId 是必填字段');
  }
  
  const result = await orderService.assignOrderToDevice(orderId, deviceId);
  
  res.success(result, '分配成功');
}));

module.exports = router;
