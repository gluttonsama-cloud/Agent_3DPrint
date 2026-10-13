/**
 * 性能监控路由
 * 
 * 提供缓存统计、速率限制状态、系统健康检查等 API
 */

const express = require('express');
const router = express.Router();
const { cacheService, CacheStrategies } = require('../services/cacheService');
const { rateLimiterService, RateLimitConfigs } = require('../services/rateLimiterService');

/**
 * @route GET /api/performance/stats
 * @desc 获取缓存和速率限制统计信息
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    // 获取缓存统计
    const cacheStats = cacheService.getStats();
    
    // 获取速率限制统计
    const rateLimiterStats = rateLimiterService.getStats();
    
    // 获取缓存健康状态
    const cacheHealth = await cacheService.healthCheck();
    
    res.json({
      success: true,
      data: {
        cache: {
          ...cacheStats,
          health: cacheHealth
        },
        rateLimiter: rateLimiterStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Performance] 获取统计信息失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取统计信息失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/performance/cache
 * @desc 获取缓存详细统计
 * @access Public
 */
router.get('/cache', async (req, res) => {
  try {
    const stats = cacheService.getStats();
    const health = await cacheService.healthCheck();
    
    res.json({
      success: true,
      data: {
        ...stats,
        health,
        strategies: CacheStrategies
      }
    });
  } catch (error) {
    console.error('[Performance] 获取缓存统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取缓存统计失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/performance/cache/health
 * @desc 缓存健康检查
 * @access Public
 */
router.get('/cache/health', async (req, res) => {
  try {
    const health = await cacheService.healthCheck();
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('[Performance] 缓存健康检查失败:', error.message);
    res.status(500).json({
      success: false,
      error: '缓存健康检查失败',
      message: error.message
    });
  }
});

/**
 * @route POST /api/performance/cache/reset-stats
 * @desc 重置缓存统计信息
 * @access Public
 */
router.post('/cache/reset-stats', (req, res) => {
  try {
    cacheService.resetStats();
    
    res.json({
      success: true,
      message: '缓存统计已重置',
      data: cacheService.getStats()
    });
  } catch (error) {
    console.error('[Performance] 重置缓存统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: '重置缓存统计失败',
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/performance/cache/:type
 * @desc 清除指定类型的缓存
 * @access Public
 */
router.delete('/cache/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    // 验证缓存类型
    if (!CacheStrategies[type]) {
      return res.status(400).json({
        success: false,
        error: '无效的缓存类型',
        message: `支持的类型: ${Object.keys(CacheStrategies).join(', ')}`
      });
    }
    
    const deleted = await cacheService.deleteByType(type);
    
    res.json({
      success: true,
      message: `已清除 ${type} 类型缓存`,
      data: { deletedCount: deleted }
    });
  } catch (error) {
    console.error('[Performance] 清除缓存失败:', error.message);
    res.status(500).json({
      success: false,
      error: '清除缓存失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/performance/rate-limiter
 * @desc 获取速率限制统计
 * @access Public
 */
router.get('/rate-limiter', (req, res) => {
  try {
    const stats = rateLimiterService.getStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        configs: RateLimitConfigs
      }
    });
  } catch (error) {
    console.error('[Performance] 获取速率限制统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取速率限制统计失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/performance/rate-limiter/status/:type/:identifier
 * @desc 获取指定标识符的速率限制状态
 * @access Public
 */
router.get('/rate-limiter/status/:type/:identifier', async (req, res) => {
  try {
    const { type, identifier } = req.params;
    
    // 验证限制类型
    if (!RateLimitConfigs[type]) {
      return res.status(400).json({
        success: false,
        error: '无效的限制类型',
        message: `支持的类型: ${Object.keys(RateLimitConfigs).join(', ')}`
      });
    }
    
    const status = await rateLimiterService.getStatus(type, identifier);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[Performance] 获取速率限制状态失败:', error.message);
    res.status(500).json({
      success: false,
      error: '获取速率限制状态失败',
      message: error.message
    });
  }
});

/**
 * @route POST /api/performance/rate-limiter/reset-stats
 * @desc 重置速率限制统计信息
 * @access Public
 */
router.post('/rate-limiter/reset-stats', (req, res) => {
  try {
    rateLimiterService.resetStats();
    
    res.json({
      success: true,
      message: '速率限制统计已重置',
      data: rateLimiterService.getStats()
    });
  } catch (error) {
    console.error('[Performance] 重置速率限制统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: '重置速率限制统计失败',
      message: error.message
    });
  }
});

/**
 * @route POST /api/performance/rate-limiter/reset/:type/:identifier
 * @desc 重置指定标识符的速率限制
 * @access Public
 */
router.post('/rate-limiter/reset/:type/:identifier', async (req, res) => {
  try {
    const { type, identifier } = req.params;
    
    // 验证限制类型
    if (!RateLimitConfigs[type]) {
      return res.status(400).json({
        success: false,
        error: '无效的限制类型',
        message: `支持的类型: ${Object.keys(RateLimitConfigs).join(', ')}`
      });
    }
    
    await rateLimiterService.resetLimit(type, identifier);
    
    res.json({
      success: true,
      message: `已重置 ${type}:${identifier} 的速率限制`
    });
  } catch (error) {
    console.error('[Performance] 重置速率限制失败:', error.message);
    res.status(500).json({
      success: false,
      error: '重置速率限制失败',
      message: error.message
    });
  }
});

/**
 * @route GET /api/performance/health
 * @desc 综合健康检查
 * @access Public
 */
router.get('/health', async (req, res) => {
  try {
    const cacheHealth = await cacheService.healthCheck();
    const rateLimiterStats = rateLimiterService.getStats();
    
    // 判断整体健康状态
    const isHealthy = cacheHealth.status === 'healthy';
    
    res.status(isHealthy ? 200 : 503).json({
      success: true,
      data: {
        status: isHealthy ? 'healthy' : 'degraded',
        cache: {
          status: cacheHealth.status,
          connected: cacheHealth.connected,
          latency: cacheHealth.latency
        },
        rateLimiter: {
          connected: rateLimiterStats.isConnected,
          usingLocalCounter: rateLimiterStats.usingLocalCounter
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Performance] 健康检查失败:', error.message);
    res.status(503).json({
      success: false,
      error: '健康检查失败',
      message: error.message
    });
  }
});

module.exports = router;