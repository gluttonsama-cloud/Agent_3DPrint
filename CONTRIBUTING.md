# 贡献指南

感谢你对 3D 头部建模 AI 智能体项目的关注！本文档将帮助你了解如何参与项目开发。

## 目录

- [贡献流程](#贡献流程)
- [开发环境搭建](#开发环境搭建)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [PR 规范](#pr-规范)
- [测试要求](#测试要求)
- [文档更新](#文档更新)

---

## 贡献流程

### 1. Fork 仓库

点击项目页面右上角的 `Fork` 按钮，将仓库 Fork 到你的账号下。

### 2. Clone 到本地

```bash
git clone https://github.com/YOUR_USERNAME/Agent_3DPrint.git
cd Agent_3DPrint
```

### 3. 创建分支

根据变更类型创建对应分支：

```bash
# 新功能
git checkout -b feature/your-feature-name

# Bug 修复
git checkout -b fix/your-bug-fix

# 文档更新
git checkout -b docs/your-doc-update

# 重构
git checkout -b refactor/your-refactor
```

### 4. 提交更改

按照[提交规范](#提交规范)编写提交信息，确保每次提交只做一件事。

### 5. 推送到 Fork

```bash
git push origin your-branch-name
```

### 6. 创建 Pull Request

在 GitHub 上创建 Pull Request，按照 [PR 规范](#pr-规范)填写描述。

---

## 开发环境搭建

### 后端环境

```bash
# 进入后端目录
cd backend

# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env

# 编辑 .env 文件，填入必要的配置
# - 数据库连接
# - API 密钥（混元、Replicate 等）
# - OSS 配置

# 启动开发服务器
npm run dev
```

### 前端环境

```bash
# 进入前端目录
cd admin-web

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- MongoDB >= 5.0
- Redis >= 6.0（用于任务队列）

---

## 代码规范

### 缩进与格式

- 使用 **2 个空格**进行缩进
- 行宽限制为 **100 字符**
- 文件末尾保留一个空行
- 使用 UTF-8 编码

### 语言与注释

- 注释使用**简体中文**
- 变量、函数、类名使用**英文**
- 命名采用**驼峰命名法**（camelCase）
- 类名和构造函数采用**帕斯卡命名法**（PascalCase）
- 常量使用**全大写下划线分隔**（UPPER_SNAKE_CASE）

```javascript
// 正确示例
const MAX_RETRY_COUNT = 3;

function processImage(imageData) {
  // 处理图片数据
  const result = transformData(imageData);
  return result;
}

class ModelGenerator {
  constructor(config) {
    this.config = config;
  }
}
```

### 导入顺序

按照以下顺序组织导入语句，每组之间空一行：

1. 标准库模块
2. 第三方模块
3. 本地模块

```javascript
// 标准库
const fs = require('fs');
const path = require('path');

// 第三方模块
const express = require('express');
const mongoose = require('mongoose');

// 本地模块
const { processImage } = require('./utils/image');
const config = require('./config');
```

### 异步处理

- 优先使用 `async/await`
- 明确捕获和处理错误
- 避免回调地狱

```javascript
// 正确示例
async function fetchModelData(id) {
  try {
    const data = await Model.findById(id);
    if (!data) {
      throw new Error('Model not found');
    }
    return data;
  } catch (error) {
    logger.error('Failed to fetch model:', error);
    throw error;
  }
}

// 避免这样写
function fetchModelDataBad(id, callback) {
  Model.findById(id, (err, data) => {
    if (err) return callback(err);
    processData(data, (err2, result) => {
      if (err2) return callback(err2);
      callback(null, result);
    });
  });
}
```

### 错误处理

统一错误格式，返回可解析的错误信息：

```javascript
// 统一错误响应格式
{
  "success": false,
  "error": {
    "code": "MODEL_NOT_FOUND",
    "message": "指定的模型不存在",
    "details": {}
  }
}
```

### 代码健壮性

- 避免深嵌套（最多 3 层）
- 单一函数不超过 50 行
- 将复杂逻辑拆分为小函数/模块
- 添加必要的参数校验

---

## 提交规范

### 提交类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 添加模型导出功能` |
| `fix` | Bug 修复 | `fix: 修复图片上传失败问题` |
| `docs` | 文档更新 | `docs: 更新 API 文档` |
| `style` | 代码格式（不影响功能） | `style: 统一代码缩进` |
| `refactor` | 重构 | `refactor: 优化模型生成逻辑` |
| `test` | 测试相关 | `test: 添加图片处理单元测试` |
| `chore` | 构建/工具相关 | `chore: 更新依赖版本` |
| `perf` | 性能优化 | `perf: 优化图片压缩算法` |

### 提交信息格式

```
<type>: <description>

[optional body]

[optional footer]
```

**示例：**

```
feat: 添加 Meshy API 封装模块

- 实现 3D 模型生成接口
- 添加任务状态轮询
- 支持错误重试机制

Closes #123
```

### 提交要求

- 使用简体中文描述
- 描述清楚"做了什么"，而不是"怎么做的"
- 每次提交只做一件事
- 不提交敏感信息（密钥、密码等）

---

## PR 规范

### 标题格式

```
<type>: <description>
```

示例：`feat: 添加用户头像 3D 模型生成功能`

### 描述模板

```markdown
## 变更说明

简要描述本次 PR 的目的和实现方式。

## 变更类型

- [ ] 新功能（feat）
- [ ] Bug 修复（fix）
- [ ] 文档更新（docs）
- [ ] 重构（refactor）
- [ ] 其他：___

## 测试情况

- [ ] 已添加单元测试
- [ ] 已添加集成测试
- [ ] 本地测试通过
- [ ] 已更新相关文档

### 测试步骤

1. 步骤一
2. 步骤二
3. ...

## 截图（如适用）

<!-- 添加截图说明 UI 变更 -->

## 关联 Issue

Closes #issue_number

## 检查清单

- [ ] 代码符合项目规范
- [ ] 已运行 lint 检查
- [ ] 已运行测试
- [ ] 已更新文档
- [ ] 提交信息符合规范
```

### Code Review 要求

- 所有 PR 必须经过至少一位 Reviewer 审核通过
- 及时响应 Review 意见
- 保持讨论专注于代码本身
- 对于有争议的设计决策，在 Issue 中讨论

---

## 测试要求

### 测试原则

- **新功能必须有测试**：任何新功能都需要有对应的测试用例
- **Bug 修复必须有回归测试**：确保 Bug 不会再次出现
- **测试先行**：建议采用 TDD 方式开发

### 测试覆盖率

- 单元测试覆盖率 >= 80%
- 关键业务逻辑覆盖率 >= 90%
- 新增代码覆盖率 >= 85%

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- path/to/test.js

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行 lint 检查
npm run lint
```

### 测试命名规范

```javascript
// 使用 describe 描述测试模块
describe('ModelGenerator', () => {
  // 使用 it 描述测试用例
  it('should generate 3D model from valid image', async () => {
    // 测试代码
  });

  it('should throw error when image is invalid', async () => {
    // 测试代码
  });
});
```

---

## 文档更新

### 必须更新文档的场景

| 变更类型 | 需要更新的文档 |
|----------|----------------|
| 新增 API 接口 | `docs/api.md` 或 Swagger 文档 |
| 新增配置项 | `README.md`、`.env.example` |
| 新增功能 | `README.md`、相关功能文档 |
| 修改依赖 | `package.json`、`README.md` |
| 架构变更 | `docs/architecture.md` |

### 临时更改记录

**重要**：任何临时代码、测试脚本、配置修改都必须同步更新 `docs/临时更改记录.md`。

记录格式：

```markdown
#### 更改名称
- **文件**: 相对路径
- **创建原因**: 为什么需要这个临时方案
- **功能说明**: 实现了什么
- **状态**: ⚠️ 临时 / ✅ 可保留 / ❌ 待删除
- **替代方案**: 正式的解决方案是什么
```

### 文档风格

- 使用简体中文
- 保持简洁明了
- 提供必要的代码示例
- 及时更新过时的内容

---

## 获取帮助

如果在贡献过程中遇到问题，可以通过以下方式获取帮助：

- 提交 Issue 描述问题
- 在 PR 中@相关维护者
- 查阅项目文档：`plan_draft/` 目录下的实施指南

感谢你的贡献！