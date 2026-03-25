# Project Context

## 项目概述

**3D 头部建模打印系统** — 一站式智能 3D 打印服务平台，支持用户拍照建模、在线预览、下单打印，以及后台订单管理、设备监控、AI 智能助手。

---

## 技术栈

### 后端服务 (backend/)

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 18+ | 运行环境 |
| Express | 4.x | Web 框架 |
| MongoDB | 7.x | 数据库 |
| Redis | 7.x | 缓存/队列 |
| Bull | 4.x | 任务队列 |
| Socket.IO | 4.x | 实时通信 |
| LangChain | 1.x | AI Agent 框架 |

### 前端 (admin-web/)

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| React Router | 7.x | 路由 |
| Ant Design | 6.x | UI 组件库 |
| Tailwind CSS | 4.x | 样式框架 |
| ECharts | 6.x | 数据可视化 |
| Three.js | 0.182 | 3D 渲染 |
| Zustand | 5.x | 状态管理 |

### 用户端 (ai-3d-head-modeler/)

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| Vite | 5.x | 构建工具 |
| Capacitor | 6.x | 跨平台打包 |
| Three.js | 0.182 | 3D 渲染 |

### GPU 服务 (local-gpu-service/)

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.10+ | 运行环境 |
| rembg | 2.x | 背景移除 |
| Docker | - | 容器化部署 |

### 集成服务

| 服务 | 用途 |
|------|------|
| 腾讯混元 API | 3D 模型生成 |
| 七牛云 Kodo | 对象存储 |
| OctoPrint | 打印机集成 |

---

## 开发约定

### 代码风格

| 规则 | 值 |
|------|------|
| 缩进 | 2 空格 |
| 行宽限制 | 100 字符 |
| 注释语言 | 简体中文 |
| 变量/函数命名 | 英文 (camelCase) |
| 类/组件命名 | 英文 (PascalCase) |
| 文件命名 | 英文 (kebab-case) |

### 异步处理

- 优先使用 `async/await`
- 明确捕获错误，避免空 catch 块
- 使用 try-catch 包装异步操作

### 错误处理

- 统一错误格式
- 返回可解析的错误信息
- 记录错误日志

### 提交规范

```
feat: 新功能描述
fix: 修复问题描述
docs: 文档更新
style: 代码格式调整
refactor: 重构描述
test: 测试相关
chore: 构建/工具变更
```

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           用户端 (手机/PC)                               │
│                    ai-3d-head-modeler/                                   │
│  ┌────────┐   ┌────────┐   ┌────────────┐   ┌─────────┐   ┌──────────┐ │
│  │ Guide  │ → │ Upload │ → │ Processing │ → │ Preview │ → │  Order   │ │
│  │ 引导页  │   │ 上传页  │   │   处理中   │   │ 3D预览  │   │  下单页   │ │
│  └────────┘   └────────┘   └────────────┘   └─────────┘   └──────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           后端服务 (backend)                             │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                        API Layer (Express)                          ││
│  └─────────────────────────────────────────────────────────────────────┘│
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────────┐ │
│  │ Agent System │   │ Services     │   │ Queue/Workers (Bull + Redis) │ │
│  │ ├─Coordinator│   │ ├─OrderSvc   │   │ ├─orderWorker               │ │
│  │ ├─Scheduler  │   │ ├─DeviceSvc  │   │ ├─agentWorker               │ │
│  │ ├─Inventory  │   │ ├─MaterialSvc│   │ └─notificationWorker        │ │
│  │ └─Decision   │   │ └─Dashboard  │   │                              │ │
│  │    Engine    │   │    Service   │   │                              │ │
│  └──────────────┘   └──────────────┘   └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐                        ┌─────────────────────────────┐
│   GPU 服务       │                        │     管理端 (admin-web)       │
│ local-gpu-svc   │                        │  Dashboard / Orders / Agents │
│ rembg server    │                        │  Devices / Inventory         │
│ Port: 7000      │                        │                              │
└─────────────────┘                        └─────────────────────────────┘
```

---

## API 端点索引

### 认证

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/refresh` | 刷新 Token |

### 订单

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/orders` | 获取订单列表 |
| POST | `/api/orders` | 创建订单 |
| GET | `/api/orders/:id` | 获取订单详情 |
| PUT | `/api/orders/:id` | 更新订单 |
| POST | `/api/orders/:id/assign` | 分配设备 |
| POST | `/api/orders/:id/complete` | 完成订单 |
| POST | `/api/orders/:id/ai-review` | AI 审核订单 |

### 设备

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/devices` | 获取设备列表 |
| POST | `/api/devices` | 注册设备 |
| GET | `/api/devices/:id` | 获取设备详情 |
| PUT | `/api/devices/:id` | 更新设备 |
| DELETE | `/api/devices/:id` | 删除设备 |
| POST | `/api/devices/:id/ai-diagnose` | AI 诊断设备故障 |

