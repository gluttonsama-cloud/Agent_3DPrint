# 架构决策记录

## [2026-03-17] CORS 问题临时解决方案

### 背景

混元 3D API 返回的模型 URL 是腾讯云 COS 带签名链接，存在 CORS 限制，浏览器无法直接加载。

七牛云存储使用内网域名 `qiniucs.com`，外部 API 无法访问，也不适合作为公开 URL。

### 决策

**临时方案**：使用后端代理转发模型请求

- 前端请求：`/api/download/model/:taskId?format=glb`
- 后端从混元 API 返回的签名 URL 下载模型，流式转发给前端

### 影响范围

| 文件 | 修改 |
|------|------|
| `ai-3d-head-modeler/src/pages/Preview.tsx` | 使用代理 URL 加载模型 |
| `backend/src/routes/download.js` | 支持 taskId 查找模型 |

### 生产环境推荐方案

**绑定七牛云公网域名**

1. 在七牛云控制台 → 对象存储 → 域名管理
2. 绑定自定义域名或使用测试域名
3. 更新 `backend/.env` 中的 `QINIU_DOMAIN`
4. 移除 Preview.tsx 中的代理逻辑，直接使用 modelUrls

### 优缺点对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| 后端代理（当前） | 无需配置、立即可用 | 增加服务器负载、有延迟 |
| 公网域名（推荐） | CDN 加速、无服务器开销 | 需要控制台配置、可能需要备案 |

### 回滚方案

移除代理逻辑，直接使用 modelUrls：

```typescript
// Preview.tsx
const modelUrl = state?.modelUrls?.[0] || DEFAULT_MODEL_PATH;
```