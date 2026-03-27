# 3D 头部建模打印系统

演示视频：https://arthurcheng-ys.space/videos.html
 访问服务
 用户端：http://111.62.241.109
 管理端：http://111.62.241.109/admin
 后端 API: http://111.62.241.109/api
 API 文档：http://111.62.241.109/api/api-docs

> 一站式智能 3D 打印服务平台，支持用户拍照建模、在线预览、下单打印，以及后台订单管理、设备监控、AI 智能助手。包含用户端、管理端、后端服务、GPU 服务四个子系统

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.x-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.x-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📖 快速链接

| 文档 | 描述 |
|------|------|
| [🚀 部署指南](docs/DEPLOYMENT_GUIDE.md) | Docker/手动部署完整步骤 |
| [🖨️ 打印机对接指南](docs/PRINTER_INTEGRATION_GUIDE.md) | OctoPrint 集成方案 |
| [🧪 测试指南](docs/TESTING_PROCEDURE.md) | 全流程测试用例 |
| [📋 AGENTS.md](AGENTS.md) | 项目开发规范 |
| [🤝 贡献指南](CONTRIBUTING.md) | 参与项目开发 |

---

## 项目简介

本系统是一个面向 3D 打印农场的智能管理平台，由四个子系统组成：

### 📱 用户端 (ai-3d-head-modeler)
- **3D 头部建模**: 拍照上传 → AI 生成 3D 模型 → 在线预览 → 下单打印
- **完整用户流程**: 引导页 → 上传页 → 处理中 → 预览 → 下单 → 支付 → 订单跟踪
- **技术栈**: React 19 + Three.js + Capacitor，支持 Android/iOS/Web 部署

### 🖥️ 管理端 (admin-web)
- **🤖 AI 智能助手**: 订单审核助手 + 设备诊断助手
- **📊 智能仪表盘**: 甘特图 + 雷达图 + Agent 活跃度图
- **🔄 业务闭环**: 自动化订单处理流程

### ⚙️ 后端服务 (backend)
- **API 服务**: RESTful API + WebSocket 实时通信
- **AI 引擎**: Agent 决策引擎 + 任务队列处理
- **存储服务**: 文件上传 + 七牛云存储

### 🎮 GPU 服务 (local-gpu-service)
- **背景抠图**: 人像背景移除，GPU 加速处理
- **批量处理**: 支持多图并发处理
- **部署方式**: 本地部署 + 内网穿透

---

## 项目架构

本系统由四个主要子系统组成：

### 1. 用户端 (ai-3d-head-modeler)

面向终端用户的手机端应用，提供：
- **📸 拍照引导** - 指导用户拍摄多角度照片
- **📤 照片上传** - 支持主视角、侧面、仰视等多角度
- **🔄 处理进度** - 实时显示 3D 模型生成进度
- **👁️ 3D 预览** - Three.js 渲染生成的 3D 头部模型
- **📦 订单创建** - 选择打印参数并下单
- **💳 支付功能** - 支持模拟支付流程
- **📋 订单跟踪** - 查看订单状态和历史

### 2. 管理端 (admin-web)

面向运营人员的后台管理系统，提供：
- **🤖 AI 智能助手** - 订单审核助手 + 设备诊断助手
- **📊 Dashboard** - 甘特图 + 雷达图 + Agent 活跃度图
- **📦 订单管理** - 创建、分配、跟踪订单
- **🖨️ 设备管理** - 监控打印机状态、分配任务
- **📦 库存管理** - 材料管理、库存预警
- **🤖 Agent 管理** - 多 Agent 协作可视化

### 3. 后端服务 (backend)

Node.js + Express API 服务，提供：
- RESTful API 端点
- WebSocket 实时通信
- Agent 决策引擎
- 任务队列处理
- 文件存储服务

### 4. GPU 服务 (local-gpu-service)

本地 GPU 背景抠图服务：
- 人像背景移除
- GPU 加速处理
- 内网穿透支持

### 系统交互图

```
┌─────────────────┐     ┌─────────────────┐
│   用户端 (手机)   │────▶│   后端服务 (API)  │
│  ai-3d-head-    │     │    backend/      │
│  modeler        │◀────│                 │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
┌─────────────────┐     ┌─────────────────┐
│   GPU 服务       │◀────│   管理端 (Web)   │
│ local-gpu-      │     │   admin-web     │
│ service         │     │                 │
└─────────────────┘     └─────────────────┘
```

### 用户端页面流程

