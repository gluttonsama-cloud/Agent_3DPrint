/**
 * Mock MongoDB - 内存数据库
 * 用于在没有真实 MongoDB 的情况下进行本地开发和测试
 * 
 * 使用方法：
 * 1. 设置环境变量 MOCK_DB=true
 * 2. 正常启动应用，会自动使用 Mock 数据库
 */

class MockCollection {
  constructor(name, store) {
    this.name = name;
    this.store = store;
    if (!store[name]) {
      store[name] = [];
    }
  }

  // 插入文档
  async insertOne(doc) {
    const _id = new mongoose.Types.ObjectId();
    const newDoc = { ...doc, _id };
    this.store[this.name].push(newDoc);
    return { insertedId: _id, ack: true };
  }

  async insertMany(docs) {
    const insertedIds = [];
    const toInsert = docs.map(doc => {
      const _id = new mongoose.Types.ObjectId();
      insertedIds.push(_id);
      return { ...doc, _id };
    });
    this.store[this.name].push(...toInsert);
    return { insertedIds, ack: true };
  }

  // 查找文档
  async find(query = {}, options = {}) {
    let results = this.store[this.name].filter(doc => matchQuery(doc, query));
    
    // 投影
    if (options.projection) {
      results = results.map(doc => projectFields(doc, options.projection));
    }
    
    // 排序
    if (options.sort) {
      const sortKeys = Object.keys(options.sort);
      results.sort((a, b) => {
        for (const key of sortKeys) {
          const direction = options.sort[key];
          if (a[key] < b[key]) return -1 * direction;
          if (a[key] > b[key]) return 1 * direction;
        }
        return 0;
      });
    }
    
    // 限制
    if (options.limit) {
      results = results.slice(0, options.limit);
    }
    
    // 跳过
    if (options.skip) {
      results = results.slice(options.skip);
    }
    
    return {
      toArray: async () => results
    };
  }

  async findOne(query = {}) {
    return this.store[this.name].find(doc => matchQuery(doc, query)) || null;
  }

