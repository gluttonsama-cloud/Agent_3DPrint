/**
 * 并发控制服务
 * 
 * 实现多级别的速率限制：
 * - API 速率限制：100 请求/分钟
 * - Agent 决策并发限制：5 个/秒
 * 
 * 支持滑动窗口算法、分布式限制、IP 级别限制等功能
 */

const { createRedisClient, useMock } = require('../config/redis');

/**
 * 速率限制配置
 */
const RateLimitConfigs = {
  // API 全局速率限制：100 请求/分钟
  API_GLOBAL: {
    points: 100,           // 最大请求数
    duration: 60,          // 时间窗口（秒）
    blockDuration: 60,     // 超限后阻塞时间（秒）
    keyPrefix: 'ratelimit:api:global',
    description: 'API 全局速率限制'
  },
  // API 用户级别限制：50 请求/分钟/用户
  API_USER: {
    points: 50,
    duration: 60,
    blockDuration: 30,
    keyPrefix: 'ratelimit:api:user',
    description: 'API 用户级别速率限制'
  },
  // API IP 级别限制：30 请求/分钟/IP
  API_IP: {
    points: 30,
    duration: 60,
    blockDuration: 60,
    keyPrefix: 'ratelimit:api:ip',
    description: 'API IP 级别速率限制'
  },
  // Agent 决策并发限制：5 个/秒
  AGENT_DECISION: {
    points: 5,
    duration: 1,
    blockDuration: 1,
    keyPrefix: 'ratelimit:agent:decision',
    description: 'Agent 决策并发限制'
  },
  // LLM API 调用限制：20 次/分钟
  LLM_API: {
    points: 20,
    duration: 60,
    blockDuration: 30,
    keyPrefix: 'ratelimit:llm:api',
    description: 'LLM API 调用限制'
  },
  // 文件上传限制：10 次/分钟
  FILE_UPLOAD: {
    points: 10,
    duration: 60,
    blockDuration: 60,
    keyPrefix: 'ratelimit:file:upload',
    description: '文件上传限制'
  }
};

/**
 * 并发控制服务类
 */
