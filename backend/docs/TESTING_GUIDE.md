# 测试指南 - Agent 决策 API 和 Socket.IO

> 3D 打印多 Agent 系统 - 测试文档  
> 创建时间：2026-03-06  
> 状态：✅ 已完成

---

## 📋 目录

1. [测试环境准备](#测试环境准备)
2. [智谱 AI 连接测试](#智谱 ai 连接测试)
3. [集成测试](#集成测试)
4. [手动 API 测试](#手动 api 测试)
5. [故障排查](#故障排查)

---

## 🛠️ 测试环境准备

### 前提条件

确保以下服务已安装并运行：

1. **MongoDB** - 端口 27017
2. **Redis** - 端口 6379
3. **Node.js** - 版本 18+

### 安装依赖

```bash
cd backend
npm install
```

### 配置环境变量

编辑 `backend/.env` 文件：

```bash
# 数据库配置
MONGODB_URI=mongodb://localhost:27017/3d-printing-system
REDIS_HOST=localhost
REDIS_PORT=6379

# LLM 配置（智谱 AI）
LLM_PROVIDER=zhipu
ZHIPU_API_KEY=your_api_key_here
ZHIPU_MODEL=glm-4-flash

# 后端服务配置
PORT=3001
NODE_ENV=development
```

---

## 🧪 智谱 AI 连接测试

### 测试目的

验证智谱 AI LLM 的连接和调用是否正常。

### 运行测试

```bash
cd backend
npm run test:zhipu
```

### 预期输出

```
🔍 开始测试智谱 AI 连接...

✅ LLM 实例创建成功

📤 发送测试消息...
✅ 连接测试成功！

📝 模型回复：
---
你好！我是一个 AI 助手，可以帮助你回答问题、撰写文本、编程等。
---

📊 Token 使用统计：
   - 输入：15 tokens
   - 输出：28 tokens
   - 总计：43 tokens
```

### 故障排查

**问题 1：LLM 实例创建失败**

```
❌ 连接测试失败！
错误详情：Cannot find module 'zhipuai'
```

**解决方案：**
```bash
npm install zhipuai
```

**问题 2：API Key 无效**

```
❌ 连接测试失败！
错误详情：Invalid API Key
```

**解决方案：**
1. 检查 `.env` 文件中的 `ZHIPU_API_KEY` 是否正确
2. 登录智谱 AI 控制台验证 API Key 状态
3. 确认已领取免费额度

---

## 🔌 集成测试

### 测试目的

完整测试 Agent 决策 API 和 Socket.IO 实时推送功能。

### 测试内容

1. ✅ Socket.IO 连接测试
2. ✅ 健康检查 API
3. ✅ Agent 决策 API（触发协调 Agent）
4. ✅ 决策历史查询
5. ✅ Agent 状态查询
6. ✅ Socket.IO 事件推送验证

### 运行测试

**步骤 1：启动后端服务**

```bash
cd backend
npm run dev
```

看到以下输出表示启动成功：

```
╔════════════════════════════════════════════════════════╗
║  3D Head Modeling API - v2.0.0 (混元 + 七牛云版)        ║
╠════════════════════════════════════════════════════════╣
║  Server running on port 3001                          ║
║  Environment: development
║  Health: http://localhost:3001/health                 ║
║  WebSocket: ws://localhost:3001                       ║
╚════════════════════════════════════════════════════════╝
```

**步骤 2：在另一个终端运行测试**

```bash
cd backend
npm run test:integration
```

### 预期输出

```
============================================================
🧪 Agent 决策 API 和 Socket.IO 集成测试
============================================================
后端地址：http://localhost:3001
测试订单 ID: TEST_1234567890

🔌 测试 1: Socket.IO 连接测试

✅ Socket.IO 连接成功
   连接 ID: abc123xyz

🏥 测试 2: 健康检查 API

✅ 健康检查通过
   状态：ok
   版本：2.0.0
   时间：2026-03-06T10:00:00.000Z

🤖 测试 3: Agent 决策 API (TEST_1234567890)

📤 发送协调 Agent 决策请求...

✅ 决策 API 调用成功
   响应状态：200
   决策 ID: dec_1234567890
   决策结果：auto_approve
   置信度：0.95

⏳ 等待 Socket.IO 事件推送 (3 秒)...

📨 收到 Agent 事件：decision
   Agent: coordinator_agent
   订单：TEST_1234567890
   决策：auto_approve

📜 测试 4: 查询决策历史 (TEST_1234567890)

✅ 决策历史查询成功
   决策数量：1

   最近决策:
   1. [scheduling] auto_approve
      置信度：0.95

📊 测试 5: Agent 状态查询

✅ Agent 状态查询成功
   Agent ID: coordinator_agent
   状态：ready
   工具数量：2
   协调任务统计:
     - 总计：10
     - 处理中：1
     - 已完成：9

============================================================
📊 测试结果统计
============================================================
✅ 通过：5
❌ 失败：0
📝 总计：5
============================================================

🎉 所有测试通过！

🔌 Socket.IO 连接已关闭
```

---

## 🔧 手动 API 测试

### 使用 cURL 测试

#### 1. 健康检查

```bash
curl http://localhost:3001/health
```

**响应：**
```json
{
  "status": "ok",
  "time": "2026-03-06T10:00:00.000Z",
  "version": "2.0.0",
  "api": "hunyuan-qiniu"
}
```

#### 2. 触发协调 Agent 决策

```bash
curl -X POST http://localhost:3001/api/agent-decisions/decide \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "coordinator",
    "action": "review_order",
    "data": {
      "orderId": "TEST_MANUAL_001",
      "context": {
        "priority": "normal",
        "orderValue": 1000
      }
    }
  }'
```

**响应：**
```json
{
  "success": true,
  "data": {
    "decisionId": "dec_xxx",
    "agentId": "coordinator_agent",
    "decisionType": "scheduling",
    "decisionResult": "auto_approve",
    "confidence": 0.95,
    "rationale": "订单参数正常，自动通过审核",
    "timestamp": "2026-03-06T10:00:00.000Z"
  }
}
```

#### 3. 查询订单决策历史

```bash
curl http://localhost:3001/api/agent-decisions/order/TEST_MANUAL_001
```

**响应：**
```json
{
  "success": true,
  "data": {
    "orderId": "TEST_MANUAL_001",
    "decisions": [
      {
        "_id": "dec_xxx",
        "agentId": "coordinator_agent",
        "decisionType": "scheduling",
        "decisionResult": "auto_approve",
        "confidence": 0.95,
        "rationale": "订单参数正常",
        "createdAt": "2026-03-06T10:00:00.000Z"
      }
    ]
  }
}
```

#### 4. 查询协调 Agent 状态

```bash
curl http://localhost:3001/api/agent-decisions/coordinator/status
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": "coordinator_agent",
    "name": "协调 Agent",
    "state": "ready",
    "tools": ["coordinateOrder", "makeDecision"],
    "coordinationTasks": {
      "total": 10,
      "processing": 1,
      "completed": 9,
      "failed": 0
    }
  }
}
```

---

## 🧪 Socket.IO 前端测试

### 创建测试页面

创建 `backend/test-socket.html`：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Socket.IO 测试</title>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .event { background: #f0f0f0; padding: 10px; margin: 5px 0; border-left: 4px solid #4CAF50; }
    .error { background: #ffebee; border-left-color: #f44336; }
    h2 { color: #333; }
  </style>
</head>
<body>
  <h1>🔌 Socket.IO 连接测试</h1>
  <div id="status">正在连接...</div>
  <h2>收到的事件：</h2>
  <div id="events"></div>

  <script>
    const socket = io('http://localhost:3001', {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });

    const statusDiv = document.getElementById('status');
    const eventsDiv = document.getElementById('events');

    socket.on('connect', () => {
      statusDiv.innerHTML = '✅ 连接成功！ID: ' + socket.id;
      statusDiv.style.color = 'green';
    });

    socket.on('connect_error', (error) => {
      statusDiv.innerHTML = '❌ 连接失败：' + error.message;
      statusDiv.style.color = 'red';
    });

    socket.on('agent-event', (event) => {
      addEvent('📨 Agent 事件', event);
    });

    socket.on('agent-state-change', (event) => {
      addEvent('📊 状态变化', event);
    });

    function addEvent(type, data) {
      const div = document.createElement('div');
      div.className = 'event';
      div.innerHTML = `
        <strong>${type}</strong><br>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `;
      eventsDiv.appendChild(div);
    }
  </script>
</body>
</html>
```

### 使用浏览器测试

1. 启动后端服务：`npm run dev`
2. 在浏览器中打开：`http://localhost:3001/test-socket.html`
3. 观察连接状态和收到的事件

---

## 🐛 故障排查

### 问题 1：后端服务无法启动

**错误信息：**
```
Error: Cannot find module 'socket.io'
```

**解决方案：**
```bash
npm install socket.io
```

### 问题 2：Socket.IO 连接失败

**错误信息：**
```
❌ Socket.IO 连接失败
错误：xhr poll error
```

**解决方案：**

1. 检查后端服务是否运行
2. 验证 CORS 配置：

```javascript
// backend/src/app.js
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',  // 或你的前端地址
    methods: ['GET', 'POST']
  }
});
```

3. 检查防火墙设置

### 问题 3：Agent 未响应决策请求

**错误信息：**
```
❌ 决策 API 调用失败
状态码：404
错误：协调 Agent 未就绪
```

**解决方案：**

1. 检查 Agent 注册日志：
```
[AgentRegistry] Agent 已注册：coordinator_agent
```

2. 确认 Agent 初始化成功：
```
[CoordinatorAgent] 协调 Agent 初始化完成
```

3. 检查 LLM 配置是否正确

### 问题 4：测试超时

**错误信息：**
```
❌ Socket.IO 连接超时
```

**解决方案：**

1. 增加超时时间
2. 检查网络连接
3. 确认端口 3001 未被占用

---

## 📊 测试覆盖率

| 测试项 | 状态 | 说明 |
|--------|------|------|
| Socket.IO 连接 | ✅ | WebSocket 实时通信 |
| 健康检查 API | ✅ | 服务可用性验证 |
| Agent 决策 API | ✅ | 触发 Agent 决策 |
| 决策历史查询 | ✅ | 查询订单决策记录 |
| Agent 状态查询 | ✅ | 查询 Agent 运行状态 |
| 事件推送 | ✅ | Socket.IO 实时推送 |
| 错误处理 | ✅ | 异常情况处理 |

---

## 🔗 相关链接

- **API 文档**：`backend/docs/API_IMPLEMENTATION_GUIDE.md`
- **智谱 AI 集成**：`backend/docs/ZHIPU_AI_SETUP.md`
- **测试脚本**：
  - `scripts/test-zhipu-connection.js`
  - `scripts/test-agent-socket-integration.js`

---

**文档维护者**: AI Agent Team  
**最后更新**: 2026-03-06  
**版本**: v1.0.0