### 材料

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/materials` | 获取材料列表 |
| POST | `/api/materials` | 添加材料 |
| GET | `/api/materials/low-stock` | 低库存材料 |
| PUT | `/api/materials/:id` | 更新库存 |

### 仪表盘

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/dashboard/stats` | 实时统计 |
| GET | `/api/dashboard/orders/trend` | 订单趋势 |
| GET | `/api/dashboard/devices/utilization` | 设备利用率 |

### Agent

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/agents` | 获取 Agent 列表 |
| GET | `/api/agents/:id/status` | Agent 状态 |
| POST | `/api/agents/decision` | 触发 Agent 决策 |
| GET | `/api/decision-logs` | 决策日志 |

### 上传

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/upload/photos` | 上传照片 |
| GET | `/api/upload/status/:taskId` | 查询处理状态 |

### 背景抠图

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/remove-bg/health` | 健康检查 |
| POST | `/api/remove-bg` | 移除背景 |
| POST | `/api/remove-bg/batch` | 批量处理 |

---

## Agent 系统

### 核心组件

```
backend/src/agents/
├── BaseAgent.js              # Agent 基类
├── CoordinatorAgent.js       # 协调 Agent (决策中枢)
├── SchedulerAgent.js         # 调度 Agent (设备分配)
├── InventoryAgent.js         # 库存 Agent (材料管理)
├── DecisionEngine.js         # 决策引擎 (规则引擎 + LLM)
├── registry.js               # Agent 注册中心
├── communication/            # Agent 通信
│   ├── AgentMessenger.js
│   ├── MessageQueue.js
│   ├── Protocol.js
│   └── TimeoutRetryManager.js
├── tools/                    # Agent 工具
│   ├── orderTools.js
│   ├── deviceTools.js
│   └── materialTools.js
├── rules/                    # 决策规则
│   ├── orderRules.js
│   ├── schedulingRules.js
│   └── inventoryRules.js
└── algorithms/               # 算法
    ├── DeviceAllocationAlgorithm.js
    └── InventoryForecastAlgorithm.js
```

### Agent 通信流程

```
用户请求 → CoordinatorAgent
                │
                ├──▶ SchedulerAgent (调度设备)
                │         └──▶ deviceTools
                │
                ├──▶ InventoryAgent (检查库存)
                │         └──▶ materialTools
                │
                └──▶ DecisionEngine (决策评估)
                          └──▶ LLM 辅助决策
```

---

## WebSocket 事件

| 事件 | 方向 | 描述 |
|------|------|------|
| `order:created` | Server → Client | 新订单创建通知 |
| `order:updated` | Server → Client | 订单状态更新 |
| `device:status` | Server → Client | 设备状态变更 |
| `agent:decision` | Server → Client | Agent 决策完成 |
| `print:progress` | Server → Client | 打印进度更新 |

---

## 环境变量

### 后端 (.env)

```bash
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/3dprint_db
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=your_bucket
HUNYUAN_SECRET_ID=your_secret_id
HUNYUAN_SECRET_KEY=your_secret_key
```

### 前端 (.env.local)

```bash
VITE_API_BASE_URL=http://localhost:3001/api
VITE_SOCKET_SERVER=http://localhost:3001
VITE_ENABLE_3D_PREVIEW=true
VITE_ENABLE_AI_ASSISTANT=true
```

---

## 常用命令

### 开发

```bash
# 后端
cd backend && npm run dev

# 管理端
cd admin-web && npm run dev

# 用户端
cd ai-3d-head-modeler && npm run dev

# GPU 服务
cd local-gpu-service && docker-compose up -d
```

### 测试

```bash
# 后端测试
cd backend && npm test

# E2E 测试
npx playwright test
```

### Docker

```bash
docker-compose up -d        # 启动所有服务
docker-compose down         # 停止所有服务
docker-compose logs -f      # 查看日志
```

---

## 相关文档

| 文档 | 路径 | 描述 |
|------|------|------|
| README | `/README.md` | 项目概览 |
| AGENTS | `/AGENTS.md` | 开发规范 |
| 部署指南 | `/docs/DEPLOYMENT_GUIDE.md` | 部署步骤 |
| 测试指南 | `/docs/TESTING_PROCEDURE.md` | 测试用例 |
| 打印机对接 | `/docs/PRINTER_INTEGRATION_GUIDE.md` | OctoPrint 集成 |