```
Guide → Upload → Processing → Preview → Order → Payment → OrderStatus
  ↓        ↓         ↓           ↓        ↓        ↓
引导页   照片上传   处理中     3D预览   下单    支付结果   订单状态
```

---

## ✨ 功能特性

### AI 智能助手

| 功能 | 描述 |
|------|------|
| **AI 审核助手** | 自动分析 3D 模型拓扑结构，检测悬垂角度，预估打印时间和材料消耗，提供参数优化建议 |
| **AI 诊断助手** | 实时监测设备状态，诊断故障原因（如错误代码 E-042），生成维修领料单 |
| **库存 AI 预测** | 基于历史消耗数据预测 7 天后库存状态，提前预警材料短缺 |

### Dashboard 可视化

| 图表 | 功能 |
|------|------|
| **设备利用率甘特图** | 时间轴展示每台设备状态（打印中/空闲/维护/离线） |
| **库存预警雷达图** | 当前库存 vs AI 预测对比，识别短缺风险 |
| **Agent 活跃度图** | 审核/排期 Agent 处理量 + 决策成功率 |

### 业务闭环自动化

```
订单创建 → AI 审核 → 设备分配 → 打印执行 → 库存扣减 → 订单完成
    ↓           ↓          ↓          ↓          ↓
 自动排期   参数优化   WebSocket   进度监控   状态联动
```

---

## 技术栈

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 18+ | 运行环境 |
| Express | 4.x | Web 框架 |
| MongoDB | 7.x | 数据库 |
| Redis | 7.x | 缓存/队列 |
| Socket.IO | 4.x | 实时通信 |
| Bull | 4.x | 任务队列 |
| LangChain | 1.x | AI Agent 框架 |

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| React Router | 7.x | 路由 |
| Ant Design | 6.x | UI 组件库 |
| Tailwind CSS | 4.x | 样式框架 |
| ECharts | 6.x | 数据可视化 |
| Three.js | 0.182 | 3D 渲染 |
| Zustand | 5.x | 状态管理 |

### 集成服务

| 服务 | 用途 |
|------|------|
| 腾讯混元 API | 3D 模型生成 |
| Replicate API | 3D 模型生成（备选） |
| 七牛云 Kodo | 对象存储 |
| OctoPrint | 打印机集成 |
| DeepSeek-R1 | AI Agent 决策模型 |

---

## 快速开始

### Docker 部署（推荐）

```bash
# 克隆代码
git clone <repo-url>
cd 3d-print-agent-system

# 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 设置数据库密码等

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 验证服务状态
curl http://111.62.241.109/api/health

# 访问服务
# 用户端：http://111.62.241.109
# 管理端：http://111.62.241.109/admin
# 后端 API: http://111.62.241.109/api
# API 文档：http://111.62.241.109/api/api-docs
```

### 开发模式

```bash
# 后端服务
cd backend
npm install
npm run dev
# API: http://111.62.241.109/api

# 管理端（Web 后台）
cd admin-web
npm install
npm run dev
# 访问 http://111.62.241.109/admin

# 用户端（手机应用）
cd ai-3d-head-modeler
npm install
npm run dev
# 访问 http://111.62.241.109/

# GPU 服务（需要 Python 环境）
cd local-gpu-service
pip install -r requirements.txt
python src/server.py
# 服务：http://111.62.241.109:7000

# 验证各服务状态
curl http://111.62.241.109/api/health        # 后端
curl http://111.62.241.109:7000/api/remove-bg/health  # GPU 服务
```

---

## 项目结构

