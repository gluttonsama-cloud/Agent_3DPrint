# ============================================
# 后端服务 Dockerfile
# 版本：v2.0.0 (混元 + 七牛云版)
# ============================================

FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY backend/package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制源代码
COPY backend/ ./

# 创建必要的目录
RUN mkdir -p uploads logs

# ============================================
# 生产镜像
# ============================================
FROM node:18-alpine

# 安装必要工具
RUN apk add --no-cache tini

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# 设置工作目录
WORKDIR /app

# 从 builder 复制文件
COPY --from=builder --chown=nodejs:nodejs /app ./

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 暴露端口
EXPOSE 3001

# 切换到非 root 用户
USER nodejs

# 使用 tini 作为 init 进程
ENTRYPOINT ["/sbin/tini", "--"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# 启动应用
CMD ["node", "src/app.js"]