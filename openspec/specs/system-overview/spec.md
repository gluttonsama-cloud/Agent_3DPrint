# System Overview

## 系统定义

3D 头部建模打印系统是一个面向 3D 打印农场的智能管理平台，支持用户通过拍照生成 3D 头部模型并下单打印。

---

## 子系统边界

### 用户端 (ai-3d-head-modeler)

**职责**：面向终端用户的移动端应用，提供完整的 3D 建模和下单流程。

**边界定义**：
- 输入：用户照片、打印参数、支付信息
- 输出：3D 模型预览、订单状态、支付结果

**核心流程**：
```
Guide → Upload → Processing → Preview → Order → Payment → OrderStatus
引导页   上传页     处理中      3D预览    下单     支付结果   订单状态
```

**技术约束**：
- 使用 React + Vite 构建
- 通过 Capacitor 打包为移动应用
- Three.js 渲染 3D 模型

---

### 管理端 (admin-web)

**职责**：面向运营人员的后台管理系统，提供订单、设备、库存、Agent 管理。

**边界定义**：
- 输入：管理员操作、AI 审核结果、设备状态
- 输出：仪表盘数据、订单状态更新、设备控制指令

**核心页面**：
| 页面 | 功能 |
|------|------|
| Dashboard | 甘特图 + 雷达图 + Agent 活跃度 |
| OrderList | 订单列表与筛选 |
| OrderDetail | 订单详情 + AI 审核 |
| DeviceManagement | 设备监控 + AI 诊断 |
| InventoryManagement | 材料管理 + 库存预警 |
| AgentManagement | Agent 配置与监控 |
| AgentVisualization | Agent 流程可视化 |

**技术约束**：
- 使用 React 19 + Ant Design 6
- Zustand 状态管理
- ECharts 数据可视化

---

### 后端服务 (backend)

**职责**：提供 API 服务、Agent 决策引擎、任务队列处理。

**边界定义**：
- 输入：HTTP 请求、WebSocket 连接、定时任务
- 输出：JSON 响应、WebSocket 事件、任务执行结果

**核心模块**：

| 模块 | 职责 |
|------|------|
| API Layer | RESTful 端点处理 |
| Agent System | 多 Agent 协作与决策 |
| Services | 业务逻辑封装 |
| Queues/Workers | 异步任务处理 |

**技术约束**：
- Node.js 18+ 运行环境
- MongoDB 数据持久化
- Redis 缓存与队列
- Bull 任务队列

---

### GPU 服务 (local-gpu-service)

**职责**：本地 GPU 加速的背景抠图服务。

**边界定义**：
- 输入：原始图片
- 输出：去除背景的图片

**API 端点**：
| 端点 | 功能 |
|------|------|
| `GET /api/remove-bg/health` | 健康检查 |
| `POST /api/remove-bg` | 单图处理 |
| `POST /api/remove-bg/batch` | 批量处理 |

**技术约束**：
- Python 3.10+ 运行环境
- rembg 库处理图像
- Docker 容器化部署
- 默认端口 7000

---

## Agent 系统架构

### 组件层次

```
┌─────────────────────────────────────────────────────────────┐
│                    CoordinatorAgent                          │
│                    (决策中枢)                                 │
│  职责：接收订单、协调其他 Agent、做出最终决策                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│SchedulerAgent│    │InventoryAgent│    │DecisionEngine│
│  (调度 Agent)│    │ (库存 Agent) │    │ (决策引擎)   │
└─────────────┘    └─────────────┘    └─────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ deviceTools │    │materialTools│    │ orderRules  │
│ 设备分配算法 │    │ 库存预测算法│    │ 决策规则    │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Agent 通信协议

| 组件 | 功能 |
|------|------|
| AgentMessenger | Agent 间消息传递 |
| MessageQueue | 消息队列管理 |
| Protocol | 通信协议定义 |
| TimeoutRetryManager | 超时重试机制 |

### 决策流程

```
1. 订单创建
     │
     ▼
2. CoordinatorAgent 接收订单
     │
     ├──▶ SchedulerAgent: 请求设备分配
     │         └──▶ 返回: 设备 ID + 预计时间
     │
     ├──▶ InventoryAgent: 检查材料库存
     │         └──▶ 返回: 库存状态 + 预警
     │
     └──▶ DecisionEngine: 评估决策
               │
               ├──▶ 规则引擎评估
               │         └──▶ 置信度 >= 0.6 → 返回决策
               │
               └──▶ LLM 辅助决策 (置信度 < 0.6)
                         └──▶ 返回最终决策
     │
     ▼
3. 记录决策日志
     │
     ▼
4. 更新订单状态
```

---

## 数据流

### 用户下单流程

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  用户端  │────▶│  后端   │────▶│ GPU服务 │────▶│ 混元API │
│ 上传照片 │     │ 接收请求│     │ 背景抠图│     │生成3D模型│
└─────────┘     └─────────┘     └─────────┘     └─────────┘
                     │
                     ▼
               ┌─────────┐     ┌─────────┐
               │ 七牛云  │◀────│ 存储模型│
               │ 对象存储│     │  文件   │
               └─────────┘     └─────────┘
                     │
                     ▼
               ┌─────────┐     ┌─────────┐
               │  用户端  │────▶│ 订单创建│
               │ 3D预览  │     │  支付   │
               └─────────┘     └─────────┘
```

### 订单处理流程

```
订单创建 → Agent 审核 → 设备分配 → 打印执行 → 质检 → 发货
    │           │           │           │        │      │
    ▼           ▼           ▼           ▼        ▼      ▼
 pending    reviewing   scheduled   printing  qa     completed
                                    └── WebSocket 进度推送
```

---

## 状态机

### 订单状态

```
pending → reviewing → scheduled → printing → qa → completed
    │         │           │           │        │
    │         │           │           │        └──▶ shipped
    │         │           │           │
    │         │           │           └──▶ failed
    │         │           │
    │         └──▶ rejected
    │
    └──▶ cancelled
```

### 设备状态

```
idle ⇄ busy → maintenance → offline
                │
                └──▶ error
```

---

## 非功能需求

### 性能

| 指标 | 目标 |
|------|------|
| API 响应时间 | < 200ms (P95) |
| 3D 模型生成 | < 60s |
| 背景抠图 | < 2s/张 |
| WebSocket 延迟 | < 100ms |

### 可用性

| 指标 | 目标 |
|------|------|
| 系统可用性 | 99.9% |
| 错误恢复时间 | < 5min |

### 安全

- JWT Token 认证
- HTTPS 传输
- 敏感信息加密存储
- API 速率限制