```
3d-print-agent-system/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── agents/            # AI Agent 实现
│   │   │   ├── BaseAgent.js           # Agent 基类
│   │   │   ├── CoordinatorAgent.js    # 协调 Agent
│   │   │   ├── InventoryAgent.js      # 库存 Agent
│   │   │   ├── SchedulerAgent.js      # 排期 Agent
│   │   │   ├── DecisionEngine.js      # 决策引擎
│   │   │   └── tools/                 # Agent 工具集
│   │   ├── routes/            # API 路由
│   │   │   ├── orders.js
│   │   │   ├── devices.js
│   │   │   ├── materials.js
│   │   │   ├── dashboard.js
│   │   │   └── agents.js
│   │   ├── services/          # 业务逻辑
│   │   │   ├── OrderService.js
│   │   │   ├── DeviceService.js
│   │   │   ├── MaterialService.js
│   │   │   └── DashboardService.js
│   │   ├── models/            # 数据模型
│   │   │   ├── Order.js
│   │   │   ├── Device.js
│   │   │   └── Material.js
│   │   ├── queues/            # 任务队列
│   │   ├── workers/           # 队列消费者
│   │   ├── db/                # 数据库连接
│   │   └── config/            # 配置文件
│   ├── scripts/               # 脚本工具
│   └── api_test/              # API 测试
├── admin-web/                  # 管理端 (Web)
│   ├── src/
│   │   ├── pages/             # 页面组件
│   │   │   ├── Dashboard.tsx          # 仪表盘
│   │   │   ├── OrderList.tsx          # 订单列表
│   │   │   ├── OrderDetail.tsx        # 订单详情（含 AI 审核）
│   │   │   ├── DeviceManagement.tsx   # 设备管理（含 AI 诊断）
│   │   │   ├── InventoryManagement.tsx
│   │   │   ├── AgentManagement.tsx    # Agent 管理
│   │   │   └── AgentVisualization.tsx # Agent 可视化
│   │   ├── components/        # 通用组件
│   │   │   ├── ModelViewer/           # 3D 模型查看器
│   │   │   ├── agent-flow/            # Agent 流程图组件
│   │   │   └── common/
│   │   ├── services/          # API 服务
│   │   │   ├── api.ts
│   │   │   ├── orderService.ts
│   │   │   ├── deviceService.ts
│   │   │   ├── websocketService.ts
│   │   │   └── agentService.ts
│   │   └── stores/            # 状态管理
│   └── dist/                  # 构建产物
├── ai-3d-head-modeler/         # 用户端 (手机 App)
│   ├── src/
│   │   ├── pages/             # 页面组件
│   │   │   ├── GuidePage.tsx          # 拍照引导页
│   │   │   ├── UploadPage.tsx         # 照片上传页
│   │   │   ├── ProcessingPage.tsx     # 处理进度页
│   │   │   ├── PreviewPage.tsx        # 3D 预览页
│   │   │   ├── OrderPage.tsx          # 下单页
│   │   │   ├── PaymentPage.tsx        # 支付页
│   │   │   └── OrderStatusPage.tsx    # 订单状态页
│   │   ├── components/        # 通用组件
│   │   │   ├── PhotoUploader.tsx      # 照片上传组件
│   │   │   ├── ModelViewer.tsx        # 3D 模型查看器
│   │   │   └── ProgressBar.tsx        # 进度条组件
│   │   ├── services/          # API 服务
│   │   │   ├── api.ts
│   │   │   ├── uploadService.ts
│   │   │   └── orderService.ts
│   │   └── stores/            # 状态管理
│   └── dist/                  # 构建产物
├── local-gpu-service/          # GPU 服务 (本地)
│   ├── src/
│   │   ├── server.py          # Flask 服务入口
│   │   ├── remover.py         # 背景移除模块
│   │   └── config.py          # 配置文件
│   ├── requirements.txt        # Python 依赖
│   ├── deploy.bat             # Windows 部署脚本
│   ├── Dockerfile             # Docker 镜像
│   └── README.md              # 服务文档
├── docs/                       # 项目文档
│   ├── DEPLOYMENT_GUIDE.md            # 部署指南
│   ├── PRINTER_INTEGRATION_GUIDE.md   # 打印机对接
│   ├── TESTING_PROCEDURE.md           # 测试流程
│   └── 临时更改记录.md                 # 临时更改追踪
├── playwright/                 # E2E 测试
├── docker-compose.yml          # Docker 编排
├── AGENTS.md                   # 开发规范
└── README.md
```

---

## 核心功能

### 1. AI 审核助手（OrderDetail 页面）

订单详情页集成 AI 审核助手，自动分析 3D 模型：

```javascript
// 触发 AI 审核
POST /api/orders/:id/ai-review

// AI 返回审核结果
{
  "success": true,
  "analysis": {
    "printability": 0.85,           // 可打印性评分
    "estimatedTime": "2h 30min",    // 预估打印时间
    "materialUsage": "45g",         // 材料消耗预估
    "overhangAngles": [42, 38],     // 悬垂角度检测
    "recommendations": [
      "建议添加支撑结构处理悬垂部分",
      "建议使用 0.2mm 层高提升表面质量"
    ]
  }
}
```

**功能亮点**：
- 模型拓扑结构自动分析
- 悬垂角度检测与支撑建议
- 打印时间与材料消耗预估
- 参数优化建议生成

