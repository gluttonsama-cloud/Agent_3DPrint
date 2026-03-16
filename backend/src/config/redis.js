/**
 * Redis 配置文件
 * 支持真实 Redis 和 Mock 模式切换
 */

// 检查是否启用 Mock 模式
const useMock = process.env.MOCK_DB === 'true' || process.env.MOCK_DB === '1';

let redisModule;

if (useMock) {
  // Mock 模式
  redisModule = require('./redis.mock');
  console.log('[Redis] 使用 Mock 模式（内存存储）');
} else {
  // 真实模式
  const Redis = require('ioredis');
  redisModule = Redis;
}

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  connectTimeout: 10000,
  commandTimeout: 5000,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 1000, 10000);
    console.log(`[Redis] 重连尝试 ${times}，延迟 ${delay}ms`);
    return delay;
  },
  keepAlive: 60000,
  family: 4
};

function createRedisConnection() {
  if (useMock) {
    console.log('[Redis] Mock 连接配置:', {
      host: redisConfig.host,
      port: redisConfig.port,
      db: redisConfig.db
    });
    
    return {
      redis: redisConfig
    };
  }
  
  console.log('[Redis] 连接配置:', {
    host: redisConfig.host,
    port: redisConfig.port,
    db: redisConfig.db
  });

  return {
    redis: redisConfig
  };
}

function createRedisClient() {
  if (useMock) {
    return redisModule.createMockRedisClient();
  }
  
  const client = new redisModule(redisConfig);

  client.on('connect', () => {
    console.log('[Redis] 客户端已连接');
  });

  client.on('close', () => {
    console.log('[Redis] 客户端连接已关闭');
  });

  client.on('error', (err) => {
    console.error('[Redis] 客户端错误:', err.message);
  });

  return client;
}

async function testConnection() {
  const client = createRedisClient();
  
  try {
    await client.ping();
    console.log('[Redis] 连接测试成功');
    await client.quit();
    return true;
  } catch (error) {
    console.error('[Redis] 连接测试失败:', error.message);
    await client.quit();
    return false;
  }
}

module.exports = {
  redisConfig,
  createRedisConnection,
  createRedisClient,
  testConnection,
  useMock
};
