# Proposal: add-input-validation

## 概述

添加统一的输入验证中间件，使用 express-validator 对 API 请求进行验证。

## 目标

1. 创建验证中间件
2. 为核心 API 添加验证规则
3. 返回标准化错误响应

## 成功标准

1. POST /api/upload 验证文件类型和大小
2. 所有 API 返回标准化验证错误