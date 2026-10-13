/**
 * Agent 决策 API 路由
 * 
 * 提供触发 Agent 决策、查询决策历史、获取决策解释等功能
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const AgentDecision = require('../models/AgentDecision');
const Order = require('../models/Order');
const { agentDecisionService, AgentType } = require('../services/AgentDecisionService');
const { asyncHandler, NotFoundError, ValidationError } = require('../middleware/errorHandler');
const { agentRegistry } = require('../agents/registry');

/**
 * POST /api/agent-decisions/decide
 * 触发 Agent 决策
 * 
 * @body {string} agentType - Agent 类型：coordinator/scheduler/inventory
 * @body {string} action - 决策动作
 * @body {Object} data - 决策数据
 */
router.post('/decide', asyncHandler(async (req, res) => {
  const { agentType, action, data } = req.body;

  if (!agentType) {
    throw new ValidationError('agentType 是必填字段');
  }

  if (!action) {
    throw new ValidationError('action 是必填字段');
  }

  if (!data || typeof data !== 'object') {
    throw new ValidationError('data 必须是对象');
  }

  // 触发 Agent 决策
  const result = await agentDecisionService.triggerDecision(agentType, action, data);

  res.status(201).json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/agent-decisions
 * 获取 Agent 决策历史列表
 * 
 * @query {number} limit - 每页数量（默认 50）
 * @query {number} page - 页码（默认 1）
 */
router.get('/', asyncHandler(async (req, res) => {
  const { limit = 50, page = 1 } = req.query;

  const query = {};
  const options = {
    sort: { createdAt: -1 },
    skip: (parseInt(page) - 1) * parseInt(limit),
    limit: parseInt(limit)
  };

  // 如果是 Mock 模式，返回空数组
  if (process.env.MOCK_DB === 'true') {
    return res.json({
      success: true,
      data: [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 0,
        totalPages: 0
      },
      message: 'Mock 模式下无历史数据'
    });
  }

  const decisions = await AgentDecision.find(query)
    .sort(options.sort)
    .skip(options.skip)
    .limit(options.limit);

  const total = await AgentDecision.countDocuments(query);

  res.paginated(decisions, {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
    totalPages: Math.ceil(total / parseInt(limit))
  }, 'Agent 决策历史获取成功');
}));

/**
 * GET /api/agent-decisions/order/:orderId
 * 查询订单的决策历史
 * 
 * @param {string} orderId - 订单 ID
 * @query {number} limit - 返回数量限制（默认 50）
 * @query {string} sort - 排序方式 asc/desc（默认 desc）
 */
router.get('/order/:orderId', asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { limit, sort } = req.query;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ValidationError('无效的订单 ID 格式');
  }

  const decisions = await agentDecisionService.getDecisionsByOrder(orderId, {
    limit: limit ? parseInt(limit) : 50,
    sort
  });

  res.json({
    success: true,
    data: {
      orderId,
      decisions
    }
  });
}));

/**
 * GET /api/agent-decisions/agent/:agentId
 * 查询特定 Agent 的决策
 * 
 * @param {string} agentId - Agent ID
 * @query {string} decisionType - 决策类型过滤
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {number} limit - 返回数量限制（默认 20）
 */
router.get('/agent/:agentId', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { decisionType, startTime, endTime, limit } = req.query;

  if (!agentId) {
    throw new ValidationError('Agent ID 不能为空');
  }

  const decisions = await agentDecisionService.getDecisionsByAgent(agentId, {
    decisionType,
    startTime,
    endTime,
    limit: limit ? parseInt(limit) : 20
  });

  res.json({
    success: true,
    data: {
      agentId,
      count: decisions.length,
      decisions
    }
  });
}));

/**
 * GET /api/agent-decisions/:decisionId
 * 查询决策详情
 * 
 * @param {string} decisionId - 决策 ID
 */
router.get('/:decisionId', asyncHandler(async (req, res) => {
  const { decisionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(decisionId)) {
    throw new ValidationError('无效的决策 ID 格式');
  }

  const decision = await agentDecisionService.getDecisionById(decisionId);

  res.json({
    success: true,
    data: decision
  });
}));

