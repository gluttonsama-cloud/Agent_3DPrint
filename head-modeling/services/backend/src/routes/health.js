const express = require('express');
const router = express.Router();

const startTime = Date.now();

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: 详细健康检查
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 系统状态
 */
router.get('/', async (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
    version: '2.0.0',
    components: {
      api: { status: 'ok', message: 'API 服务正常' },
      database: { status: 'unknown', message: '未配置数据库检查' },
      redis: { status: 'unknown', message: '未配置 Redis 检查' },
      gpu: { status: 'unknown', message: 'GPU 服务未启用' }
    }
  };

  res.json(health);
});

/**
 * @openapi
 * /api/health/live:
 *   get:
 *     summary: 存活探针
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 服务存活
 */
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * @openapi
 * /api/health/ready:
 *   get:
 *     summary: 就绪探针
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 服务就绪
 *       503:
 *         description: 服务未就绪
 */
router.get('/ready', async (req, res) => {
  res.status(200).json({ 
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;