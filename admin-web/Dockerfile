# ============================================
# 管理端前端 Dockerfile
# React 19 + Ant Design
# ============================================

# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY admin-web/package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY admin-web/ ./

# 构建生产版本
RUN npm run build

# ============================================
# 生产镜像（使用 nginx 服务静态文件）
# ============================================
FROM nginx:alpine

# 复制自定义 nginx 配置
COPY admin-web/nginx.conf /etc/nginx/conf.d/default.conf

# 从 builder 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]