/**
 * GET /api/agent-decisions/:decisionId/explanation
 * 获取决策解释
 * 
 * @param {string} decisionId - 决策 ID
 */
router.get('/:decisionId/explanation', asyncHandler(async (req, res) => {
  const { decisionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(decisionId)) {
    throw new ValidationError('无效的决策 ID 格式');
  }

  const explanation = await agentDecisionService.getDecisionExplanation(decisionId);

  res.json({
    success: true,
    data: explanation
  });
}));

/**
 * GET /api/agent-decisions/low-confidence
 * 获取低置信度决策
 * 
 * @query {number} threshold - 置信度阈值（默认 0.5）
 * @query {number} limit - 返回数量限制（默认 50）
 */
router.get('/low-confidence', asyncHandler(async (req, res) => {
  const { threshold, limit } = req.query;

  const decisions = await agentDecisionService.getLowConfidenceDecisions(
    threshold ? parseFloat(threshold) : null,
    {
      limit: limit ? parseInt(limit) : 50
    }
  );

  res.json({
    success: true,
    data: {
      threshold: threshold || 0.5,
      count: decisions.length,
      decisions
    }
  });
}));

/**
 * GET /api/agent-decisions/stats
 * 获取决策统计信息
 * 
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {string} agentId - Agent ID 过滤
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const { startTime, endTime, agentId } = req.query;

  const stats = await agentDecisionService.getDecisionStats({
    startTime,
    endTime,
    agentId
  });

  res.json({
    success: true,
    data: stats
  });
}));

/**
 * POST /api/agent-decisions/batch-record
 * 批量记录决策
 * 
 * @body {Array} decisions - 决策数据数组
 */
router.post('/batch-record', asyncHandler(async (req, res) => {
  const { decisions } = req.body;

  if (!decisions || !Array.isArray(decisions)) {
    throw new ValidationError('decisions 必须是数组');
  }

  const results = await agentDecisionService.recordBatchDecisions(decisions);

  res.status(201).json({
    success: true,
    data: {
      total: decisions.length,
      recorded: results.length
    }
  });
}));

/**
 * GET /api/agent-decisions/coordinator/status
 * 获取协调 Agent 状态
 */
router.get('/coordinator/status', asyncHandler(async (req, res) => {
  const coordinator = agentRegistry.get('coordinator_agent');

  if (!coordinator) {
    throw new NotFoundError('协调 Agent 未就绪');
  }

  const stats = coordinator.getStats();

  res.json({
    success: true,
    data: stats
  });
}));

/**
 * POST /api/agent-decisions/coordinator/review
 * 触发协调 Agent 审核订单
 * 
 * @body {string} orderId - 订单 ID
 * @body {Object} context - 决策上下文
 */
router.post('/coordinator/review', asyncHandler(async (req, res) => {
  const { orderId, context = {} } = req.body;

  if (!orderId) {
    throw new ValidationError('orderId 是必填字段');
  }

  const result = await agentDecisionService.triggerDecision(
    AgentType.COORDINATOR,
    'review_order',
    { orderId, context }
  );

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/agent-decisions/scheduler/allocate
 * 触发调度 Agent 分配设备
 * 
 * @body {string} orderId - 订单 ID
 * @body {string} strategy - 分配策略
 */
router.post('/scheduler/allocate', asyncHandler(async (req, res) => {
  const { orderId, strategy } = req.body;

  if (!orderId) {
    throw new ValidationError('orderId 是必填字段');
  }

  const result = await agentDecisionService.triggerDecision(
    AgentType.SCHEDULER,
    'schedule_device',
    { orderId, strategy }
  );

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/agent-decisions/inventory/check
 * 触发库存 Agent 检查库存
 * 
 * @body {string} materialId - 材料 ID
 * @body {number} requiredAmount - 需求量
 */
router.post('/inventory/check', asyncHandler(async (req, res) => {
  const { materialId, requiredAmount } = req.body;

  if (!materialId) {
    throw new ValidationError('materialId 是必填字段');
  }

  const result = await agentDecisionService.triggerDecision(
    AgentType.INVENTORY,
    'check_inventory',
    { materialId, requiredAmount }
  );

  res.json({
    success: true,
    data: result
  });
}));

module.exports = router;
