/**
 * Agent 决策 API 路由
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const AgentDecision = require('../models/AgentDecision');
const Order = require('../models/Order');
const { asyncHandler, NotFoundError, ValidationError } = require('../middleware/errorHandler');
const { responseMiddleware } = require('../utils/response');
const { agentRegistry } = require('../agents/registry');

router.use(responseMiddleware());

/**
 * POST /api/agents/decide
 * 触发 Agent 决策
 */
router.post('/decide', asyncHandler(async (req, res) => {
  const {
    orderId,
    agentId,
    decisionType,
    decisionResult,
    confidence,
    inputSnapshot,
    rationale,
    alternatives,
    impact
  } = req.body;
  
  if (!orderId) {
    throw new ValidationError('orderId 是必填字段');
  }
  
  if (!agentId) {
    throw new ValidationError('agentId 是必填字段');
  }
  
  if (!decisionType) {
    throw new ValidationError('decisionType 是必填字段');
  }
  
  const validTypes = [
    'device_selection',
    'material_selection',
    'print_parameter',
    'quality_check',
    'error_recovery',
    'scheduling'
  ];
  
  if (!validTypes.includes(decisionType)) {
    throw new ValidationError(`无效的决策类型，必须是以下之一：${validTypes.join(', ')}`);
  }
  
  if (!decisionResult) {
    throw new ValidationError('decisionResult 是必填字段');
  }
  
  if (!rationale) {
    throw new ValidationError('rationale 是必填字段');
  }
  
  if (!inputSnapshot || typeof inputSnapshot !== 'object') {
    throw new ValidationError('inputSnapshot 必须是对象');
  }
  
  const order = await Order.findById(orderId);
  if (!order) {
    throw new NotFoundError('订单不存在');
  }
  
  const decision = new AgentDecision({
    orderId,
    agentId,
    decisionType,
    decisionResult,
    confidence: confidence || 0.5,
    inputSnapshot,
    rationale,
    alternatives: alternatives || [],
    impact: impact || {}
  });
  
  await decision.save();
  
  await decision.linkToOrder();
  
  const populatedDecision = await AgentDecision.findById(decision._id)
    .populate('orderId');
  
  res.success(populatedDecision, 'Agent 决策记录成功', 201);
}));

/**
 * GET /api/agents/decisions/:orderId
 * 获取订单的决策历史
 */
router.get('/decisions/:orderId', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ValidationError('无效的订单 ID 格式');
  }
  
  const decisions = await AgentDecision.find({ orderId })
    .sort({ createdAt: -1 })
    .populate('orderId');
  
  res.success(decisions, '决策历史获取成功');
}));

/**
 * GET /api/agents/status
 * 获取 Agent 状态
 */
router.get('/status', asyncHandler(async (req, res) => {
  const { agentId } = req.query;
  
  const query = {};
  if (agentId) {
    query.agentId = agentId;
  }
  
  const totalDecisions = await AgentDecision.countDocuments(query);
  
  const decisionsByType = await AgentDecision.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$decisionType',
        count: { $sum: 1 },
        avgConfidence: { $avg: '$confidence' }
      }
    }
  ]);
  
  const lowConfidenceDecisions = await AgentDecision.find({ confidence: { $lt: 0.5 } })
    .limit(10)
    .sort({ createdAt: -1 });
  
  const recentDecisions = await AgentDecision.find(query)
    .limit(10)
    .sort({ createdAt: -1 })
    .populate('orderId');
  
  res.success({
    totalDecisions,
    decisionsByType,
    lowConfidenceCount: await AgentDecision.countDocuments({ confidence: { $lt: 0.5 }, ...query }),
    lowConfidenceDecisions,
    recentDecisions
  }, 'Agent 状态获取成功');
}));

/**
 * GET /api/agents/coordinator/decision
 * 手动触决策评估
 */
router.post('/coordinator/decision', asyncHandler(async (req, res) => {
  const { orderId, context = {} } = req.body;
  
  if (!orderId) {
    throw new ValidationError('orderId 是必填字段');
  }
  
  const coordinator = agentRegistry.get('coordinator_agent');
  
  if (!coordinator) {
    throw new NotFoundError('协调 Agent 未就绪');
  }
  
  const decision = await coordinator.execute({
    type: 'make_decision',
    orderId,
    context
  });
  
  res.success(decision, '决策评估完成');
}));

