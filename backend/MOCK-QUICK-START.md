# 🚀 Mock 模式快速测试指南

## ✅ 步骤 1: 安装依赖

首先需要安装 `cross-env`（用于跨平台环境变量设置）：

```bash
cd backend
npm install cross-env --save-dev
```

## ✅ 步骤 2: 启动 Mock 模式

### 方式 1: 使用 npm 脚本（推荐）

```bash
# Windows / Linux / Mac 通用
npm run dev:mock
```

### 方式 2: 使用启动脚本（Windows）

```bash
# 双击运行或在命令行执行
start-dev-mock.bat
```

### 方式 3: 手动设置环境变量

**Windows (PowerShell)**:
```powershell
$env:MOCK_DB="true"; npm run dev
```

**Windows (CMD)**:
```cmd
set MOCK_DB=true && npm run dev
```

**Linux/Mac**:
```bash
MOCK_DB=true npm run dev
```

## ✅ 步骤 3: 验证启动成功

看到以下日志表示 Mock 模式已生效：

```
[MongoDB] 使用 Mock 模式（内存数据库）
[Redis] 使用 Mock 模式（内存存储）
[Mock Redis] 客户端已连接

╔════════════════════════════════════════════════════════╗
║  3D Head Modeling API - v2.0.0 (混元 + 七牛云版)        ║
╠════════════════════════════════════════════════════════╣
║  Server running on port 3001                           ║
║  Environment: development                              ║
║  Health: http://localhost:3001/health                  ║
║  WebSocket: ws://localhost:3001                        ║
╚════════════════════════════════════════════════════════╝
```

## ✅ 步骤 4: 测试 API

### 测试 1: 健康检查

```bash
curl http://localhost:3001/health
```

**预期响应**:
```json
{
  "status": "ok",
  "time": "2026-03-07T06:30:00.000Z",
  "version": "2.0.0",
  "api": "hunyuan-qiniu"
}
```

### 测试 2: 测试数据库操作

创建一个测试脚本 `backend/scripts/test-mock-db.js`:

```javascript
const { connect } = require('../src/db/connect');
const redis = require('../src/config/redis');

async function testMockDB() {
  console.log('=== Mock 数据库测试 ===\n');
  
  // 测试 MongoDB
  console.log('1. 测试 MongoDB 连接...');
  const db = await connect();
  console.log('   ✓ MongoDB 连接成功\n');
  
  // 测试 Redis
  console.log('2. 测试 Redis 连接...');
  const redisClient = redis.createRedisClient();
  const pingResult = await redisClient.ping();
  console.log('   ✓ Redis PING 响应:', pingResult);
  
  // 测试 Redis SET/GET
  console.log('\n3. 测试 Redis SET/GET...');
  await redisClient.set('test-key', 'test-value');
  const value = await redisClient.get('test-key');
  console.log('   ✓ SET/GET 测试:', value);
  
  // 测试 MongoDB 插入
  console.log('\n4. 测试 MongoDB 插入...');
  const testCollection = db.collection('test-models');
  const result = await testCollection.insertOne({
    name: 'Test Model',
    createdAt: new Date()
  });
  console.log('   ✓ 插入成功，ID:', result.insertedId);
  
  // 测试 MongoDB 查询
  console.log('\n5. 测试 MongoDB 查询...');
  const found = await testCollection.findOne({ name: 'Test Model' });
  console.log('   ✓ 查询结果:', found.name);
  
  console.log('\n=== 所有测试通过！===\n');
  
  // 清理
  await redisClient.quit();
  await db.close();
  
  process.exit(0);
}

testMockDB().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
```

运行测试：

```bash
npm run dev:mock
# 在另一个终端运行
node scripts/test-mock-db.js
```

## ✅ 步骤 5: 测试完整流程

### 场景 1: 上传照片 API

```bash
# 准备测试图片
# 然后使用 Postman 或 curl 测试
curl -X POST http://localhost:3001/api/upload \
  -F "photos=@test-image-1.jpg" \
  -F "photos=@test-image-2.jpg" \
  -F "photos=@test-image-3.jpg"
```

### 场景 2: 查询任务状态

```bash
curl http://localhost:3001/api/status/test-task-id-123
```

### 场景 3: WebSocket 连接

在浏览器控制台测试：

```javascript
const socket = io('ws://localhost:3001');

socket.on('connect', () => {
  console.log('✓ WebSocket 连接成功');
});

socket.on('agent-event', (event) => {
  console.log('✓ 收到 Agent 事件:', event);
});
```

## 🎯 常用命令速查

```bash
# 启动 Mock 模式开发服务器
npm run dev:mock

# 启动真实数据库模式
npm run dev:real

# 运行 Mock 模式测试
npm run test:mock

# 运行所有测试
npm test

# 清理并重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

## 📋 验证清单

启动后，逐项检查：

- [ ] 控制台显示 "[MongoDB] 使用 Mock 模式"
- [ ] 控制台显示 "[Redis] 使用 Mock 模式"
- [ ] 服务运行在 http://localhost:3001
- [ ] 访问 /health 返回 JSON
- [ ] 没有数据库连接错误
- [ ] WebSocket 可以连接

## 🔍 故障排查

### 问题 1: "Cannot find module 'cross-env'"

**解决**:
```bash
npm install cross-env --save-dev
```

### 问题 2: Mock 模式没有生效

**检查**:
```bash
# PowerShell
echo $env:MOCK_DB

# CMD
echo %MOCK_DB%

# 应该是 "true"
```

### 问题 3: 数据库连接错误

**解决**:
```bash
# 确保 .env 中的配置正确
# 或者临时重命名 .env 文件测试
mv .env .env.backup
npm run dev:mock
```

## 💡 下一步

1. ✅ 确认 Mock 模式正常启动
2. ✅ 测试关键 API 端点
3. ✅ 验证 WebSocket 连接
4. ✅ 准备部署到服务器（使用真实数据库）

---

**提示**: Mock 模式只用于开发测试，生产环境必须使用真实数据库！
