# Spec: add-backend-testing-framework

## ADDED Requirements

### Requirement: Jest Testing Framework

系统 SHALL 使用 Jest 作为测试框架。

#### Scenario: Jest Configuration

- **GIVEN** 后端项目使用 Node.js
- **WHEN** 运行测试
- **THEN** Jest 应正确配置：
  - 测试环境: node
  - 覆盖率收集: 启用
  - 测试匹配: `**/*.test.js`
  - 覆盖率报告: text, lcov

#### Scenario: Test Scripts

- **GIVEN** package.json 存在
- **WHEN** 查看 scripts
- **THEN** 应包含：
  - `test`: 运行所有测试
  - `test:coverage`: 生成覆盖率报告
  - `test:watch`: 监听模式

---

### Requirement: Agent System Tests

系统 SHALL 为 Agent 核心模块提供单元测试。

#### Scenario: BaseAgent Tests

- **GIVEN** BaseAgent 类
- **WHEN** 运行测试
- **THEN** 应测试：
  - 初始化流程
  - 工具注册
  - 状态管理
  - LLM 调用封装

#### Scenario: DecisionEngine Tests

- **GIVEN** DecisionEngine 类
- **WHEN** 运行测试
- **THEN** 应测试：
  - 规则评估
  - 冲突解决
  - LLM 辅助决策

---

### Requirement: Service Layer Tests

系统 SHALL 为 Service 层提供单元测试。

#### Scenario: OrderService Tests

- **GIVEN** OrderService 模块
- **WHEN** 运行测试
- **THEN** 应测试：
  - 创建订单
  - 更新状态
  - 查询订单

#### Scenario: DeviceService Tests

- **GIVEN** DeviceService 模块
- **WHEN** 运行测试
- **THEN** 应测试：
  - 设备注册
  - 状态更新
  - 设备查询

---

## Implementation Notes

1. 使用 Jest 29.x 版本
2. Mock MongoDB 和 Redis 连接
3. 使用 supertest 测试 API 端点