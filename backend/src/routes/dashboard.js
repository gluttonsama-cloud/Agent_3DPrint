/**
 * 数据看板路由
 * 
 * 提供数据统计、分析、报表生成等功能
 * 集成 Order、Device、Material、AgentDecision 所有数据源
 */

const express = require('express');
const router = express.Router();
const DashboardService = require('../services/DashboardService');
const OrderService = require('../services/OrderService');

// 创建服务实例
const dashboardService = new DashboardService();
const orderService = OrderService.orderService || new OrderService();

/**
 * @route GET /api/dashboard/stats
 * @desc 获取仪表盘实时统计数据（概览）
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await dashboardService.getOverview();
    
    // 使用统一的成功响应格式
    res.json({
      success: true,
      data: stats,
      message: '统计数据获取成功'
    });
  } catch (error) {
    console.error('[Dashboard] 获取统计数据失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取统计数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/orders/trend
 * @desc 获取订单趋势数据
 * @access Public
 * @query {number} days - 统计天数，默认 7 天
 */
router.get('/orders/trend', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = await dashboardService.getOrderStats(days);
    
    // 提取趋势数据
    const trendData = {
      dates: stats.trend.map(item => item.date),
      values: stats.trend.map(item => item.count),
      revenue: stats.trend.map(item => item.revenue)
    };

    res.json({
      success: true,
      data: trendData,
      message: '订单趋势获取成功'
    });
  } catch (error) {
    console.error('[Dashboard] 获取订单趋势失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取订单趋势数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/overview
 * @desc 获取概览统计数据
 * @access Public
 */
router.get('/overview', async (req, res) => {
  try {
    const data = await dashboardService.getOverview();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Dashboard] 获取概览统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取概览统计数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/orders/stats
 * @desc 获取订单统计数据
 * @access Public
 * @query {number} days - 统计天数，默认 30 天
 */
router.get('/orders/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await dashboardService.getOrderStats(days);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Dashboard] 获取订单统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取订单统计数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/devices/utilization
 * @desc 获取设备利用率统计
 * @access Public
 */
router.get('/devices/utilization', async (req, res) => {
  try {
    const data = await dashboardService.getDeviceUtilization();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Dashboard] 获取设备利用率失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取设备利用率数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/devices/timeline
 * @desc 获取设备时间线数据（甘特图格式）
 * @access Public
 */
router.get('/devices/timeline', async (req, res) => {
  try {
    const data = await dashboardService.getDeviceTimeline();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Dashboard] 获取设备时间线失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取设备时间线数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/inventory/trend
 * @desc 获取库存趋势数据
 * @access Public
 * @query {string} materialId - 物料 ID（可选，不传则返回所有物料）
 * @query {number} days - 统计天数，默认 30 天
 */
router.get('/inventory/trend', async (req, res) => {
  try {
    const { materialId, days } = req.query;
    const data = await dashboardService.getInventoryTrend(
      materialId,
      parseInt(days) || 30
    );
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Dashboard] 获取库存趋势失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取库存趋势数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/inventory/prediction
 * @desc 获取库存预测数据（基于历史消耗的简单线性预测）
 * @access Public
 */
router.get('/inventory/prediction', async (req, res) => {
  try {
    const data = await dashboardService.getInventoryPrediction();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Dashboard] 获取库存预测失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取库存预测数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/agents/performance
 * @desc 获取 Agent 性能分析
 * @access Public
 */
router.get('/agents/performance', async (req, res) => {
  try {
    const data = await dashboardService.getAgentPerformance();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Dashboard] 获取 Agent 性能失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取 Agent 性能数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/decisions/analysis
 * @desc 获取决策分析数据
 * @access Public
 */
router.get('/decisions/analysis', async (req, res) => {
  try {
    const data = await dashboardService.getDecisionAnalysis();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Dashboard] 获取决策分析失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取决策分析数据失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/dashboard/export
 * @desc 导出报表
 * @access Public
 * @query {string} format - 导出格式 (pdf/json/csv)
 * @query {number} days - 统计天数，默认 30 天
 */
router.get('/export', async (req, res) => {
  try {
    const format = (req.query.format || 'json').toLowerCase();
    const days = parseInt(req.query.days) || 30;

    // 验证导出格式
    const supportedFormats = ['json', 'csv', 'pdf'];
    if (!supportedFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        error: '不支持的导出格式',
        message: `支持的格式：${supportedFormats.join(', ')}`
      });
    }

    const data = await dashboardService.exportReport(format, { days });

    // 根据格式设置响应
    if (format === 'json') {
      res.json({
        success: true,
        data
      });
    } else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="dashboard-report-${new Date().toISOString().split('T')[0]}.csv"`
      );
      res.send(data);
    } else if (format === 'pdf') {
      // PDF 导出需要额外依赖，这里返回提示信息
      res.json({
        success: true,
        message: 'PDF 导出功能需要安装额外依赖，当前返回 JSON 格式',
        data
      });
    }
  } catch (error) {
    console.error('[Dashboard] 导出报表失败:', error.message);
    res.status(500).json({
      success: false,
      error: '导出报表失败',
      message: error.message
    });
  }
});

module.exports = router;
