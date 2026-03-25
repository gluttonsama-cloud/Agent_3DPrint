# Proposal: add-health-endpoints

## 概述

扩展健康检查端点，提供详细的系统状态信息。

## 目标

1. 添加 `/api/health/live` - 存活探针
2. 添加 `/api/health/ready` - 就绪探针
3. 增强 `/health` - 返回详细组件状态

## 成功标准

1. 返回数据库连接状态
2. 返回 Redis 连接状态
3. 返回 GPU 服务状态