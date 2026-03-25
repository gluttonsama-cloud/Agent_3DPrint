# Proposal: setup-openspec-foundation

## 概述

完善 OpenSpec 基础配置，建立规范驱动开发的基石，为后续变更建立规范基础。

## 背景

### 当前状态

项目 `Agent_3DPrint` 是一个 3D 头部建模打印系统，包含：

| 子系统 | 技术栈 | 状态 |
|--------|--------|------|
| 用户端 | React + Vite + Capacitor | 已实现 |
| 管理端 | React 19 + Ant Design + Tailwind + Zustand | 已实现 |
| 后端服务 | Node.js 18+ + Express + MongoDB + Redis + Bull | 已实现 |
| GPU 服务 | Python + rembg + Docker | 已实现 |

### 问题

1. **缺少项目上下文** — `openspec/project.md` 未创建，AI 助手缺乏项目背景知识
2. **规范目录为空** — `openspec/specs/` 无任何规范文件，无法追踪系统演进
3. **工作流未实践** — OpenSpec 已配置但从未使用，团队不熟悉流程

## 目标

1. 创建 `openspec/project.md`，记录完整的项目上下文：
   - 技术栈详情
   - 开发约定
   - 架构概览
   - API 端点索引

2. 建立第一个规范文件 `openspec/specs/system-overview/spec.md`：
   - 系统架构描述
   - 子系统边界定义
   - Agent 系统核心概念

3. 验证 OpenSpec 工作流完整运行：
   - 本变更作为首个实践案例
   - 测试 CLI 命令和验证流程

## 非目标

- 不修改任何现有代码
- 不影响现有功能运行
- 不引入新的依赖或配置

## 影响范围

| 文件 | 操作 | 影响 |
|------|------|------|
| `openspec/project.md` | 新建 | 无代码影响 |
| `openspec/specs/system-overview/spec.md` | 新建 | 无代码影响 |
| `openspec/changes/setup-openspec-foundation/` | 新建 | 无代码影响 |

## 风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| OpenSpec CLI 版本不兼容 | 低 | 中 | 使用兼容命令或手动创建文件 |
| 规范内容不完整 | 中 | 低 | 迭代更新，逐步完善 |

## 成功标准

1. ✅ `openspec/project.md` 包含：
   - 技术栈列表与版本
   - 开发约定（代码风格、提交规范）
   - 架构图（ASCII 格式）
   - API 端点索引

2. ✅ `openspec/specs/system-overview/spec.md` 包含：
   - 系统架构描述
   - 四个子系统的边界定义
   - Agent 系统核心组件说明

3. ✅ OpenSpec CLI 验证通过：
   - `openspec-chinese validate setup-openspec-foundation` 成功

## 时间估计

- 创建 `project.md`：15 分钟
- 创建 `system-overview/spec.md`：20 分钟
- 验证与调整：10 分钟
- **总计**：约 45 分钟

## 相关文档

- `AGENTS.md` — 项目开发规范
- `README.md` — 项目概览
- `.opencode/skills/` — OpenSpec 技能定义