### 2. AI 诊断助手（DeviceManagement 页面）

设备管理页集成 AI 诊断助手，实时诊断设备故障：

```javascript
// 触发 AI 诊断
POST /api/devices/:id/ai-diagnose
{
  "errorCode": "E-042",
  "symptoms": ["喷头温度异常", "打印中断"]
}

// AI 返回诊断结果
{
  "diagnosis": {
    "rootCause": "热敏电阻老化导致温度读数偏差",
    "confidence": 0.92,
    "repairSteps": [
      "1. 关闭设备电源",
      "2. 更换热敏电阻（型号：NTC 100K）",
      "3. 重新校准 PID 参数"
    ],
    "requiredParts": [
      { "name": "NTC 100K 热敏电阻", "quantity": 1 },
      { "name": "导热硅脂", "quantity": "5g" }
    ]
  },
  "maintenanceOrder": {
    "generated": true,
    "orderId": "MO-20260313-001"
  }
}
```

**功能亮点**：
- 错误代码智能解析
- 故障根因分析
- 维修步骤生成
- 自动创建维修领料单

### 3. 业务闭环自动化

系统实现从订单创建到完成的全流程自动化：

```
订单创建 → AI 审核 → 设备分配 → 打印执行 → 库存扣减 → 订单完成
    ↓           ↓          ↓          ↓          ↓
 自动排期   参数优化   WebSocket   进度监控   状态联动
```

**Agent 协作流程**：
1. **CoordinatorAgent**: 接收订单，分发任务
2. **SchedulerAgent**: 分析设备负载，分配最优设备
3. **InventoryAgent**: 预测材料需求，预警库存短缺
4. **DecisionEngine**: LLM 增强决策，处理复杂场景

### 4. Dashboard 可视化

| 图表 | 功能 |
|------|------|
| **设备利用率甘特图** | 时间轴展示每台设备状态（打印中/空闲/维护/离线） |
| **库存预警雷达图** | 当前库存 vs AI 预测对比，识别短缺风险 |
| **Agent 活跃度图** | 审核/排期 Agent 处理量 + 决策成功率 |
| **订单趋势图** | 近 7 天订单量与完成率 |

### 用户端页面流程详解

用户端提供完整的 3D 头部模型生成和打印下单流程：

```
引导页 (Guide) → 上传页 (Upload) → 处理中 (Processing) → 3D 预览 (Preview) → 下单页 (Order) → 支付页 (Payment) → 订单状态 (OrderStatus)
```

| 页面 | 路由 | 功能说明 |
|------|------|----------|
| **引导页** | `/guide` | 拍照姿势指导、角度说明、拍摄技巧提示 |
| **上传页** | `/upload` | 4 个角度照片上传（主视角、侧面、仰视、其他），支持相机拍摄和相册选择 |
| **处理中** | `/processing` | 实时进度显示、预计完成时间、WebSocket 状态推送 |
| **3D 预览** | `/preview` | Three.js 渲染、360 度旋转查看、缩放、下载模型 |
| **下单页** | `/order` | 打印参数选择（材料、颜色、尺寸）、价格计算、备注填写 |
| **支付页** | `/payment` | 模拟支付流程、支付状态确认 |
| **订单状态** | `/order-status` | 实时订单跟踪、历史记录、物流信息 |

---

## API 文档

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

### 上传（用户端）

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/upload/photos` | 上传照片（支持多张） |
| GET | `/api/upload/status/:taskId` | 查询处理状态 |

### 背景抠图（GPU 服务）

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/remove-bg/health` | 健康检查 |
| POST | `/api/remove-bg` | 移除背景 |
| POST | `/api/remove-bg/batch` | 批量处理 |

### WebSocket 事件

| 事件 | 方向 | 描述 |
|------|------|------|
| `order:created` | Server → Client | 新订单创建通知 |
| `order:updated` | Server → Client | 订单状态更新 |
| `device:status` | Server → Client | 设备状态变更 |
| `agent:decision` | Server → Client | Agent 决策完成 |
| `print:progress` | Server → Client | 打印进度更新 |

**WebSocket 连接示例**：

```javascript
import { io } from 'socket.io-client';

const socket = io('http://111.62.241.109');

// 监听订单更新
socket.on('order:updated', (order) => {
  console.log('订单更新:', order);
});

// 监听打印进度
socket.on('print:progress', (data) => {
  console.log(`打印进度: ${data.progress}%`);
});
```

---

## 环境要求

