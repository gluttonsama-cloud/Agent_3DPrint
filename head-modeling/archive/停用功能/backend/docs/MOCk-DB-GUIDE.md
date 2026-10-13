# Mock 数据库模式使用指南

> 在没有真实 MongoDB/Redis 的情况下进行本地开发和测试

## 🚀 快速开始

### 方式 1：通过环境变量启动

```bash
# Windows (PowerShell)
$env:MOCK_DB="true"; npm run dev

# Windows (CMD)
set MOCK_DB=true && npm run dev

# Linux/Mac
MOCK_DB=true npm run dev
```

### 方式 2：修改 .env 文件

在 `backend/.env` 文件中添加：

```bash
# 启用 Mock 数据库模式
MOCK_DB=true
```

然后正常启动：

```bash
npm run dev
```

## 📋 启动确认

启动成功后，你应该看到以下日志：

```
[MongoDB] 使用 Mock 模式（内存数据库）
[Redis] 使用 Mock 模式（内存存储）
```

## ⚠️ Mock 模式的特点

### ✅ 支持的命令

#### MongoDB Mock:
- ✅ `insertOne`, `insertMany` - 插入文档
- ✅ `find`, `findOne` - 查询文档
- ✅ `updateOne`, `updateMany` - 更新文档
- ✅ `deleteOne`, `deleteMany` - 删除文档
- ✅ `countDocuments` - 计数
- ✅ `aggregate` - 聚合（基础支持）
- ✅ 支持 `$eq`, `$ne`, `$gt`, `$lt`, `$in` 等查询操作符

#### Redis Mock:
- ✅ `ping`, `get`, `set` - 基础命令
- ✅ `del`, `exists` - 删除和存在检查
- ✅ `expire`, `ttl`, `pttl` - 过期时间
- ✅ `lpush`, `rpush`, `lpop`, `rpop` - 列表操作
- ✅ `lrange`, `llen` - 列表查询
- ✅ `hset`, `hget`, `hgetall`, `hdel` - 哈希操作
- ✅ `incr`, `decr`, `incrby` - 计数器
- ✅ `keys`, `flushall`, `flushdb` - 其他命令

### ❌ 限制和注意事项

1. **数据持久化**
   - ❌ Mock 数据存储在内存中
   - ❌ 重启服务后数据会丢失
   - ✅ 适合开发测试，不适合生产

2. **功能限制**
   - ⚠️ MongoDB 索引功能不支持
   - ⚠️ Redis 发布/订阅功能不支持
   - ⚠️ MongoDB 复杂聚合功能有限支持
   - ⚠️ Redis 事务功能不支持

3. **性能差异**
   - ⚠️ Mock 模式比真实数据库慢
   - ⚠️ 不适合性能测试

##  典型使用场景

### 1. 本地 API 开发

```bash
# 1. 启用 Mock 模式
$env:MOCK_DB="true"; npm run dev

# 2. 测试 API
curl http://localhost:3001/health
```

### 2. 单元测试

```javascript
// 测试文件中自动使用 Mock 数据库
process.env.MOCK_DB = 'true';

// 导入的模块会自动使用 Mock
const { connect } = require('../src/db/connect');
const redis = require('../src/config/redis');

// 运行测试
npm test
```

### 3. 快速原型验证

```bash
# 无需安装数据库，立即开始编码
$env:MOCK_DB="true"; npm run dev

# 验证功能后，再部署到服务器
```

## 🔄 切换回真实数据库

### 方式 1：临时切换

```bash
# 关闭 Mock 模式
$env:MOCK_DB="false"; npm run dev
```

### 方式 2：修改 .env

```bash
# 注释掉或删除这行
# MOCK_DB=true
```

### 方式 3：确保环境变量优先级

```bash
# 命令行环境变量优先级最高
MOCK_DB=false npm run dev  # 会覆盖 .env 中的设置
```

## 📊 验证 Mock 模式是否生效

### 检查 MongoDB Mock

启动后查看控制台输出：

```
[MongoDB] 使用 Mock 模式（内存数据库）
MongoDB connected: mongodb://localhost:27017/3d-head-modeling
```

### 检查 Redis Mock

启动后查看控制台输出：

```
[Redis] 使用 Mock 模式（内存存储）
[Mock Redis] 客户端已连接
```

### 测试 API

```bash
# 健康检查
curl http://localhost:3001/health

# 应该返回：
{
  "status": "ok",
  "time": "2026-03-07T...",
  "version": "2.0.0",
  "api": "hunyuan-qiniu"
}
```

## 💡 最佳实践

### 1. 开发环境配置

```bash
# .env.development
MOCK_DB=true
NODE_ENV=development
PORT=3001
```

### 2. 生产环境配置

```bash
# .env.production
MOCK_DB=false
NODE_ENV=production
MONGODB_URI=mongodb://user:pass@server:27017/db
REDIS_HOST=server
REDIS_PORT=6379
```

### 3. 测试脚本

```json
// package.json
{
  "scripts": {
    "dev": "nodemon src/app.js",
    "dev:mock": "cross-env MOCK_DB=true nodemon src/app.js",
    "dev:real": "cross-env MOCK_DB=false nodemon src/app.js",
    "test": "cross-env MOCK_DB=true jest"
  }
}
```

## 🐛 常见问题

### Q1: 为什么启动时报错 "Cannot find module './connect.mock'"?

**A**: 确保 Mock 文件存在：
- `backend/src/db/connect.mock.js`
- `backend/src/config/redis.mock.js`

### Q2: Mock 模式下数据能保存多久？

**A**: 只在服务运行期间有效。重启后数据会丢失。

### Q3: 可以用 Mock 模式测试 Bull 队列吗？

**A**: 部分支持。基础的 Redis 操作可以工作，但 Bull 的高级功能可能需要真实 Redis。

### Q4: 如何清理 Mock 数据？

**A**: 重启服务即可，或者在代码中调用 `flushall()`。

## 📝 故障排查

### 问题：Mock 模式没有生效

**检查步骤**：

1. 确认环境变量设置正确
   ```bash
   echo $env:MOCK_DB  # PowerShell
   echo %MOCK_DB%     # CMD
   ```

2. 检查控制台输出
   - 应该看到 "[MongoDB] 使用 Mock 模式"
   - 应该看到 "[Redis] 使用 Mock 模式"

3. 重启服务
   ```bash
   # 完全停止并重启
   Ctrl+C
   $env:MOCK_DB="true"; npm run dev
   ```

### 问题：API 返回数据库连接错误

**解决方法**：

1. 检查 `app.js` 中的错误处理
   ```javascript
   connect().catch(err => {
     console.error('数据库连接失败:', err.message);
     // Mock 模式下应该不抛出致命错误
   });
   ```

2. 确认 Mock 文件正确导出
   ```javascript
   // connect.mock.js 必须导出 connect 和 disconnect
   module.exports = { connect, disconnect };
   ```

## 🎓 下一步

1. ✅ 启动 Mock 模式测试 API
2. ✅ 验证所有功能正常工作
3. ✅ 部署到服务器时使用真实数据库

---

**文档版本**: v1.0  
**最后更新**: 2026-03-07  
**适用版本**: backend v2.0.0
