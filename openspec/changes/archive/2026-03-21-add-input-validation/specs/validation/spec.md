# Spec: add-input-validation

## ADDED Requirements

### Requirement: Input Validation Middleware

系统 SHALL 使用 express-validator 进行输入验证。

#### Scenario: Validation Error Response

- **GIVEN** 请求包含无效数据
- **WHEN** 验证失败
- **THEN** 应返回 400 错误和详细错误信息

#### Scenario: File Upload Validation

- **GIVEN** 文件上传请求
- **WHEN** 验证文件
- **THEN** 应检查：
  - 文件类型（仅 JPEG/PNG/WEBP）
  - 文件大小（最大 10MB）
  - 文件数量（1-5 张）