/**
 * POST /api/agents/schedule
 * 请求设备分配
 */
router.post('/schedule', asyncHandler(async (req, res) => {
  const { orderId, strategy } = req.body;
  
  if (!orderId) {
    throw new ValidationError('orderId 是必填字段');
  }
  
  const scheduler = agentRegistry.get('scheduler_agent');
  
  if (!scheduler) {
    throw new NotFoundError('调度 Agent 未就绪');
  }
  
  const result = await scheduler.execute({
    type: 'schedule_device',
    orderId,
    strategy
  });
  
  res.success(result, '设备分配完成');
}));

/**
 * GET /api/agents/schedule/:orderId
 * 查询分配结果
 */
router.get('/schedule/:orderId', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  
  const scheduler = agentRegistry.get('scheduler_agent');
  
  if (!scheduler) {
    throw new NotFoundError('调度 Agent 未就绪');
  }
  
  const tasks = scheduler.getSchedulingTasks({ orderId });
  
  res.success({
    orderId,
    tasks: tasks.map(task => ({
      id: task.id,
      type: task.type,
      status: task.status,
      startTime: task.startTime,
      endTime: task.endTime,
      result: task.result
    }))
  }, '分配结果查询成功');
}));

/**
 * GET /api/agents/devices/available
 * 获取可用设备列表
 */
router.get('/devices/available', asyncHandler(async (req, res) => {
  const { deviceType } = req.query;
  
  const scheduler = agentRegistry.get('scheduler_agent');
  
  if (!scheduler) {
    const devices = await Device.find({
      status: { $nin: ['maintenance', 'offline'] },
      ...(deviceType && { type: deviceType })
    }).sort({ 'capacity.currentLoad': 1 });
    
    return res.success({
      count: devices.length,
      devices: devices.map(device => ({
        deviceId: device.deviceId,
        type: device.type,
        status: device.status,
        location: device.location,
        currentLoad: device.capacity?.currentLoad || 0,
        specifications: device.specifications
      }))
    }, '可用设备列表获取成功');
  }
  
  const result = await scheduler.execute({
    type: 'query_available',
    deviceType
  });
  
  res.success(result, '可用设备列表获取成功');
}));

/**
 * POST /api/agents/schedule/batch
 * 批量分配设备
 */
router.post('/schedule/batch', asyncHandler(async (req, res) => {
  const { orderIds, strategy } = req.body;
  
  if (!orderIds || !Array.isArray(orderIds)) {
    throw new ValidationError('orderIds 必须是数组');
  }
  
  const scheduler = agentRegistry.get('scheduler_agent');
  
  if (!scheduler) {
    throw new NotFoundError('调度 Agent 未就绪');
  }
  
  const result = await scheduler.execute({
    type: 'batch_allocate',
    orderIds,
    strategy
  });
  
  res.success(result, '批量分配完成');
}));

/**
 * GET /api/agents/scheduler/status
 * 获取调度 Agent 状态
 */
router.get('/scheduler/status', asyncHandler(async (req, res) => {
  const scheduler = agentRegistry.get('scheduler_agent');
  
  if (!scheduler) {
    throw new NotFoundError('调度 Agent 未就绪');
  }
  
  const stats = scheduler.getStats();
  
  res.success(stats, '调度 Agent 状态获取成功');
}));

/**
 * GET /api/agents/coordination/:orderId
 * 查询订单协调状态
 */
router.get('/coordination/:orderId', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ValidationError('无效的订单 ID 格式');
  }
  
  // 获取协调 Agent
  const coordinator = agentRegistry.get('coordinator_agent');
  
  if (!coordinator) {
    throw new NotFoundError('协调 Agent 未就绪');
  }
  
  // 查询协调状态
  const result = await coordinator.execute({
    type: 'query_status',
    orderId
  });
  
  res.success(result, '协调状态查询成功');
}));

/**
 * GET /api/agents/coordinator/status
 * 获取协调 Agent 状态
 */
