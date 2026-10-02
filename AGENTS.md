# AGENTS.md - 3D头部建模AI智能体 项目工作指引

本文档用于在当前代码库中统一工作方式、搭建开发环境以及规范代码风格、构建与测试流程。当前仓库以文档/计划为主，尚未包含可执行代码，后续阶段将逐步引入后端与前端代码。

## 1. 项目总体架构与技术栈
- 前端：React 19 + Vite + Capacitor (用于移动端封装)
- 后端：Node.js + Express
- 3D 生成：腾讯混元 API 为主，Replicate API 为备选
- 背景抠图：本地 GPU 服务 (rembg) 或 remove.bg API
- 存储：七牛云 Kodo
- 数据库与队列：MongoDB、Bull + Redis
- 统一调度：Meshy/Replicate/混元 的混合调度策略

以上设计在 .sisyphus/plans 与 plan_draft 详细实施文档中有完整描述，见以下引用文件：
- .sisyphus/plans/comfyui-hybrid-plan.md
- plan_draft/detailed-implementation-guide-part1.md
- plan_draft/detailed-implementation-guide-part2.md
- plan_draft/detailed-implementation-guide-part3.md
- plan_draft/team-discussion-3d-head-modeling.md

## 2. 当前项目结构概览
- 根目录包含：.git/, .gitattributes, .sisyphus/, plan_draft/ 等
- .sisyphus/ 中的 plans/ 包含 comfyui-hybrid-plan.md（阶段性设计草案）
- plan_draft/ 包含如下超详细实施文档（中文）
  - detailed-implementation-guide-part1.md
  - detailed-implementation-guide-part2.md
  - detailed-implementation-guide-part3.md
  - team-discussion-3d-head-modeling.md

当前仓库已包含完整的后端、管理端、用户端和 GPU 服务代码。可以根据各子目录下的 `package.json` 运行相应的开发和构建命令。

## 3. 构建/ lint/ 测试（当前仓库状态）
- 代码层面：各子系统均已实现基础架构。
- 后端栈：Node.js + Express；使用 Bull + Redis 作为任务队列；MongoDB 作为数据库；七牛云 Kodo 作为对象存储。
- 前端栈：React 19 + Three.js + Tailwind CSS 4，用于拍照引导、照片上传、3D 预览等。
- 常用命令：
  - 后端 (backend):
    - `npm install`
    - `npm run dev` (开发模式)
    - `npm test` (运行测试)
  - 管理端 (admin-web) / 用户端 (ai-3d-head-modeler):
    - `npm install`
    - `npm run dev` (启动 Vite 开发服务器)
    - `npm run build` (构建生产版本)
  - GPU 服务 (local-gpu-service):
    - `pip install -r requirements.txt`
    - `python start_server.py`

- 本仓库下的计划文档会成为日后实现的唯一参考，请在代码实现阶段保持与计划一致的结构与命名规则。

## 4. 代码风格指南（基于现有实施方案文档的共识）
- 语言与注释
  - 注释使用简体中文，变量、函数命名使用英文，遵循现有代码习惯（见计划文档中的示例代码段）
- 缩进与风格
  - 使用 2 个空格进行缩进
  - 行宽限制为 100 字符
- 模块导入
  - 标准库 > 第三方 > 本地模块的导入顺序
  - 使用明确的命名，避免 using any/禁用 TS 类型检查的行为，除非明确需求
- 异步处理
  - 优先使用 async/await；明确捕获和错误处理
- 错误处理
  - 统一错误格式，尽量返回可解析的错误信息
- 代码健壮性
  - 避免深嵌套、单一函数过长
  - 将复杂逻辑拆分为小函数/模块
- 测试与文档
  - 测试覆盖率、边界条件及错误场景应覆盖到
  - 重要设计点应在文档中留下明确注释与描述

对照现有计划文档中的代码示例与目录结构，可以参阅：
- plan_draft/detailed-implementation-guide-part1.md
- plan_draft/detailed-implementation-guide-part2.md
- plan_draft/detailed-implementation-guide-part3.md
- .sisyphus/plans/comfyui-hybrid-plan.md

## 5. 版本控制与工作流（建议）
- 使用 Git 分支进行功能开发：feature/xxx
- 提交信息格式（示例）
  - feat: 实现 Meshy API 封装入口
  - fix: 修正照片上传大小限制
  - docs: 更新实现文档
- 提交前运行本地 lint/测试，确保通过后再提交
- 遵循“先本地完成，后提交合并”的流程

## 6. 验证与后续工作
- 你可以基于本 AGENTS.md 逐步实现后端/前端代码，完成后请回传实现的提交记录、构建日志与测试结果以便继续推进。

---
以上内容基于当前仓库中的计划文档与 .sisyphus/ 计划文档所整理出的架构与工作方式。

## 子代理使用规则

- 默认由当前负责人直接完成。文档整理、计划复核、普通资料检索、简单测试和小修改不派子代理。
- 只有任务能按文件或模块明确分开、接口已经确定、预计至少半天工作量、并行收益足以覆盖交接与合并成本时，才考虑派子代理。用户要求不用子代理时不派。
- 实现子代理优先使用 Sol 系列，始终选择适合任务的模型系列中当前可用的最新版本，并在调用时显式指定；当前使用 GPT-6.1 Sol（gpt-6.1-sol）。每次派发前核对可用模型，不永久锁定版本号，不因主模型设置而意外继承 Astra。
- 同时最多两个实现子代理。派之前写明文件所有权、输入输出、验收测试及交接点；共享入口只能由一位负责人整合。告知子代理仓库还有其他人在工作，不得回退他人修改，也不得继续派子代理。
- 子代理只交付其模块、测试结果和已知限制；负责人负责复核、集成及向用户报告。计划中写着“可并行”只表示允许，不表示必须派代理。
