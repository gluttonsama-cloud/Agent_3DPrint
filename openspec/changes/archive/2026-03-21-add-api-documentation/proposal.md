# Proposal: add-api-documentation

## 概述

为后端 API 添加 Swagger/OpenAPI 文档，实现自动生成的交互式 API 文档页面。

## 背景

当前后端有多个 API 端点，但没有文档系统。开发者需要手动查阅代码才能了解 API 接口。

## 目标

1. 集成 swagger-jsdoc 和 swagger-ui-express
2. 为核心 API 端点添加 OpenAPI 注释
3. 创建 `/api-docs` 文档页面
4. 添加 API 版本信息

## 成功标准

1. 访问 `/api-docs` 显示 Swagger UI
2. 至少 10 个 API 端点有完整文档
3. 支持 "Try it out" 功能