router.get('/coordinator/status', asyncHandler(async (req, res) => {
  // 获取协调 Agent
  const coordinator = agentRegistry.get('coordinator_agent');
  
  if (!coordinator) {
    throw new NotFoundError('协调 Agent 未就绪');
  }
  
  // 获取统计信息
  const stats = coordinator.getStats();
  
  res.success(stats, '协调 Agent 状态获取成功');
}));

/**
 * POST /api/agents/coordinator/decision
 * 手动触决策评估
 */
router.post('/coordinator/decision', asyncHandler(async (req, res) => {
  const { orderId, context = {} } = req.body;
  
  if (!orderId) {
    throw new ValidationError('orderId 是必填字段');
  }
  
  // 获取协调 Agent
  const coordinator = agentRegistry.get('coordinator_agent');
  
  if (!coordinator) {
    throw new NotFoundError('协调 Agent 未就绪');
  }
  
  // 执行决策
  const decision = await coordinator.execute({
    type: 'make_decision',
    orderId,
    context
  });
  
  res.success(decision, '决策评估完成');
}));

/**
 * POST /api/agents/inventory/check
 * 检查库存
 */
router.post('/inventory/check', asyncHandler(async (req, res) => {
  const { materialId, requiredAmount } = req.body;
  
  const inventory = agentRegistry.get('inventory_agent');
  
  if (!inventory) {
    throw new NotFoundError('库存 Agent 未就绪');
  }
  
  const result = await inventory.execute({
    type: 'check_inventory',
    materialId,
    requiredAmount
  });
  
  res.success(result, '库存检查完成');
}));

/**
 * GET /api/agents/inventory/forecast
 * 获取消耗预测
 */
router.get('/inventory/forecast', asyncHandler(async (req, res) => {
  const { materialId, forecastDays, method } = req.query;
  
  const inventory = agentRegistry.get('inventory_agent');
  
  if (!inventory) {
    throw new NotFoundError('库存 Agent 未就绪');
  }
  
  const result = await inventory.execute({
    type: 'forecast_consumption',
    materialId,
    forecastDays: forecastDays ? parseInt(forecastDays) : null,
    method
  });
  
  res.success(result, '消耗预测获取成功');
}));

/**
 * GET /api/agents/inventory/reorder-suggestions
 * 获取补货建议
 */
router.get('/inventory/reorder-suggestions', asyncHandler(async (req, res) => {
  const { materialId } = req.query;
  
  const inventory = agentRegistry.get('inventory_agent');
  
  if (!inventory) {
    throw new NotFoundError('库存 Agent 未就绪');
  }
  
  const result = await inventory.execute({
    type: 'reorder_suggestion',
    materialId
  });
  
  res.success(result, '补货建议获取成功');
}));

/**
 * GET /api/agents/inventory/low-stock
 * 获取低库存材料列表
 */
router.get('/inventory/low-stock', asyncHandler(async (req, res) => {
  const { includeCritical } = req.query;
  
  const inventory = agentRegistry.get('inventory_agent');
  
  if (!inventory) {
    throw new NotFoundError('库存 Agent 未就绪');
  }
  
  const result = await inventory.execute({
    type: 'low_stock_check',
    includeCritical: includeCritical !== 'false'
  });
  
  res.success(result, '低库存材料列表获取成功');
}));

/**
 * POST /api/agents/inventory/compatibility
 * 检查材料兼容性
 */
router.post('/inventory/compatibility', asyncHandler(async (req, res) => {
  const { materialId, deviceId } = req.body;
  
  if (!materialId || !deviceId) {
    throw new ValidationError('materialId 和 deviceId 是必填字段');
  }
  
  const inventory = agentRegistry.get('inventory_agent');
  
  if (!inventory) {
    throw new NotFoundError('库存 Agent 未就绪');
  }
  
  const result = await inventory.execute({
    type: 'material_compatibility',
    materialId,
    deviceId
  });
  
  res.success(result, '材料兼容性检查完成');
}));

/**
 * GET /api/agents/inventory/status
 * 获取库存 Agent 状态
 */
router.get('/inventory/status', asyncHandler(async (req, res) => {
  const inventory = agentRegistry.get('inventory_agent');
  
  if (!inventory) {
    throw new NotFoundError('库存 Agent 未就绪');
  }
  
  const stats = inventory.getStats();
  
  res.success(stats, '库存 Agent 状态获取成功');
}));

module.exports = router;