class RateLimiterService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    
    // 本地计数器（用于 Mock 模式或降级）
    this.localCounters = new Map();
    
    // 统计信息
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      errors: 0
    };
    
    // 按类型统计
    this.statsByType = {};
    Object.keys(RateLimitConfigs).forEach(type => {
      this.statsByType[type] = {
        requests: 0,
        allowed: 0,
        blocked: 0
      };
    });
  }

  /**
   * 初始化 Redis 连接
   */
  async initialize() {
    if (this.client) {
      return;
    }

    try {
      this.client = createRedisClient();
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // 超时后使用本地计数器降级
          console.warn('[RateLimiterService] Redis 连接超时，使用本地计数器');
          resolve();
        }, 5000);

        this.client.once('ready', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          console.log('[RateLimiterService] Redis 连接成功');
          resolve();
        });

        this.client.once('error', (err) => {
          clearTimeout(timeout);
          console.warn('[RateLimiterService] Redis 错误，使用本地计数器:', err.message);
          resolve();
        });

        if (useMock) {
          clearTimeout(timeout);
          resolve();
        }
      });
    } catch (error) {
      console.error('[RateLimiterService] 初始化失败:', error.message);
    }
  }

  /**
   * 生成限制键
   * @param {string} type - 限制类型
   * @param {string} identifier - 标识符（用户 ID、IP 等）
   * @returns {string} 完整的键名
   */
  generateKey(type, identifier) {
    const config = RateLimitConfigs[type];
    if (!config) {
      throw new Error(`未知的限制类型: ${type}`);
    }
    return `${config.keyPrefix}:${identifier}`;
  }

  /**
   * 获取当前时间窗口的开始时间
   * @param {number} duration - 窗口时长（秒）
   * @returns {number} 窗口开始时间戳（毫秒）
   */
  getWindowStart(duration) {
    const now = Date.now();
    return Math.floor(now / (duration * 1000)) * (duration * 1000);
  }

  /**
   * 检查请求是否允许（滑动窗口算法）
   * @param {string} type - 限制类型
   * @param {string} identifier - 标识符
   * @param {number} [points=1] - 消耗的点数
   * @returns {Promise<Object>} 检查结果
   */
  async checkLimit(type, identifier, points = 1) {
    const config = RateLimitConfigs[type];
    if (!config) {
      throw new Error(`未知的限制类型: ${type}`);
    }

    this.stats.totalRequests++;
    this.statsByType[type].requests++;

    const key = this.generateKey(type, identifier);

    try {
      // 优先使用 Redis
      if (this.isConnected && this.client) {
        return await this._checkWithRedis(key, config, points, type);
      }
      
      // 降级使用本地计数器
      return await this._checkWithLocal(key, config, points, type);
    } catch (error) {
      console.error(`[RateLimiterService] 检查限制失败: ${key}`, error.message);
      this.stats.errors++;
      
      // 出错时放行（降级策略）
      return {
        allowed: true,
        remaining: config.points,
        resetAt: Date.now() + config.duration * 1000,
        retryAfter: 0,
        degraded: true
      };
    }
  }

  /**
   * 使用 Redis 检查限制
   * @private
   */
  async _checkWithRedis(key, config, points, type) {
    const now = Date.now();
    const windowStart = this.getWindowStart(config.duration);
    const windowKey = `${key}:${windowStart}`;

    // 使用 Redis 事务保证原子性
    const multi = this.client.multi();
    
    // 获取当前窗口的计数
    multi.get(windowKey);
    multi.ttl(windowKey);
    
    const results = await multi.exec();
    const currentCount = parseInt(results[0][1] || '0', 10);
    const ttl = results[1][1];

    const newCount = currentCount + points;
    
    if (newCount > config.points) {
      // 超出限制
      this.stats.blockedRequests++;
      this.statsByType[type].blocked++;
      
      const retryAfter = ttl > 0 ? ttl : config.duration;
      
      return {
        allowed: false,
        remaining: 0,
        current: currentCount,
        limit: config.points,
        resetAt: now + retryAfter * 1000,
        retryAfter,
        blocked: true
      };
    }

    // 允许请求，增加计数
    const incrMulti = this.client.multi();
    incrMulti.incrby(windowKey, points);
    
    // 如果是新的计数器，设置过期时间
    if (currentCount === 0 || ttl === -1) {
      incrMulti.expire(windowKey, config.duration);
    }
    
    await incrMulti.exec();

    this.stats.allowedRequests++;
    this.statsByType[type].allowed++;

    return {
      allowed: true,
      remaining: config.points - newCount,
      current: newCount,
      limit: config.points,
      resetAt: now + config.duration * 1000,
      retryAfter: 0
    };
  }

  /**
   * 使用本地计数器检查限制（降级模式）
   * @private
   */
  async _checkWithLocal(key, config, points, type) {
    const now = Date.now();
    const windowStart = this.getWindowStart(config.duration);
    const windowKey = `${key}:${windowStart}`;

    // 清理过期的计数器
    this._cleanupLocalCounters();

    const counter = this.localCounters.get(windowKey) || { count: 0, expiresAt: now + config.duration * 1000 };
    const newCount = counter.count + points;

    if (newCount > config.points) {
      this.stats.blockedRequests++;
      this.statsByType[type].blocked++;

      return {
        allowed: false,
        remaining: 0,
        current: counter.count,
        limit: config.points,
        resetAt: counter.expiresAt,
        retryAfter: Math.ceil((counter.expiresAt - now) / 1000),
        blocked: true,
        degraded: true
      };
    }

    counter.count = newCount;
    this.localCounters.set(windowKey, counter);

    this.stats.allowedRequests++;
    this.statsByType[type].allowed++;

    return {
      allowed: true,
      remaining: config.points - newCount,
      current: newCount,
      limit: config.points,
      resetAt: counter.expiresAt,
      retryAfter: 0,
      degraded: true
    };
  }

  /**
   * 清理过期的本地计数器
   * @private
   */
  _cleanupLocalCounters() {
    const now = Date.now();
    for (const [key, counter] of this.localCounters.entries()) {
      if (counter.expiresAt < now) {
        this.localCounters.delete(key);
      }
    }
  }

  /**
   * 重置指定标识符的限制计数
   * @param {string} type - 限制类型
   * @param {string} identifier - 标识符
   */
  async resetLimit(type, identifier) {
    const config = RateLimitConfigs[type];
    if (!config) {
      throw new Error(`未知的限制类型: ${type}`);
    }

    const key = this.generateKey(type, identifier);
    const pattern = `${key}:*`;

    try {
      if (this.isConnected && this.client) {
        // 删除所有匹配的键
        let cursor = '0';
        do {
          const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = result[0];
          const keys = result[1];
          if (keys.length > 0) {
            await this.client.del(...keys);
          }
        } while (cursor !== '0');
      }
      
      // 同时清理本地计数器
      for (const [localKey] of this.localCounters.entries()) {
        if (localKey.startsWith(key)) {
          this.localCounters.delete(localKey);
        }
      }
      
      console.log(`[RateLimiterService] 已重置限制: ${key}`);
    } catch (error) {
      console.error(`[RateLimiterService] 重置限制失败: ${key}`, error.message);
    }
  }

  /**
   * 获取指定标识符的当前限制状态
   * @param {string} type - 限制类型
   * @param {string} identifier - 标识符
   * @returns {Promise<Object>} 当前状态
   */
  async getStatus(type, identifier) {
    const config = RateLimitConfigs[type];
    if (!config) {
      throw new Error(`未知的限制类型: ${type}`);
    }

    const key = this.generateKey(type, identifier);
    const windowStart = this.getWindowStart(config.duration);
    const windowKey = `${key}:${windowStart}`;

    try {
      let current = 0;
      let ttl = config.duration;

      if (this.isConnected && this.client) {
        const result = await this.client.multi().get(windowKey).ttl(windowKey).exec();
        current = parseInt(result[0][1] || '0', 10);
        ttl = result[1][1] > 0 ? result[1][1] : config.duration;
      } else {
        const counter = this.localCounters.get(windowKey);
        if (counter) {
          current = counter.count;
        }
      }

      return {
        type,
        identifier,
        current,
        limit: config.points,
        remaining: Math.max(0, config.points - current),
        resetAt: Date.now() + ttl * 1000,
        ttl,
        percentage: ((current / config.points) * 100).toFixed(1)
      };
    } catch (error) {
      console.error(`[RateLimiterService] 获取状态失败: ${key}`, error.message);
      return {
        type,
        identifier,
        current: 0,
        limit: config.points,
        remaining: config.points,
        error: error.message
      };
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const blockRate = this.stats.totalRequests > 0
      ? ((this.stats.blockedRequests / this.stats.totalRequests) * 100).toFixed(2)
      : 0;

    return {
      total: {
        ...this.stats,
        blockRate: blockRate + '%'
      },
      byType: this.statsByType,
      isConnected: this.isConnected,
      usingLocalCounter: !this.isConnected
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      errors: 0
    };

    Object.keys(RateLimitConfigs).forEach(type => {
      this.statsByType[type] = {
        requests: 0,
        allowed: 0,
        blocked: 0
      };
    });

    console.log('[RateLimiterService] 统计信息已重置');
  }

  /**
   * 创建 Express 中间件
   * @param {string} type - 限制类型
   * @param {Function} [identifierFn] - 获取标识符的函数，默认使用 IP
   * @returns {Function} Express 中间件
   */
  createMiddleware(type, identifierFn = null) {
    const config = RateLimitConfigs[type];
    if (!config) {
      throw new Error(`未知的限制类型: ${type}`);
    }

    return async (req, res, next) => {
      // 获取标识符
      let identifier;
      if (identifierFn) {
        identifier = identifierFn(req);
      } else {
        // 默认使用 IP + 用户 ID（如果有）
        identifier = req.ip || req.connection.remoteAddress || 'unknown';
        if (req.user?.id) {
          identifier = `${identifier}:${req.user.id}`;
        }
      }

      try {
        const result = await this.checkLimit(type, identifier);

        // 设置响应头
        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetAt);

        if (!result.allowed) {
          res.setHeader('Retry-After', result.retryAfter);
          
          return res.status(429).json({
            error: 'Too Many Requests',
            message: `请求过于频繁，请在 ${result.retryAfter} 秒后重试`,
            retryAfter: result.retryAfter,
            limit: result.limit,
            current: result.current
          });
        }

        next();
      } catch (error) {
        console.error('[RateLimiterService] 中间件错误:', error.message);
        // 出错时放行
        next();
      }
    };
  }

  /**
   * 并发控制装饰器（用于 Agent 决策等场景）
   * @param {string} type - 限制类型
   * @param {string} identifier - 标识符
   * @param {Function} fn - 要执行的函数
   * @returns {Promise<any>} 函数执行结果
   */
  async withConcurrencyControl(type, identifier, fn) {
    const result = await this.checkLimit(type, identifier);

    if (!result.allowed) {
      throw new Error(`并发限制：请等待 ${result.retryAfter} 秒后重试`);
    }

    return await fn();
  }

  /**
   * 批量检查限制（预检查多个操作）
   * @param {Array<{type: string, identifier: string, points?: number}>} checks - 检查列表
   * @returns {Promise<Object>} 检查结果
   */
  async batchCheck(checks) {
    const results = {};

    for (const check of checks) {
      const { type, identifier, points = 1 } = check;
      const key = `${type}:${identifier}`;
      results[key] = await this.checkLimit(type, identifier, points);
    }

    return results;
  }

  /**
   * 关闭连接
   */
  async close() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
        console.log('[RateLimiterService] Redis 连接已关闭');
      } catch (error) {
        console.error('[RateLimiterService] 关闭连接失败:', error.message);
      }
    }
    
    this.localCounters.clear();
  }
}

// 导出单例和配置
const rateLimiterService = new RateLimiterService();

module.exports = {
  RateLimiterService,
  rateLimiterService,
  RateLimitConfigs
};