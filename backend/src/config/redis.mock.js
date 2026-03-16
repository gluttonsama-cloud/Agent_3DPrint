/**
 * Mock Redis - 内存存储
 * 用于在没有真实 Redis 的情况下进行本地开发和测试
 * 
 * 支持常用命令：ping, get, set, del, expire, lpush, rpush, lrange 等
 */

class MockRedisClient {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    this.connected = false;
    this.queue = [];
    
    // 事件监听器
    this.eventListeners = {
      connect: [],
      close: [],
      error: []
    };
  }

  // 连接
  async connect() {
    this.connected = true;
    this.eventListeners.connect.forEach(cb => cb());
    console.log('[Mock Redis] 客户端已连接');
    return this;
  }

  // 断开连接
  async quit() {
    this.connected = false;
    this.eventListeners.close.forEach(cb => cb());
    console.log('[Mock Redis] 客户端连接已关闭');
    return 'OK';
  }

  async disconnect() {
    return this.quit();
  }

  // 事件监听
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  // PING 命令
  async ping() {
    if (!this.connected) throw new Error('Redis not connected');
    return 'PONG';
  }

  // SET 命令
  async set(key, value, ...args) {
    if (!this.connected) throw new Error('Redis not connected');
    
    let ttl = null;
    
    // 处理 EX 参数（过期时间）
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'EX' && args[i + 1]) {
        ttl = parseInt(args[i + 1], 10) * 1000; // 转换为毫秒
        i++;
      } else if (args[i] === 'PX' && args[i + 1]) {
        ttl = parseInt(args[i + 1], 10); // 已经是毫秒
      }
    }
    
    this.store.set(key, value);
    
    if (ttl) {
      this.setTTL(key, ttl);
    }
    
    return 'OK';
  }

  // GET 命令
  async get(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    if (this.isExpired(key)) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    
    return this.store.get(key) || null;
  }

  // DEL 命令
  async del(...keys) {
    if (!this.connected) throw new Error('Redis not connected');
    
    let count = 0;
    keys.forEach(key => {
      if (this.store.has(key)) {
        this.store.delete(key);
        this.ttls.delete(key);
        count++;
      }
    });
    
    return count;
  }

  // EXISTS 命令
  async exists(...keys) {
    let count = 0;
    keys.forEach(key => {
      if (this.store.has(key) && !this.isExpired(key)) {
        count++;
      }
    });
    return count;
  }

  // EXPIRE 命令（设置过期时间，秒）
  async expire(key, seconds) {
    if (!this.connected) throw new Error('Redis not connected');
    
    if (!this.store.has(key)) {
      return 0;
    }
    
    this.setTTL(key, seconds * 1000);
    return 1;
  }

  // PEXPIRE 命令（设置过期时间，毫秒）
  async pexpire(key, milliseconds) {
    if (!this.connected) throw new Error('Redis not connected');
    
    if (!this.store.has(key)) {
      return 0;
    }
    
    this.setTTL(key, milliseconds);
    return 1;
  }

  // TTL 命令（获取剩余过期时间，秒）
  async ttl(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    if (!this.store.has(key)) {
      return -2; // 键不存在
    }
    
    const expireTime = this.ttls.get(key);
    if (!expireTime) {
      return -1; // 永久存在
    }
    
    const remaining = expireTime - Date.now();
    if (remaining <= 0) {
      this.store.delete(key);
      this.ttls.delete(key);
      return -2; // 已过期
    }
    
    return Math.floor(remaining / 1000);
  }

  // PTTL 命令（获取剩余过期时间，毫秒）
  async pttl(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    if (!this.store.has(key)) {
      return -2;
    }
    
    const expireTime = this.ttls.get(key);
    if (!expireTime) {
      return -1;
    }
    
    const remaining = expireTime - Date.now();
    if (remaining <= 0) {
      this.store.delete(key);
      this.ttls.delete(key);
      return -2;
    }
    
    return remaining;
  }

  // LPUSH 命令（列表左推）
  async lpush(key, ...values) {
    if (!this.connected) throw new Error('Redis not connected');
    
    let list = this.store.get(key) || [];
    if (!Array.isArray(list)) {
      throw new Error('Key is not a list');
    }
    
    list.unshift(...values);
    this.store.set(key, list);
    return list.length;
  }

  // RPUSH 命令（列表右推）
  async rpush(key, ...values) {
    if (!this.connected) throw new Error('Redis not connected');
    
    let list = this.store.get(key) || [];
    if (!Array.isArray(list)) {
      throw new Error('Key is not a list');
    }
    
    list.push(...values);
    this.store.set(key, list);
    return list.length;
  }

  // LPOP 命令（列表左弹）
  async lpop(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const list = this.store.get(key);
    if (!list || list.length === 0) {
      return null;
    }
    
    const value = list.shift();
    return value;
  }

  // RPOP 命令（列表右弹）
  async rpop(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const list = this.store.get(key);
    if (!list || list.length === 0) {
      return null;
    }
    
    const value = list.pop();
    return value;
  }

  // LRANGE 命令（获取列表范围）
  async lrange(key, start, stop) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const list = this.store.get(key);
    if (!list) {
      return [];
    }
    
    if (stop === -1) {
      stop = list.length - 1;
    }
    
    return list.slice(start, stop + 1);
  }

  // LLEN 命令（获取列表长度）
  async llen(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const list = this.store.get(key);
    return list ? list.length : 0;
  }

  // HSET 命令（哈希设置）
  async hset(key, ...args) {
    if (!this.connected) throw new Error('Redis not connected');
    
    let hash = this.store.get(key) || {};
    if (typeof hash !== 'object' || Array.isArray(hash)) {
      throw new Error('Key is not a hash');
    }
    
    let count = 0;
    for (let i = 0; i < args.length; i += 2) {
      const field = args[i];
      const value = args[i + 1];
      if (!(field in hash)) {
        count++;
      }
      hash[field] = value;
    }
    
    this.store.set(key, hash);
    return count;
  }

  // HGET 命令（哈希获取）
  async hget(key, field) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const hash = this.store.get(key);
    if (!hash || typeof hash !== 'object') {
      return null;
    }
    
    return hash[field] || null;
  }

  // HGETALL 命令（获取所有哈希字段）
  async hgetall(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const hash = this.store.get(key);
    if (!hash || typeof hash !== 'object') {
      return {};
    }
    
    return hash;
  }

  // HDEL 命令（哈希删除）
  async hdel(key, ...fields) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const hash = this.store.get(key);
    if (!hash || typeof hash !== 'object') {
      return 0;
    }
    
    let count = 0;
    fields.forEach(field => {
      if (field in hash) {
        delete hash[field];
        count++;
      }
    });
    
    return count;
  }

  // INCR 命令（自增）
  async incr(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const current = parseInt(this.store.get(key) || '0', 10);
    const newValue = current + 1;
    this.store.set(key, newValue.toString());
    return newValue;
  }

  // INCRBY 命令（自增指定值）
  async incrby(key, amount) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const current = parseInt(this.store.get(key) || '0', 10);
    const newValue = current + amount;
    this.store.set(key, newValue.toString());
    return newValue;
  }

  // DECR 命令（自减）
  async decr(key) {
    if (!this.connected) throw new Error('Redis not connected');
    
    const current = parseInt(this.store.get(key) || '0', 10);
    const newValue = current - 1;
    this.store.set(key, newValue.toString());
    return newValue;
  }

  // KEYS 命令（匹配键，支持简单通配符）
  async keys(pattern) {
    if (!this.connected) throw new Error('Redis not connected');
    
    if (pattern === '*') {
      return Array.from(this.store.keys());
    }
    
    // 简单的通配符匹配
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }

  // FLUSHALL 命令（清空所有数据）
  async flushall() {
    if (!this.connected) throw new Error('Redis not connected');
    
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  // FLUSHDB 命令（清空当前数据库）
  async flushdb() {
    return this.flushall();
  }

  // 私有方法：设置 TTL
  setTTL(key, milliseconds) {
    const expireTime = Date.now() + milliseconds;
    this.ttls.set(key, expireTime);
    
    // 设置过期检查
    setTimeout(() => {
      if (this.store.has(key)) {
        this.store.delete(key);
        this.ttls.delete(key);
      }
    }, milliseconds);
  }

  // 私有方法：检查是否过期
  isExpired(key) {
    const expireTime = this.ttls.get(key);
    if (expireTime && Date.now() > expireTime) {
      return true;
    }
    return false;
  }
}

// 创建 Redis 连接的工厂函数
function createMockRedisClient() {
  const client = new MockRedisClient();
  client.connect();
  return client;
}

// 测试连接
async function testMockConnection() {
  const client = createMockRedisClient();
  
  try {
    const pingResult = await client.ping();
    console.log('[Mock Redis] 连接测试成功:', pingResult);
    
    await client.set('test-key', 'test-value');
    const getValue = await client.get('test-key');
    console.log('[Mock Redis] SET/GET 测试成功:', getValue);
    
    await client.quit();
    return true;
  } catch (error) {
    console.error('[Mock Redis] 连接测试失败:', error.message);
    return false;
  }
}

module.exports = {
  MockRedisClient,
  createMockRedisClient,
  testMockConnection
};
