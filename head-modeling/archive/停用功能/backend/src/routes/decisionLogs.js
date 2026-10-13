/**
 * 决策日志查询 API 路由
 * 
 * 提供决策日志的 RESTful API 接口
 * 支持查询、统计、导出等功能
 */

const express = require('express');
const router = express.Router();
const { decisionLogService } = require('../services/DecisionLogService');
const { DecisionAnalyzer } = require('../utils/DecisionAnalyzer');

const analyzer = new DecisionAnalyzer({
  lowConfidenceThreshold: 0.5,
  highConfidenceThreshold: 0.8,
  longDecisionTimeMs: 5000,
  enableLogging: true
});

/**
 * @route GET /api/decision-logs/:orderId
 * @description 查询订单的决策历史
 * @param {string} orderId - 订单 ID
 * @query {number} limit - 返回数量限制（默认 50）
 * @query {string} sort - 排序方式 asc/desc（默认 desc）
 * @returns {Array} 决策记录数组
 */
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit, sort } = req.query;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: '订单 ID 不能为空'
      });
    }

    const decisions = await decisionLogService.findByOrderId(orderId, {
      limit: limit ? parseInt(limit) : 50,
      sort: sort || 'desc'
    });

    res.json({
      success: true,
      count: decisions.length,
      decisions
    });
  } catch (error) {
    console.error('[DecisionLog API] 查询订单决策历史失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/agent/:agentId
 * @description 查询 Agent 的决策记录
 * @param {string} agentId - Agent ID
 * @query {string} decisionType - 决策类型过滤
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {number} limit - 返回数量限制（默认 50）
 * @returns {Array} 决策记录数组
 */
router.get('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { decisionType, startTime, endTime, limit } = req.query;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Agent ID 不能为空'
      });
    }

    const decisions = await decisionLogService.findByAgentId(agentId, {
      decisionType,
      startTime,
      endTime,
      limit: limit ? parseInt(limit) : 50
    });

    res.json({
      success: true,
      count: decisions.length,
      decisions
    });
  } catch (error) {
    console.error('[DecisionLog API] 查询 Agent 决策记录失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/stats
 * @description 获取决策统计信息
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {string} agentId - Agent ID 过滤
 * @returns {Object} 统计信息
 */
router.get('/stats', async (req, res) => {
  try {
    const { startTime, endTime, agentId } = req.query;

    const stats = await decisionLogService.getStats({
      startTime,
      endTime,
      agentId
    });

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[DecisionLog API] 获取统计信息失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/export
 * @description 导出决策日志
 * @query {string} format - 导出格式 json/csv（默认 json）
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {string} agentId - Agent ID 过滤
 * @query {string} decisionType - 决策类型过滤
 * @returns {Array|String} 决策日志数据
 */
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', startTime, endTime, agentId, decisionType } = req.query;

    if (format.toLowerCase() === 'csv') {
      const csv = await decisionLogService.exportAsCSV({
        startTime,
        endTime,
        agentId,
        decisionType
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="decision-logs-${Date.now()}.csv"`);
      return res.send(csv);
    }

    // JSON 格式
    const decisions = await decisionLogService.exportAsJSON({
      startTime,
      endTime,
      agentId,
      decisionType
    });

    res.json({
      success: true,
      count: decisions.length,
      decisions
    });
  } catch (error) {
    console.error('[DecisionLog API] 导出决策日志失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/analysis/confidence
 * @description 分析置信度分布
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {string} agentId - Agent ID 过滤
 * @returns {Object} 置信度分布分析结果
 */
router.get('/analysis/confidence', async (req, res) => {
  try {
    const { startTime, endTime, agentId } = req.query;

    const analysis = await analyzer.analyzeConfidenceDistribution({
      startTime,
      endTime,
      agentId
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('[DecisionLog API] 置信度分布分析失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/analysis/types
 * @description 分析决策类型统计
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {string} agentId - Agent ID 过滤
 * @returns {Object} 决策类型统计结果
 */
router.get('/analysis/types', async (req, res) => {
  try {
    const { startTime, endTime, agentId } = req.query;

    const analysis = await analyzer.analyzeDecisionTypes({
      startTime,
      endTime,
      agentId
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('[DecisionLog API] 决策类型统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/analysis/rules
 * @description 分析规则命中率
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {string} agentId - Agent ID 过滤
 * @returns {Object} 规则命中率分析结果
 */
router.get('/analysis/rules', async (req, res) => {
  try {
    const { startTime, endTime, agentId } = req.query;

    const analysis = await analyzer.analyzeRuleMatchRate({
      startTime,
      endTime,
      agentId
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('[DecisionLog API] 规则命中率分析失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/analysis/time
 * @description 分析决策时间
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {string} agentId - Agent ID 过滤
 * @returns {Object} 决策时间分析结果
 */
router.get('/analysis/time', async (req, res) => {
  try {
    const { startTime, endTime, agentId } = req.query;

    const analysis = await analyzer.analyzeDecisionTime({
      startTime,
      endTime,
      agentId
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('[DecisionLog API] 决策时间分析失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/analysis/anomalies
 * @description 检测异常决策
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {number} limit - 返回数量限制（默认 50）
 * @returns {Object} 异常决策检测结果
 */
router.get('/analysis/anomalies', async (req, res) => {
  try {
    const { startTime, endTime, limit } = req.query;

    const analysis = await analyzer.detectAnomalies({
      startTime,
      endTime,
      limit: limit ? parseInt(limit) : 50
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('[DecisionLog API] 异常检测失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/analysis/agents
 * @description 分析 Agent 性能
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @returns {Object} Agent 性能分析结果
 */
router.get('/analysis/agents', async (req, res) => {
  try {
    const { startTime, endTime } = req.query;

    const analysis = await analyzer.analyzeAgentPerformance({
      startTime,
      endTime
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('[DecisionLog API] Agent 性能分析失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/analysis/report
 * @description 生成综合分析报告
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @returns {Object} 综合分析报告
 */
router.get('/analysis/report', async (req, res) => {
  try {
    const { startTime, endTime } = req.query;

    const report = await analyzer.generateReport({
      startTime,
      endTime
    });

    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('[DecisionLog API] 生成综合报告失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/low-confidence
 * @description 查询低置信度决策
 * @query {number} threshold - 置信度阈值（默认 0.5）
 * @query {number} limit - 返回数量限制（默认 50）
 * @returns {Array} 低置信度决策数组
 */
router.get('/low-confidence', async (req, res) => {
  try {
    const { threshold, limit } = req.query;

    const decisions = await decisionLogService.findLowConfidence(
      threshold ? parseFloat(threshold) : null,
      {
        limit: limit ? parseInt(limit) : 50
      }
    );

    res.json({
      success: true,
      count: decisions.length,
      threshold: threshold || 0.5,
      decisions
    });
  } catch (error) {
    console.error('[DecisionLog API] 查询低置信度决策失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/decision-logs/type/:decisionType
 * @description 按决策类型查询
 * @param {string} decisionType - 决策类型
 * @query {string} startTime - 开始时间 ISO8601
 * @query {string} endTime - 结束时间 ISO8601
 * @query {number} limit - 返回数量限制（默认 50）
 * @returns {Array} 决策记录数组
 */
router.get('/type/:decisionType', async (req, res) => {
  try {
    const { decisionType } = req.params;
    const { startTime, endTime, limit } = req.query;

    if (!decisionType) {
      return res.status(400).json({
        success: false,
        error: '决策类型不能为空'
      });
    }

    const decisions = await decisionLogService.findByDecisionType(decisionType, {
      startTime,
      endTime,
      limit: limit ? parseInt(limit) : 50
    });

    res.json({
      success: true,
      count: decisions.length,
      decisions
    });
  } catch (error) {
    console.error('[DecisionLog API] 按决策类型查询失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
