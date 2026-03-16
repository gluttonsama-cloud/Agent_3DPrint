/**
 * Redis 缓存服务
 * 
 * 提供统一的缓存接口，支持多种缓存策略：
 * - 订单详情缓存：5 分钟
 * - 设备状态缓存：1 分钟
 * - 库存数据缓存：2 分钟
 * 
 * 支持缓存命中率统计、批量操作、自动过期等功能
 */

const { createRedisClient, useMock } = require('../config/redis');

/**
 * 缓存策略配置（过期时间单位：秒）
 */
const CacheStrategies = {
  // 订单详情缓存：5 分钟
  ORDER_DETAIL: {
    ttl: 300,
    prefix: 'order:detail:',
    description: '订单详情缓存'
  },
  // 设备状态缓存：1 分钟
  DEVICE_STATUS: {
    ttl: 60,
    prefix: 'device:status:',
    description: '设备状态缓存'
  },
  // 库存数据缓存：2 分钟
  INVENTORY: {
    ttl: 120,
    prefix: 'inventory:',
    description: '库存数据缓存'
  },
  // 用户会话缓存：30 分钟
  USER_SESSION: {
    ttl: 1800,
    prefix: 'session:user:',
    description: '用户会话缓存'
  },
  // API 响应缓存：10 分钟
  API_RESPONSE: {
    ttl: 600,
    prefix: 'api:response:',
    description: 'API 响应缓存'
  },
  // Agent 决策结果缓存：15 分钟
  AGENT_DECISION: {
    ttl: 900,
    prefix: 'agent:decision:',
    description: 'Agent 决策结果缓存'
  }
};

/**
 * 缓存服务类
 */
