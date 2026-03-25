# Spec: add-api-documentation

## ADDED Requirements

### Requirement: Swagger UI Integration

系统 SHALL 提供 Swagger UI 界面用于查看和测试 API。

#### Scenario: Access API Docs

- **GIVEN** 后端服务运行
- **WHEN** 访问 `/api-docs`
- **THEN** 应显示 Swagger UI 界面

#### Scenario: OpenAPI Specification

- **GIVEN** API 端点存在
- **WHEN** 查看 API 文档
- **THEN** 应包含：
  - 端点路径和方法
  - 请求参数说明
  - 响应格式说明
  - 示例数据

---

### Requirement: API Endpoint Documentation

系统 SHALL 为以下端点提供文档：

- `GET /api/orders` - 获取订单列表
- `POST /api/orders` - 创建订单
- `GET /api/orders/:id` - 获取订单详情
- `GET /api/devices` - 获取设备列表
- `POST /api/devices` - 注册设备
- `GET /api/materials` - 获取材料列表
- `GET /api/dashboard/stats` - 获取统计数据
- `GET /api/agents` - 获取 Agent 列表
- `POST /api/upload/photos` - 上传照片
- `GET /api/health` - 健康检查