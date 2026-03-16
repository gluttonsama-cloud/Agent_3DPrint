# AGENTS.md - 3D头部建模AI智能体 项目工作指引

本文档用于在当前代码库中统一工作方式、搭建开发环境以及规范代码风格、构建与测试流程。当前仓库以文档/计划为主，尚未包含可执行代码，后续阶段将逐步引入后端与前端代码。

## 1. 项目总体架构与技术栈
- 前端：uni-app（多端统一代码 base）
- 后端：Node.js + Express
- 3D 生成：混元 API 为主，Replicate API 为备选
- 背景抠图：remove.bg / clipdrop 等 API（可选）
- 存储：七牛云
- 数据库与队列（计划/假设）：MongoDB、Bull + Redis
- 未来扩展（阶段 2）：本地部署 ComfyUI，接入 ComfyUI Provider
- 统一调度：Meshy/Replicate/ComfyUI 的混合调度策略

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

当前仓库中尚无可执行代码文件（如 .js/.ts/.py 等），仅有设计/实现草案文档与团队讨论记录。

## 3. 构建/ lint/ 测试（当前仓库状态）
- 代码层面：尚无现成可执行后端/前端代码，因此无现成的构建与测试脚本。
- 计划中的后端栈（待实现）：Node.js + Express；使用 Bull + Redis 作为任务队列；MongoDB 作为数据库；阿里云 OSS 作为对象存储。
- 计划中的前端栈：uni-app + Three.js，用于拍照引导、照片上传、3D 预览等页面。
- 未来在实际代码实现后，将提供如下常用命令：
  - 安装依赖并构建（后端示例，Node.js/Express）
    - npm install
    - npm run build (如存在构建脚本)
  - 启动开发服务器
    - npm run dev 或 npx nodemon src/app.js
  - 运行 lint
    - npx eslint . --ext .js,.ts
  - 运行测试
    - npm test

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