class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    
    // 缓存统计
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    
    // 按类型统计命中率
    this.statsByType = {};
    Object.keys(CacheStrategies).forEach(type => {
      this.statsByType[type] = { hits: 0, misses: 0 };
    });
  }

  /**
   * 初始化缓存连接
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.client) {
      return;
    }

    try {
      this.client = createRedisClient();
      
      // 等待连接就绪
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis 连接超时'));
        }, 5000);

        this.client.once('ready', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          console.log('[CacheService] Redis 连接成功');
          resolve();
        });

        this.client.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        // 如果已经是 mock 模式，直接返回
        if (useMock) {
          clearTimeout(timeout);
          this.isConnected = true;
          resolve();
        }
      });
    } catch (error) {
      console.error('[CacheService] Redis 连接失败:', error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * 确保连接已建立
   * @returns {Promise<void>}
   */
  async ensureConnection() {
    if (!this.isConnected) {
      await this.initialize();
    }
  }

  /**
   * 生成缓存键
   * @param {string} type - 缓存类型
   * @param {string} key - 键名
   * @returns {string} 完整的缓存键
   */
  generateKey(type, key) {
    const strategy = CacheStrategies[type];
    if (!strategy) {
      throw new Error(`未知的缓存类型: ${type}`);
    }
    return `${strategy.prefix}${key}`;
  }

  /**
   * 获取缓存
   * @param {string} type - 缓存类型
   * @param {string} key - 缓存键
   * @returns {Promise<any|null>} 缓存值或 null
   */
  async get(type, key) {
    await this.ensureConnection();
    
    const fullKey = this.generateKey(type, key);
    
    try {
      const value = await this.client.get(fullKey);
      
      if (value !== null) {
        this.stats.hits++;
        this.statsByType[type].hits++;
        console.log(`[CacheService] 缓存命中: ${fullKey}`);
        return JSON.parse(value);
      }
      
      this.stats.misses++;
      this.statsByType[type].misses++;
      console.log(`[CacheService] 缓存未命中: ${fullKey}`);
      return null;
    } catch (error) {
      console.error(`[CacheService] 获取缓存失败: ${fullKey}`, error.message);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * 设置缓存
   * @param {string} type - 缓存类型
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} [customTtl] - 自定义过期时间（秒）
   * @returns {Promise<boolean>} 是否成功
   */
  async set(type, key, value, customTtl = null) {
    await this.ensureConnection();
    
    const fullKey = this.generateKey(type, key);
    const strategy = CacheStrategies[type];
    const ttl = customTtl || strategy.ttl;
    
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(fullKey, ttl, serialized);
      this.stats.sets++;
      console.log(`[CacheService] 缓存已设置: ${fullKey}, TTL: ${ttl}s`);
      return true;
    } catch (error) {
      console.error(`[CacheService] 设置缓存失败: ${fullKey}`, error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * 删除缓存
   * @param {string} type - 缓存类型
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>} 是否成功
   */
  async delete(type, key) {
    await this.ensureConnection();
    
    const fullKey = this.generateKey(type, key);
    
    try {
      await this.client.del(fullKey);
      this.stats.deletes++;
      console.log(`[CacheService] 缓存已删除: ${fullKey}`);
      return true;
    } catch (error) {
      console.error(`[CacheService] 删除缓存失败: ${fullKey}`, error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * 批量删除缓存（按前缀）
   * @param {string} type - 缓存类型
   * @returns {Promise<number>} 删除的数量
   */
  async deleteByType(type) {
    await this.ensureConnection();
    
    const strategy = CacheStrategies[type];
    if (!strategy) {
      throw new Error(`未知的缓存类型: ${type}`);
    }
    
    try {
      // 使用 scan 命令安全地查找和删除键
      let deleted = 0;
      let cursor = '0';
      
      do {
        const result = await this.client.scan(cursor, 'MATCH', `${strategy.prefix}*`, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];
        
        if (keys.length > 0) {
          await this.client.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');
      
      console.log(`[CacheService] 批量删除缓存: ${type}, 数量: ${deleted}`);
      return deleted;
    } catch (error) {
      console.error(`[CacheService] 批量删除缓存失败: ${type}`, error.message);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * 获取或设置缓存（常用模式）
   * @param {string} type - 缓存类型
   * @param {string} key - 缓存键
   * @param {Function} fetchFn - 获取数据的函数
   * @returns {Promise<any>} 数据
   */
  async getOrSet(type, key, fetchFn) {
    // 先尝试从缓存获取
    const cached = await this.get(type, key);
    if (cached !== null) {
      return cached;
    }
    
    // 缓存未命中，调用函数获取数据
    try {
      const data = await fetchFn();
      
      // 设置缓存
      await this.set(type, key, data);
      
      return data;
    } catch (error) {
      console.error(`[CacheService] getOrSet 获取数据失败: ${key}`, error.message);
      throw error;
    }
  }

  /**
   * 批量获取缓存
   * @param {string} type - 缓存类型
   * @param {Array<string>} keys - 缓存键数组
   * @returns {Promise<Object>} 键值对对象
   */
  async mget(type, keys) {
    await this.ensureConnection();
    
    if (!keys || keys.length === 0) {
      return {};
    }
    
    const fullKeys = keys.map(key => this.generateKey(type, key));
    
    try {
      const values = await this.client.mget(...fullKeys);
      
      const result = {};
      keys.forEach((key, index) => {
        if (values[index] !== null) {
          result[key] = JSON.parse(values[index]);
          this.stats.hits++;
          this.statsByType[type].hits++;
        } else {
          this.stats.misses++;
          this.statsByType[type].misses++;
        }
      });
      
      console.log(`[CacheService] 批量获取缓存: ${keys.length} 个, 命中: ${Object.keys(result).length}`);
      return result;
    } catch (error) {
      console.error('[CacheService] 批量获取缓存失败', error.message);
      this.stats.errors++;
      return {};
    }
  }

  /**
   * 批量设置缓存
   * @param {string} type - 缓存类型
   * @param {Object} data - 键值对对象
   * @returns {Promise<boolean>} 是否成功
   */
  async mset(type, data) {
    await this.ensureConnection();
    
    if (!data || Object.keys(data).length === 0) {
      return true;
    }
    
    const strategy = CacheStrategies[type];
    
    try {
      const multi = this.client.multi();
      
      Object.entries(data).forEach(([key, value]) => {
        const fullKey = this.generateKey(type, key);
        multi.setex(fullKey, strategy.ttl, JSON.stringify(value));
        this.stats.sets++;
      });
      
      await multi.exec();
      console.log(`[CacheService] 批量设置缓存: ${Object.keys(data).length} 个`);
      return true;
    } catch (error) {
      console.error('[CacheService] 批量设置缓存失败', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * 检查缓存是否存在
   * @param {string} type - 缓存类型
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>} 是否存在
   */
  async exists(type, key) {
    await this.ensureConnection();
    
    const fullKey = this.generateKey(type, key);
    
    try {
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error) {
      console.error(`[CacheService] 检查缓存存在失败: ${fullKey}`, error.message);
      return false;
    }
  }

  /**
   * 获取缓存的剩余过期时间
   * @param {string} type - 缓存类型
   * @param {string} key - 缓存键
   * @returns {Promise<number>} 剩余秒数，-1 表示永不过期，-2 表示不存在
   */
  async ttl(type, key) {
    await this.ensureConnection();
    
    const fullKey = this.generateKey(type, key);
    
    try {
      return await this.client.ttl(fullKey);
    } catch (error) {
      console.error(`[CacheService] 获取 TTL 失败: ${fullKey}`, error.message);
      return -2;
    }
  }

  /**
   * 刷新缓存过期时间
   * @param {string} type - 缓存类型
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>} 是否成功
   */
  async refresh(type, key) {
    await this.ensureConnection();
    
    const strategy = CacheStrategies[type];
    const fullKey = this.generateKey(type, key);
    
    try {
      const result = await this.client.expire(fullKey, strategy.ttl);
      return result === 1;
    } catch (error) {
      console.error(`[CacheService] 刷新缓存过期失败: ${fullKey}`, error.message);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 
      ? ((this.stats.hits / totalRequests) * 100).toFixed(2) 
      : 0;

    const statsByTypeResult = {};
    Object.entries(this.statsByType).forEach(([type, stats]) => {
      const total = stats.hits + stats.misses;
      statsByTypeResult[type] = {
        ...stats,
        total,
        hitRate: total > 0 ? ((stats.hits / total) * 100).toFixed(2) + '%' : 'N/A'
      };
    });

    return {
      total: {
        ...this.stats,
        totalRequests,
        hitRate: hitRate + '%'
      },
      byType: statsByTypeResult,
      isConnected: this.isConnected
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    
    Object.keys(CacheStrategies).forEach(type => {
      this.statsByType[type] = { hits: 0, misses: 0 };
    });
    
    console.log('[CacheService] 统计信息已重置');
  }

  /**
   * 健康检查
   * @returns {Promise<Object>} 健康状态
   */
  async healthCheck() {
    try {
      await this.ensureConnection();
      
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        connected: this.isConnected,
        latency: `${latency}ms`,
        stats: this.getStats()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * 关闭连接
   */
  async close() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
        console.log('[CacheService] Redis 连接已关闭');
      } catch (error) {
        console.error('[CacheService] 关闭连接失败:', error.message);
      }
    }
  }
}

// 导出单例和常量
const cacheService = new CacheService();

module.exports = {
  CacheService,
  cacheService,
  CacheStrategies
};