| 组件 | 最低版本 | 推荐版本 |
|------|----------|----------|
| Node.js | 16.x | 18.x |
| MongoDB | 5.x | 7.x |
| Redis | 5.x | 7.x |
| Docker | 19.x | 20.x+ |

---

## 配置说明

### 后端环境变量（backend/.env）

```bash
# 环境配置
NODE_ENV=development
PORT=3001

# 数据库
MONGODB_URI=mongodb://admin:password@localhost:27017/3dprint_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# 七牛云存储
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=your_bucket_name
QINIU_DOMAIN=https://your-domain.com

# 腾讯混元 API
HUNYUAN_SECRET_ID=your_secret_id
HUNYUAN_SECRET_KEY=your_secret_key

# 文件上传
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads

# LLM 配置
LLM_PROVIDER=qiniu
LLM_MODEL=deepseek-r1-32b
```

### 前端环境变量（admin-web/.env.local）

```bash
# API 配置
VITE_API_BASE_URL=http://localhost:3001/api
VITE_SOCKET_SERVER=http://localhost:3001

# 功能开关
VITE_ENABLE_3D_PREVIEW=true
VITE_ENABLE_AI_ASSISTANT=true
```

---

## 开发指南

### 代码风格

- 使用 2 个空格缩进
- 行宽限制 100 字符
- 注释使用简体中文
- 变量/函数命名使用英文
- 异步优先使用 async/await

### 提交规范

```bash
feat: 新功能 - 实现 Meshy API 封装入口
fix: 修复 - 修正照片上传大小限制
docs: 文档 - 更新部署指南
style: 格式 - 代码格式调整
refactor: 重构 - 重构订单服务
test: 测试 - 添加单元测试
chore: 杂项 - 更新依赖版本
```

### 运行测试

```bash
# 后端测试
cd backend
npm run test:unit          # 单元测试
npm run test:integration   # 集成测试
npm run test:coverage      # 覆盖率报告

# 前端测试
cd admin-web
npm run test               # 单元测试
npm run test:e2e           # E2E 测试

# E2E 测试（Playwright）
npx playwright test        # 运行所有测试
npx playwright test --ui   # UI 模式
```

### 常用命令

```bash
# 启动开发环境
npm run dev                # 后端开发模式
npm run build              # 构建生产版本
npm run lint               # 代码检查

# 数据库操作
npm run seed               # 填充测试数据
npm run migrate            # 数据迁移

# Docker 命令
docker-compose up -d       # 启动服务
docker-compose down        # 停止服务
docker-compose logs -f     # 查看日志
```

---

## 常见问题

### Q: AI 助手不响应怎么办？

**排查步骤**：
1. 检查 LLM 配置：确认 `.env` 中 `LLM_PROVIDER` 和 API 密钥正确
2. 检查网络连接：确保能访问 LLM API 端点
3. 查看后端日志：`docker-compose logs backend | grep -i llm`
4. 测试 LLM 连接：`curl http://localhost:3001/api/agents/test-llm`

### Q: WebSocket 连接失败？

**排查步骤**：
1. 确认后端服务运行正常：`curl http://111.62.241.109:3001/health`
2. 检查前端配置：`VITE_SOCKET_SERVER` 是否正确
3. 检查浏览器控制台：查看 WebSocket 连接错误
4. 确认端口未被占用：`netstat -an | grep 3001`

### Q: 数据库连接失败？

**排查步骤**：
1. 检查 MongoDB 运行状态：`docker ps | grep mongodb`
2. 验证连接字符串：`mongosh "mongodb://admin:password@localhost:27017"`
3. 查看数据库日志：`docker-compose logs mongodb`
4. 检查网络配置：确保容器网络互通

### Q: 如何连接 OctoPrint 打印机？

参考 [打印机对接指南](docs/PRINTER_INTEGRATION_GUIDE.md) 获取详细步骤。

### Q: 如何部署到生产环境？

参考 [部署指南](docs/DEPLOYMENT_GUIDE.md) 获取 Docker 和手动部署步骤。

### Q: 如何运行完整测试？

参考 [测试指南](docs/TESTING_PROCEDURE.md) 获取完整测试用例。

---

## 许可证

MIT License

---

## 联系方式

- 项目地址：https://github.com/your-org/3d-print-agent-system
- 问题反馈：https://github.com/your-org/3d-print-agent-system/issues

---

**文档版本**: v1.2  
**最后更新**: 2026-03-27  
**维护者**: 程彦硕
