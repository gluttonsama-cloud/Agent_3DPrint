/**
 * Mock Mongoose - 完整实现
 * 用于在 Mock 模式下替代真实的 mongoose 模块
 */

// Mock ObjectId
class ObjectId {
  constructor(id = null) {
    this.id = id || this._generateId();
  }
  
  // 生成 24 位十六进制 ID（模拟 MongoDB ObjectId 格式）
  _generateId() {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 24; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
  
  toString() {
    return this.id;
  }
  
  toJSON() {
    return this.id;
  }
  
  equals(other) {
    return this.id === other.id;
  }
  
  static isValid(id) {
    if (typeof id !== 'string') return false;
    if (id.length !== 24) return false;
    // 检查是否为有效的十六进制字符串
    return /^[0-9a-fA-F]{24}$/.test(id);
  }
}

// Schema 类型
const SchemaTypes = {
  String: String,
  Number: Number,
  Boolean: Boolean,
  Date: Date,
  Buffer: Buffer,
  ObjectId: ObjectId,
  Mixed: Object,
  Array: Array,
  Map: Map
};

// Schema 类
class Schema {
  constructor(definition, options = {}) {
    this.definition = definition;
    this.options = {
      timestamps: false,
      ...options
    };
    this.indexes = [];
    this.methods = {};
    this.statics = {};
    this.virtuals = {};
  }
  
  // 静态属性 Types
  static Types = SchemaTypes;
  
  // 实例属性 Types（兼容 mongoose.Schema.Types.ObjectId 用法）
  get Types() {
    return SchemaTypes;
  }
  
  index(fields, options) {
    this.indexes.push({ fields, options });
  }
  
  method(name, fn) {
    this.methods[name] = fn;
  }
  
  static(name, fn) {
    this.statics[name] = fn;
  }
  
  virtual(name) {
    const virtual = {
      get: (fn) => {
        this.virtuals[name] = { get: fn };
        return virtual;
      },
      set: (fn) => {
        this.virtuals[name] = { ...this.virtuals[name], set: fn };
        return virtual;
      }
    };
    return virtual;
  }
}

// Mock Query 类 - 支持链式调用
class Query {
  constructor(collection, query, options = {}) {
    this.collection = collection;
    this.query = query;
    this.options = options;
    this.sortOptions = {};
    this.skipCount = 0;
    this.limitCount = 0;
    this.populateFields = [];
  }

  sort(sortOptions) {
    this.sortOptions = sortOptions;
    return this;
  }

  skip(count) {
    this.skipCount = count;
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  populate(field) {
    this.populateFields.push(field);
    return this;
  }

  select(fields) {
    // Mock select - 存储字段用于后续投影
    this.selectFields = typeof fields === 'string' ? fields.split(' ') : fields;
    return this;
  }

  lean() {
    // Mock 实现，不做任何事
    return this;
  }

  // findOne - 返回 this 以支持链式调用 (populate 等)
  findOne() {
    this.isFindOne = true;
    return this;
  }

  // findById - 返回 this 以支持链式调用
  findById(id) {
    this.isFindOne = true;
    this.query = { _id: id };
    return this;
  }

  // 支持 await
  then(resolve, reject) {
    this.exec().then(resolve).catch(reject);
  }

  async exec() {
    const collectionData = this.collection.store[this.collection.name] || [];
    let results = this.collection._deepCopy(collectionData)
      .filter(doc => this.collection._matchQuery(doc, this.query));
    
    // 排序
    if (Object.keys(this.sortOptions).length > 0) {
      const sortKeys = Object.keys(this.sortOptions);
      results.sort((a, b) => {
        for (const key of sortKeys) {
          const direction = this.sortOptions[key];
          const aVal = this.collection._getNestedValue(a, key);
          const bVal = this.collection._getNestedValue(b, key);
          if (aVal < bVal) return -1 * direction;
          if (aVal > bVal) return 1 * direction;
        }
        return 0;
      });
    }
    
    // 跳过
    if (this.skipCount > 0) {
      results = results.slice(this.skipCount);
    }
    
    // 限制
    if (this.limitCount > 0) {
      results = results.slice(0, this.limitCount);
    }
    
    // Mock populate - 简单返回，不做实际关联查询
    // 实际使用时应该在数据层面处理
    
    if (this.isFindOne) {
      return results.length > 0 ? results[0] : null;
    }
    
    return results;
  }
}

// Mock Collection
class MockCollection {
  constructor(name, store, schema) {
    this.name = name;
    this.store = store;
    this.schema = schema;
    if (!store[name]) {
      store[name] = [];
    }
  }

