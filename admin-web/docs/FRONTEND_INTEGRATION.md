# 前端对接真实 API 指南

> 3D 打印多 Agent 系统 - 前端集成文档  
> 创建时间：2026-03-06  
> 状态：✅ 已完成

---

## 📋 目录

1. [对接内容总览](#对接内容总览)
2. [修改的文件](#修改的文件)
3. [API 映射关系](#api 映射关系)
4. [运行和测试](#运行和测试)
5. [故障排查](#故障排查)

---

## ✅ 对接内容总览

### 已完成的修改

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `src/services/agentService.ts` | 对接真实 Agent API | ✅ 完成 |
| `src/services/api.ts` | 配置正确的 baseURL 和超时 | ✅ 完成 |
| `src/pages/AgentVisualization.tsx` | 更新 Socket.IO 配置 | ✅ 完成 |

### 修改的功能

#### 1. Agent 决策历史
- **之前**：返回硬编码的单条数据
- **现在**：调用 `GET /api/agent-decisions?limit=50` 获取真实数据

#### 2. Agent Profile
- **之前**：返回本地硬编码的 3 个 Agent 配置
- **现在**：调用 `GET /api/agents/:id/status` 获取真实状态

#### 3. 触发 Agent 决策
- **新增功能**：`triggerAgentDecision()` 函数
- 调用后端 API 执行真实的 Agent 决策

#### 4. Socket.IO 连接
- **修正**：使用环境变量 `VITE_SOCKET_SERVER`
- **之前**：连接到 `http://localhost:3000`（前端地址）
- **现在**：连接到 `http://localhost:3001`（后端地址）

---

## 📝 修改的文件

### 1. `src/services/agentService.ts`

**修改内容**：

```typescript
// ✅ 获取 Agent 决策历史
export const getAgentDecisions = async (limit: number = 50): Promise<AgentEvent[]> => {
  const response = await api.get('/agent-decisions', { params: { limit } });
  return response.data.data.map(decision => ({
    id: decision._id,
    type: 'decision',
    agent: decision.agentId.replace('_agent', ''),
    orderId: decision.orderId,
    decision: decision.decisionResult,
    timestamp: decision.createdAt,
    details: {
      inputs: decision.inputSnapshot,
      rules: decision.rulesMatched || [],
      confidence: decision.confidence,
      explanation: decision.rationale
    }
  }));
};

// ✅ 获取 Agent Profile
export const getAgentProfile = async (agentId: string): Promise<AgentProfile> => {
  const response = await api.get(`/agents/${agentId}/status`);
  // 返回真实数据 + 降级处理
};

// ✅ 新增：触发 Agent 决策
export const triggerAgentDecision = async (
  agentType: 'coordinator' | 'scheduler' | 'inventory',
  action: string,
  data: any
): Promise<any> => {
  const response = await api.post('/agent-decisions/decide', {
    agentType,
    action,
    data
  });
  return response.data;
};

// ✅ 新增：查询订单决策历史
export const getOrderDecisions = async (orderId: string): Promise<AgentEvent[]> => {
  const response = await api.get(`/agent-decisions/order/${orderId}`);
  return response.data.data.decisions;
};
```

### 2. `src/services/api.ts`

**修改内容**：

```typescript
// ✅ 从环境变量读取配置
const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL,
  timeout: 30000, // 增加到 30 秒，适应 LLM 响应时间
});
```

### 3. `src/pages/AgentVisualization.tsx`

**修改内容**：

```typescript
// ✅ 修正 Socket.IO 连接地址
const newSocket = io(
  process.env.VITE_SOCKET_SERVER || 'http://localhost:3001', // 修正为后端地址
  {
    path: '/socket.io',
    transports: ['websocket'],
  }
);
```

---

## 🔌 API 映射关系

### Agent 相关 API

| 前端方法 | 后端端点 | HTTP 方法 | 说明 |
|---------|---------|---------|------|
| `getAgentDecisions(limit)` | `/api/agent-decisions` | GET | 获取决策历史 |
| `getAgentProfile(agentId)` | `/api/agents/:id/status` | GET | 获取 Agent 状态 |
| `triggerAgentDecision(type, action, data)` | `/api/agent-decisions/decide` | POST | 触发决策 |
| `getOrderDecisions(orderId)` | `/api/agent-decisions/order/:orderId` | GET | 订单决策历史 |

### 响应数据适配

**后端响应格式**：
```json
{
  "success": true,
  "data": {
    "decisionId": "dec_xxx",
    "agentId": "coordinator_agent",
    "decisionType": "scheduling",
    "decisionResult": "auto_approve",
    "confidence": 0.95,
    "rationale": "订单参数正常",
    "createdAt": "2026-03-06T10:00:00.000Z"
  }
}
```

**前端适配格式**：
```typescript
{
  id: 'dec_xxx',
  type: 'decision',
  agent: 'coordinator',  // 去掉 '_agent' 后缀
  orderId: 'ORD-xxx',
  decision: 'auto_approve',
  timestamp: '2026-03-06T10:00:00.000Z',
  details: {
    inputs: { ... },
    rules: [],
    confidence: 0.95,
    explanation: '订单参数正常'
  }
}
```

---

## 🚀 运行和测试

### 前置条件

确保以下服务已启动：

1. **MongoDB** - 端口 27017
2. **Redis** - 端口 6379
3. **后端服务** - 端口 3001

### 步骤 1：启动后端服务

```bash
cd backend
npm run dev
```

看到以下输出表示启动成功：

```
╔════════════════════════════════════════════════════════╗
║  3D Head Modeling API - v2.0.0                         ║
╠════════════════════════════════════════════════════════╣
║  Server running on port 3001                          ║
║  WebSocket: ws://localhost:3001                       ║
╚════════════════════════════════════════════════════════╝
```

### 步骤 2：启动前端服务

```bash
cd admin-web
npm run dev
```

看到以下输出表示启动成功：

```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 步骤 3：访问 Agent 可视化页面

打开浏览器访问：`http://localhost:5173/agent-visualization`

### 步骤 4：验证功能

#### 测试 1：决策历史加载

1. 打开浏览器开发者工具（F12）
2. 查看 Network 标签
3. 应该看到请求：`GET http://localhost:3001/api/agent-decisions?limit=50`
4. 响应应该包含真实的决策数据

#### 测试 2：Socket.IO 连接

在控制台应该看到：
```
Socket.IO connected
```

#### 测试 3：实时事件推送

在后端触发一个 Agent 决策，前端应该实时收到事件推送。

---

## 🧪 手动测试脚本

### 测试后端 API

```bash
# 测试健康检查
curl http://localhost:3001/health

# 测试 Agent 决策 API
curl -X POST http://localhost:3001/api/agent-decisions/decide \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "coordinator",
    "action": "review_order",
    "data": {，
      "orderId": "TEST_FRONTEND_001",
      "context": {
        "priority": "normal"
      }
    }
  }'
```

### 测试前端连接

创建一个简单的测试页面 `admin-web/public/test-api.html`：

```html
<!DOCTYPE html>
<html>
<head>
  <title>API 测试</title>
</head>
<body>
  <h1>前端 API 连接测试</h1>
  <div id="result"></div>
  
  <script>
    async function testAPI() {
      try {
        const response = await fetch('http://localhost:3001/api/health');
        const data = await response.json();
        document.getElementById('result').innerHTML = 
          `<pre>${JSON.stringify(data, null, 2)}</pre>`;
      } catch (error) {
        document.getElementById('result').innerHTML = 
          `<p style="color: red;">连接失败：${error.message}</p>`;
      }
    }
    
    testAPI();
  </script>
</body>
</html>
```

访问：`http://localhost:5173/test-api.html`

---

## 🐛 故障排查

### 问题 1：前端无法连接后端

**错误信息**：
```
Network Error
Failed to fetch
```

**解决方案**：

1. 检查后端是否启动：
   ```bash
   curl http://localhost:3001/health
   ```

2. 检查环境变量配置：
   ```bash
   # admin-web/.env
   VITE_API_BASE_URL=http://localhost:3001/api
   VITE_SOCKET_SERVER=http://localhost:3001
   ```

3. 检查 CORS 配置（后端）：
   ```javascript
   // backend/src/app.js
   app.use(cors({
     origin: 'http://localhost:5173',
     credentials: true
   }));
   ```

### 问题 2：Socket.IO 连接失败

**错误信息**：
```
WebSocket connection failed
```

**解决方案**：

1. 确认后端 Socket.IO 已启动（查看后端日志）
2. 检查 Socket.IO 连接地址：
   ```typescript
   io('http://localhost:3001', {  // 不是 3000
     path: '/socket.io',
     transports: ['websocket', 'polling']
   });
   ```

3. 检查防火墙设置

### 问题 3：API 返回 404

**解决方案**：

1. 检查 API 端点是否正确
2. 查看后端路由配置：
   ```javascript
   // backend/src/app.js
   app.use('/api/agent-decisions', agentDecisionsRoutes);
   ```

3. 确认请求方法和参数

### 问题 4：LLM 响应超时

**现象**：前端等待时间过长

**解决方案**：

1. 增加超时时间：
   ```typescript
   // admin-web/src/services/api.ts
   const api = axios.create({
     baseURL,
     timeout: 60000, // 增加到 60 秒
   });
   ```

2. 检查后端 LLM 配置
3. 查看后端日志中的 LLM 调用情况

---

## 📊 数据流图

```
┌─────────────┐
│   Frontend  │
│ admin-web   │
└──────┬──────┘
       │
       │ HTTP Request
       │ GET /api/agent-decisions
       ▼
┌─────────────┐
│   Backend   │
│ Express.js  │
└──────┬──────┘
       │
       │ Service Layer
       ▼
┌─────────────┐
│ AgentDecisionService │
└──────┬──────┘
       │
       │ MongoDB Query
       ▼
┌─────────────┐
│  MongoDB    │
└─────────────┘

同时：

┌─────────────┐
│   Backend   │
└──────┬──────┘
       │
       │ Socket.IO Event
       │ 'agent-event'
       ▼
┌─────────────┐
│   Frontend  │
│ Socket.IO   │
└─────────────┘
```

---

## 🔗 相关链接

- **后端 API 文档**：`backend/docs/API_IMPLEMENTATION_GUIDE.md`
- **七牛云 AI 集成**：`backend/docs/QINIU_AI_SETUP.md`
- **测试指南**：`backend/docs/TESTING_GUIDE.md`

---

**文档维护者**: AI Agent Team  
**最后更新**: 2026-03-06  
**版本**: v1.0.0
