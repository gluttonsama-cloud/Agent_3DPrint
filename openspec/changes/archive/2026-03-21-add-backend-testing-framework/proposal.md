# Proposal: add-backend-testing-framework

## 概述

为后端服务添加完整的测试框架，包括 Jest 测试框架、覆盖率报告、以及核心模块的单元测试。

## 背景

### 当前状态

后端 `package.json` 中测试脚本为空：
```json
"test": "echo \"Error: no test specified\" && exit 1"
```

仅存在一个测试文件 `dashboard.test.js`，使用自定义测试框架，不是标准的 Jest/Mocha。

### 问题

1. **无测试框架** — 没有配置 Jest 或 Mocha
2. **无覆盖率报告** — 无法追踪测试覆盖情况
3. **核心模块未测试** — Agent、Service、Routes 都没有测试

## 目标

1. 添加 Jest 测试框架配置
2. 编写核心模块的单元测试：
   - Agent 系统 (BaseAgent, DecisionEngine)
   - Services (OrderService, DeviceService)
   - Routes (订单、设备、材料)
3. 配置覆盖率报告 (目标: 60%+)
4. 添加 CI 测试脚本

## 非目标

- 不测试前端代码
- 不添加 E2E 测试（后续变更）
- 不修改现有业务逻辑

## 成功标准

1. `npm test` 可正常运行
2. 覆盖率 ≥ 60%
3. 至少 20 个测试用例通过