  // 插入文档
  async insertOne(doc) {
    const _id = new ObjectId();
    const newDoc = this._applyTimestamps({ ...doc, _id });
    this.store[this.name].push(newDoc);
    return { insertedId: _id, ack: true };
  }

  async insertMany(docs) {
    const insertedIds = [];
    const toInsert = docs.map(doc => {
      const _id = new ObjectId();
      insertedIds.push(_id);
      return this._applyTimestamps({ ...doc, _id });
    });
    this.store[this.name].push(...toInsert);
    return { insertedIds, ack: true };
  }

  // 查找文档
  async find(query = {}, options = {}) {
    let results = this._deepCopy(this.store[this.name])
      .filter(doc => this._matchQuery(doc, query));
    
    // 投影
    if (options.projection) {
      results = results.map(doc => this._projectFields(doc, options.projection));
    }
    
    // 排序
    if (options.sort) {
      const sortKeys = Object.keys(options.sort);
      results.sort((a, b) => {
        for (const key of sortKeys) {
          const direction = options.sort[key];
          const aVal = this._getNestedValue(a, key);
          const bVal = this._getNestedValue(b, key);
          if (aVal < bVal) return -1 * direction;
          if (aVal > bVal) return 1 * direction;
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
      sort: (sortOptions) => {
        results.sort((a, b) => {
          for (const key in sortOptions) {
            const direction = sortOptions[key];
            const aVal = this._getNestedValue(a, key);
            const bVal = this._getNestedValue(b, key);
            if (aVal < bVal) return -1 * direction;
            if (aVal > bVal) return 1 * direction;
          }
          return 0;
        });
        return {
          limit: (limit) => {
            results = results.slice(0, limit);
            return {
              skip: (skip) => {
                results = results.slice(skip);
                return {
                  toArray: async () => results
                };
              },
              toArray: async () => results
            };
          },
          toArray: async () => results
        };
      },
      limit: (limit) => {
        results = results.slice(0, limit);
        return {
          skip: (skip) => {
            results = results.slice(skip);
            return {
              toArray: async () => results
            };
          },
          toArray: async () => results
        };
      },
      skip: (skip) => {
        results = results.slice(skip);
        return {
          toArray: async () => results
        };
      },
      toArray: async () => results
    };
  }

  async findOne(query = {}) {
    return this._deepCopy(this.store[this.name].find(doc => this._matchQuery(doc, query))) || null;
  }

  // 更新文档
  async updateOne(query, update) {
    const index = this.store[this.name].findIndex(doc => this._matchQuery(doc, query));
    if (index === -1) return { matchedCount: 0, modifiedCount: 0 };
    
    const doc = this.store[this.name][index];
    this._applyUpdate(doc, update);
    if (this.schema?.options?.timestamps) {
      doc.updatedAt = new Date();
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(query, update) {
    let count = 0;
    this.store[this.name].forEach(doc => {
      if (this._matchQuery(doc, query)) {
        this._applyUpdate(doc, update);
        count++;
      }
    });
    return { matchedCount: count, modifiedCount: count };
  }

  // 删除文档
  async deleteOne(query = {}) {
    const index = this.store[this.name].findIndex(doc => this._matchQuery(doc, query));
    if (index === -1) return { deletedCount: 0 };
    this.store[this.name].splice(index, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(query = {}) {
    const before = this.store[this.name].length;
    this.store[this.name] = this.store[this.name].filter(doc => !this._matchQuery(doc, query));
    return { deletedCount: before - this.store[this.name].length };
  }

  // 聚合
  async aggregate(pipeline = []) {
    let results = this._deepCopy(this.store[this.name]);
    
    for (const stage of pipeline) {
      if (stage.$match) {
        results = results.filter(doc => this._matchQuery(doc, stage.$match));
      } else if (stage.$sort) {
        const sortKeys = Object.keys(stage.$sort);
        results.sort((a, b) => {
          for (const key of sortKeys) {
            const direction = stage.$sort[key];
            const aVal = this._getNestedValue(a, key);
            const bVal = this._getNestedValue(b, key);
            if (aVal < bVal) return -1 * direction;
            if (aVal > bVal) return 1 * direction;
          }
          return 0;
        });
      } else if (stage.$limit) {
        results = results.slice(0, stage.$limit);
      } else if (stage.$skip) {
        results = results.slice(stage.$skip);
      }
    }
    
    return {
      toArray: async () => results
    };
  }

  // 计数
  async countDocuments(query = {}) {
    return this.store[this.name].filter(doc => this._matchQuery(doc, query)).length;
  }
  
  async count(query = {}) {
    return this.countDocuments(query);
  }

  // 创建索引
  async createIndex(fields, options) {
    // Mock 实现，不做实际操作
    return 'ok';
  }

  // 私有方法
  _deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this._deepCopy(item));
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, this._deepCopy(v)]));
  }

  _applyTimestamps(doc) {
    if (this.schema?.options?.timestamps) {
      const now = new Date();
      doc.createdAt = now;
      doc.updatedAt = now;
    }
    return doc;
  }

  _matchQuery(doc, query) {
    if (!query || Object.keys(query).length === 0) return true;
    
    for (const key in query) {
      const queryValue = query[key];
      const docValue = this._getNestedValue(doc, key);
      
      // 处理 MongoDB 操作符
      if (typeof queryValue === 'object' && queryValue !== null) {
        // 先处理组合查询
        if (queryValue.$in !== undefined && queryValue.$nin !== undefined) {
          if (!queryValue.$in.includes(docValue) || queryValue.$nin.includes(docValue)) return false;
        } else {
          // 单个操作符
          if (queryValue.$eq !== undefined && docValue !== queryValue.$eq) return false;
          if (queryValue.$ne !== undefined && docValue === queryValue.$ne) return false;
          if (queryValue.$gt !== undefined && (docValue === undefined || docValue <= queryValue.$gt)) return false;
          if (queryValue.$gte !== undefined && (docValue === undefined || docValue < queryValue.$gte)) return false;
          if (queryValue.$lt !== undefined && (docValue === undefined || docValue >= queryValue.$lt)) return false;
          if (queryValue.$lte !== undefined && (docValue === undefined || docValue > queryValue.$lte)) return false;
          if (queryValue.$in !== undefined && !queryValue.$in.includes(docValue)) return false;
          if (queryValue.$nin !== undefined && queryValue.$nin.includes(docValue)) return false;
        }
        if (queryValue.$exists !== undefined && (docValue === undefined) === queryValue.$exists) return false;
        if (queryValue.$regex !== undefined) {
          const regex = new RegExp(queryValue.$regex, queryValue.$options || '');
          if (!regex.test(String(docValue || ''))) return false;
        }
      } else {
        // 简单相等匹配
        if (docValue !== queryValue) return false;
      }
    }
    
    return true;
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  _applyUpdate(doc, update) {
    for (const op in update) {
      if (op === '$set') {
        for (const key in update.$set) {
          this._setNestedValue(doc, key, update.$set[key]);
        }
      } else if (op === '$unset') {
        for (const key in update.$unset) {
          const parts = key.split('.');
          let current = doc;
          for (let i = 0; i < parts.length - 1; i++) {
            current = current[parts[i]];
          }
          delete current[parts[parts.length - 1]];
        }
      } else if (op === '$inc') {
        for (const key in update.$inc) {
          const current = this._getNestedValue(doc, key) || 0;
          this._setNestedValue(doc, key, current + update.$inc[key]);
        }
      } else if (op === '$push') {
        for (const key in update.$push) {
          const arr = this._getNestedValue(doc, key) || [];
          arr.push(update.$push[key]);
          this._setNestedValue(doc, key, arr);
        }
      } else if (op === '$pull') {
        for (const key in update.$pull) {
          const arr = this._getNestedValue(doc, key) || [];
          const value = update.$pull[key];
          this._setNestedValue(doc, key, arr.filter(item => item !== value));
        }
      }
    }
  }

  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  _projectFields(doc, projection) {
    const result = {};
    for (const key in projection) {
      if (projection[key]) {
        const value = this._getNestedValue(doc, key);
        if (value !== undefined) {
          this._setNestedValue(result, key, value);
        }
      }
    }
    return Object.keys(result).length > 0 ? result : doc;
  }
}

// Mock Model
class Model {
  constructor(name, store, schema) {
    this.collectionName = name.toLowerCase(); // 使用小写与存储一致
    this.store = store;
    this.schema = schema;
    this.collection = new MockCollection(name, store, schema);
    this.hooks = { pre: {}, post: {} };
  }

  static create(definition, options) {
    return new Schema(definition, options);
  }

  findById(id) {
    const self = this;
    const queryObj = {
      exec: async () => {
        // 使用 collection 来获取数据，与 find 保持一致
        const collection = self.collection.store[self.collection.name];
        const doc = collection?.find(d => {
          if (!d._id) return false;
          const docId = d._id;
          if (typeof docId === 'object' && docId.toString) {
            if (docId.toString() === id) return true;
            if (docId.id === id) return true;
          }
          if (docId === id) return true;
          return false;
        }) || null;
        
        // 如果找到文档，包装成带有 mongoose 方法的對象
        if (doc) {
          doc.save = async function() { return this; };
          doc.toObject = function() {
            const obj = {...this};
            delete obj.save;
            delete obj.toObject;
            delete obj.assignTask;
            return obj;
          };
          // 设备特定方法
          doc.assignTask = async function(orderId, estimatedCompletion) {
            this.currentTask = { orderId, startedAt: new Date(), estimatedCompletion };
            this.status = 'busy';
            return this.save();
          };
          doc.releaseTask = async function() {
            this.currentTask = null;
            this.status = 'idle';
            return this.save();
          };
        }
        return doc;
      },
      populate: function() { return this; },
      lean: function() { return this; }
    };
    queryObj.then = function(resolve, reject) {
      this.exec().then(resolve).catch(reject);
      return this;
    };
    return queryObj;
  }

  findByIdAndDelete(id) {
    return {
      exec: async () => {
        const index = this.store[this.collectionName].findIndex(doc => doc._id?.id === id || doc._id === id);
        if (index === -1) return null;
        return this.store[this.collectionName].splice(index, 1)[0];
      }
    };
  }

  findOneAndUpdate(query, update, options = {}) {
    return {
      exec: async () => {
        const index = this.store[this.collectionName].findIndex(doc => this._matchQuery(doc, query));
        if (index === -1) return null;
        const doc = this.store[this.collectionName][index];
        this._applyUpdate(doc, update);
        return options.new ? doc : this.store[this.collectionName][index];
      }
    };
  }

  // 静态方法代理 - 返回 Query 对象以支持链式调用
  find(query, options) {
    return new Query(this.collection, query, options);
  }

  findOne(query) {
    return new Query(this.collection, query).findOne();
  }

  insertOne(doc) {
    return this.collection.insertOne(doc);
  }

  insertMany(docs) {
    const insertedDocs = [];
    for (const doc of docs) {
      const result = this.collection.insertOne(doc);
      insertedDocs.push({ ...doc, _id: result.insertedId });
    }
    return Promise.resolve(insertedDocs);
  }

  updateOne(query, update) {
    return this.collection.updateOne(query, update);
  }

  updateMany(query, update) {
    return this.collection.updateMany(query, update);
  }

  deleteOne(query) {
    return this.collection.deleteOne(query);
  }

  deleteMany(query) {
    return this.collection.deleteMany(query);
  }

  countDocuments(query) {
    return this.collection.countDocuments(query);
  }

  aggregate(pipeline) {
    return this.collection.aggregate(pipeline);
  }

  createIndex(fields, options) {
    return this.collection.createIndex(fields, options);
  }

  // 虚拟的 populate
  populate() {
    return this;
  }

  // 辅助方法
  _matchQuery(doc, query) {
    if (!query || Object.keys(query).length === 0) return true;
    
    for (const key in query) {
      const queryValue = query[key];
      const docValue = this._getNestedValue(doc, key);
      
      if (typeof queryValue === 'object' && queryValue !== null) {
        if (queryValue.$eq !== undefined && docValue !== queryValue.$eq) return false;
        if (queryValue.$ne !== undefined && docValue === queryValue.$ne) return false;
        if (queryValue.$gt !== undefined && docValue <= queryValue.$gt) return false;
        if (queryValue.$gte !== undefined && docValue < queryValue.$gte) return false;
        if (queryValue.$lt !== undefined && docValue >= queryValue.$lt) return false;
        if (queryValue.$lte !== undefined && docValue > queryValue.$lte) return false;
        if (queryValue.$in !== undefined && !queryValue.$in.includes(docValue)) return false;
      } else {
        if (docValue !== queryValue) return false;
      }
    }
    
    return true;
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  _applyUpdate(doc, update) {
    for (const op in update) {
      if (op === '$set') {
        for (const key in update.$set) {
          this._setNestedValue(doc, key, update.$set[key]);
        }
      } else if (op === '$inc') {
        for (const key in update.$inc) {
          const current = this._getNestedValue(doc, key) || 0;
          this._setNestedValue(doc, key, current + update.$inc[key]);
        }
      }
    }
  }

  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
}

// Model 工厂函数 - 返回构造函数以支持 `new Model()` 语法
function model(name, schema) {
  const store = model._store || (model._store = {});
  const modelInstance = new Model(name, store, schema);
  
  // 复制静态方法
  if (schema && schema.statics) {
    Object.entries(schema.statics).forEach(([name, fn]) => {
      modelInstance[name] = fn.bind(modelInstance);
    });
  }
  
  // 构造函数 - 支持 `new Model({data})` 语法
  function ModelConstructor(data) {
    // 复制数据到实例
    Object.assign(this, data);
    this._modelName = name;
    this._store = store;
    this._schema = schema;
  }
  
  // 设置原型链
  ModelConstructor.prototype = Object.create(modelInstance);
  ModelConstructor.prototype.constructor = ModelConstructor;
  
  // 添加 save 方法到原型
  ModelConstructor.prototype.save = async function() {
    const collection = store[name] || (store[name] = []);
    
    // 生成 ObjectId
    if (!this._id) {
      this._id = new ObjectId();
    }
    
    // 添加时间戳
    const now = new Date();
    if (!this.createdAt) {
      this.createdAt = now;
    }
    this.updatedAt = now;
    
    // 转换为普通对象以便存储
    const docToSave = { ...this };
    delete docToSave._modelName;
    delete docToSave._store;
    delete docToSave._schema;
    
    // 保存到集合
    collection.push(docToSave);
    
    return this;
  };
  
  // 添加 toObject 方法
  ModelConstructor.prototype.toObject = function() {
    const obj = { ...this };
    delete obj._modelName;
    delete obj._store;
    delete obj._schema;
    return obj;
  };
  
  // 添加静态方法到构造函数
  ModelConstructor.findById = modelInstance.findById.bind(modelInstance);
  ModelConstructor.find = modelInstance.find.bind(modelInstance);
  ModelConstructor.findOne = modelInstance.findOne.bind(modelInstance);
  ModelConstructor.insertOne = modelInstance.insertOne.bind(modelInstance);
  ModelConstructor.insertMany = modelInstance.insertMany.bind(modelInstance);
  ModelConstructor.updateOne = modelInstance.updateOne.bind(modelInstance);
  ModelConstructor.updateMany = modelInstance.updateMany.bind(modelInstance);
  ModelConstructor.deleteOne = modelInstance.deleteOne.bind(modelInstance);
  ModelConstructor.deleteMany = modelInstance.deleteMany.bind(modelInstance);
  ModelConstructor.findByIdAndDelete = modelInstance.findByIdAndDelete.bind(modelInstance);
  ModelConstructor.findOneAndUpdate = modelInstance.findOneAndUpdate.bind(modelInstance);
  ModelConstructor.aggregate = modelInstance.aggregate.bind(modelInstance);
  ModelConstructor.countDocuments = modelInstance.countDocuments.bind(modelInstance);
  
  // 存储 collectionName
  ModelConstructor.collectionName = name;
  
  return ModelConstructor;
}

// 连接对象
const mockConnection = {
  readyState: 1,
  collection: (name, schema) => {
    const store = model._store || (model._store = {});
    return new MockCollection(name, store, schema);
  },
  close: async () => {
    mockConnection.readyState = 0;
    console.log('[Mock MongoDB] 连接已关闭');
  }
};

// 导出
module.exports = {
  Schema,
  model,
  Types: { ObjectId },
  connection: mockConnection,
  connect: async (uri) => {
    console.log(`[Mock Mongoose] 模拟连接到：${uri}`);
    mockConnection.readyState = 1;
    return mockConnection;
  },
  disconnect: async () => {
    await mockConnection.close();
  },
  set: () => {}, // Mock strictPopulate 设置
  modelNames: () => Object.keys(model._store || {}),
  // 添加 Schema.Types 兼容性
  SchemaTypes: SchemaTypes,
  // 让 mongoose.Schema.Types.ObjectId 可用
  get Schema$1() {
    return Schema;
  }
};

// 设置 Schema.Types 以便 mongoose.Schema.Types.ObjectId 可用
Schema.Types = SchemaTypes;
