# Spec: add-health-endpoints

## ADDED Requirements

### Requirement: Health Endpoints

系统 SHALL 提供多个健康检查端点。

#### Scenario: Liveness Probe

- **GIVEN** 服务运行
- **WHEN** 访问 `/api/health/live`
- **THEN** 应返回 200 OK

#### Scenario: Readiness Probe

- **GIVEN** 所有依赖可用
- **WHEN** 访问 `/api/health/ready`
- **THEN** 应返回依赖状态

#### Scenario: Detailed Health

- **GIVEN** 需要详细状态
- **WHEN** 访问 `/api/health`
- **THEN** 应返回：
  - 数据库状态
  - Redis 状态
  - GPU 服务状态
  - 运行时间