  // 更新文档
  async updateOne(query, update) {
    const index = this.store[this.name].findIndex(doc => matchQuery(doc, query));
    if (index === -1) return { matchedCount: 0, modifiedCount: 0 };
    
    const doc = this.store[this.name][index];
    applyUpdate(doc, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(query, update) {
    let count = 0;
    this.store[this.name].forEach(doc => {
      if (matchQuery(doc, query)) {
        applyUpdate(doc, update);
        count++;
      }
    });
    return { matchedCount: count, modifiedCount: count };
  }

  // 删除文档
  async deleteOne(query = {}) {
    const index = this.store[this.name].findIndex(doc => matchQuery(doc, query));
    if (index === -1) return { deletedCount: 0 };
    this.store[this.name].splice(index, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(query = {}) {
    const before = this.store[this.name].length;
    this.store[this.name] = this.store[this.name].filter(doc => !matchQuery(doc, query));
    return { deletedCount: before - this.store[this.name].length };
  }

  // 聚合
  async aggregate(pipeline = []) {
    let results = [...this.store[this.name]];
    
    for (const stage of pipeline) {
      if (stage.$match) {
        results = results.filter(doc => matchQuery(doc, stage.$match));
      } else if (stage.$group) {
        // 简单的分组实现
        const groups = {};
        results.forEach(doc => {
          const key = extractGroupKey(doc, stage.$group._id);
          if (!groups[key]) groups[key] = [];
          groups[key].push(doc);
        });
        results = Object.values(groups);
      }
    }
    
    return {
      toArray: async () => results
    };
  }

  // 计数
  async countDocuments(query = {}) {
    return this.store[this.name].filter(doc => matchQuery(doc, query)).length;
  }
}

// 简单的查询匹配函数
function matchQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;
  
  for (const key in query) {
    const queryValue = query[key];
    const docValue = getNestedValue(doc, key);
    
    // 处理 MongoDB 操作符
    if (typeof queryValue === 'object' && queryValue !== null) {
      if (queryValue.$eq !== undefined && docValue !== queryValue.$eq) return false;
      if (queryValue.$ne !== undefined && docValue === queryValue.$ne) return false;
      if (queryValue.$gt !== undefined && docValue <= queryValue.$gt) return false;
      if (queryValue.$gte !== undefined && docValue < queryValue.$gte) return false;
      if (queryValue.$lt !== undefined && docValue >= queryValue.$lt) return false;
      if (queryValue.$lte !== undefined && docValue > queryValue.$lte) return false;
      if (queryValue.$in !== undefined && !queryValue.$in.includes(docValue)) return false;
      if (queryValue.$nin !== undefined && queryValue.$nin.includes(docValue)) return false;
      if (queryValue.$exists !== undefined && (docValue === undefined) === queryValue.$exists) return false;
    } else {
      // 简单相等匹配
      if (docValue !== queryValue) return false;
    }
  }
  
  return true;
}

// 获取嵌套值（支持 "a.b.c" 格式）
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// 应用更新操作符
function applyUpdate(doc, update) {
  for (const op in update) {
    if (op === '$set') {
      for (const key in update.$set) {
        setNestedValue(doc, key, update.$set[key]);
      }
    } else if (op === '$unset') {
      for (const key in update.$unset) {
        delete getNestedObject(doc, key);
      }
    } else if (op === '$inc') {
      for (const key in update.$inc) {
        const current = getNestedValue(doc, key) || 0;
        setNestedValue(doc, key, current + update.$inc[key]);
      }
    } else if (op === '$push') {
      for (const key in update.$push) {
        const arr = getNestedValue(doc, key) || [];
        arr.push(update.$push[key]);
        setNestedValue(doc, key, arr);
      }
    }
  }
}

// 设置嵌套值
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

// 获取嵌套对象
function getNestedObject(obj, path) {
  const keys = path.split('.');
  return keys.reduce((current, key) => current?.[key], obj);
}

// 投影字段
function projectFields(doc, projection) {
  const result = {};
  for (const key in projection) {
    if (projection[key]) {
      const value = getNestedValue(doc, key);
      if (value !== undefined) {
        setNestedValue(result, key, value);
      }
    }
  }
  return Object.keys(result).length > 0 ? result : doc;
}

// 提取分组键
function extractGroupKey(doc, groupId) {
  if (typeof groupId === 'string') {
    return getNestedValue(doc, groupId.substring(1)); // 去掉 "$"
  }
  return 'default';
}

// Mock ObjectId
const mongoose = {
  Types: {
    ObjectId: class {
      constructor() {
        this.id = Math.random().toString(36).substr(2, 24);
      }
      toString() {
        return this.id;
      }
      toJSON() {
        return this.id;
      }
    }
  }
};

// Mock 数据库连接
class MockConnection {
  constructor() {
    this.store = {};
    this.readyState = 1; // 1 = connected
  }

  collection(name) {
    return new MockCollection(name, this.store);
  }

  async close() {
    this.readyState = 0; // 0 = disconnected
    console.log('[Mock MongoDB] 连接已关闭');
  }
}

// 模拟 Mongoose
const mockMongoose = {
  connection: new MockConnection(),
  
  connect: async (uri) => {
    console.log(`[Mock MongoDB] 模拟连接到：${uri}`);
    console.log('[Mock MongoDB] 使用内存存储，数据在重启后会被清除');
    return mockMongoose.connection;
  },
  
  disconnect: async () => {
    await mockMongoose.connection.close();
  },
  
  Types: mongoose.Types
};

// 连接函数
async function connect() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/3d-head-modeling';
  
  try {
    await mockMongoose.connect(uri);
    return mockMongoose.connection;
  } catch (error) {
    console.error('[Mock MongoDB] 连接错误:', error.message);
    throw error;
  }
}

async function disconnect() {
  try {
    await mockMongoose.disconnect();
    console.log('[Mock MongoDB] 已断开连接');
  } catch (error) {
    console.error('[Mock MongoDB] 断开连接错误:', error.message);
    throw error;
  }
}

module.exports = {
  connect,
  disconnect,
  mongoose: mockMongoose
};
