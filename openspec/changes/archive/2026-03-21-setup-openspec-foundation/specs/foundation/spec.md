# Spec: setup-openspec-foundation

## ADDED Requirements

### Requirement: Project Context Documentation

系统 SHALL 提供完整的项目上下文文档 `openspec/project.md`，包含以下信息：

#### Scenario: Technology Stack Documentation

- **GIVEN** 项目使用多个技术栈
- **WHEN** AI 助手或开发者查看项目文档
- **THEN** `project.md` 应包含完整的技术栈列表：
  - 后端：Node.js 18+, Express 4.x, MongoDB 7.x, Redis 7.x, Bull 4.x, Socket.IO 4.x, LangChain 1.x
  - 前端：React 19, React Router 7, Ant Design 6, Tailwind CSS 4, ECharts 6, Three.js 0.182, Zustand 5
  - 集成服务：腾讯混元 API, 七牛云 Kodo, OctoPrint

#### Scenario: Development Conventions

- **GIVEN** 项目有既定的开发约定
- **WHEN** 开发者编写代码或提交变更
- **THEN** `project.md` 应明确约定：
  - 缩进：2 空格
  - 行宽：100 字符
  - 注释语言：简体中文
  - 命名语言：英文
  - 异步处理：优先 async/await
  - 提交格式：conventional commits

#### Scenario: Architecture Overview

- **GIVEN** 系统由多个子系统组成
- **WHEN** 需要理解系统架构
- **THEN** `project.md` 应提供：
  - ASCII 架构图
  - 子系统边界定义
  - 数据流描述

---

### Requirement: System Overview Specification

系统 SHALL 提供系统概览规范 `openspec/specs/system-overview/spec.md`，作为系统的单一真相来源。

#### Scenario: Subsystem Definition

- **GIVEN** 系统由四个子系统组成
- **WHEN** 查看系统规范
- **THEN** 应清晰定义每个子系统：

| 子系统 | 职责 | 技术栈 |
|--------|------|--------|
| 用户端 | 3D 建模下单流程 | React + Vite + Capacitor |
| 管理端 | 订单/设备/库存管理 | React + Ant Design + Zustand |
| 后端服务 | API + Agent + 队列 | Node.js + Express + MongoDB |
| GPU 服务 | 背景抠图处理 | Python + rembg + Docker |

#### Scenario: Agent System Architecture

- **GIVEN** 后端实现多 Agent 系统
- **WHEN** 查看系统规范
- **THEN** 应定义 Agent 架构：

```
CoordinatorAgent (决策中枢)
    ├── SchedulerAgent (设备调度)
    ├── InventoryAgent (库存管理)
    └── DecisionEngine (规则引擎)
```

#### Scenario: API Endpoints Index

- **GIVEN** 后端提供多个 API 端点
- **WHEN** 需要集成或调试 API
- **THEN** 规范应提供端点索引：
  - `/api/orders` — 订单管理
  - `/api/devices` — 设备管理
  - `/api/materials` — 材料管理
  - `/api/dashboard` — 仪表盘数据
  - `/api/agents` — Agent 管理
  - `/api/upload` — 文件上传
  - `/api/remove-bg` — 背景抠图

---

## MODIFIED Requirements

无修改。

---

## DELETED Requirements

无删除。

---

## Implementation Notes

1. `project.md` 应放置在 `openspec/` 根目录
2. `system-overview/spec.md` 应放置在 `openspec/specs/system-overview/` 目录
3. 所有文档使用简体中文
4. 架构图使用 ASCII 格式，确保在任何编辑器中可读