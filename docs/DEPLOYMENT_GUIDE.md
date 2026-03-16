# 部署指南

> 3D 打印多 Agent 管理系统 - 生产环境部署

---

## 目录

1. [服务器要求](#服务器要求)
2. [Docker 部署（推荐）](#docker-部署推荐)
3. [手动部署](#手动部署)
4. [环境变量配置](#环境变量配置)
5. [数据库初始化](#数据库初始化)
6. [常见问题](#常见问题)
7. [监控与维护](#监控与维护)

---

## 服务器要求

### 最小配置

| 组件 | 要求 |
|------|------|
| CPU | 2 核 |
| RAM | 4GB |
| 存储 | 20GB |
| 网络 | 100Mbps |

**适用场景**: 开发测试、小型打印农场（1-3 台打印机）

### 推荐配置

| 组件 | 要求 |
|------|------|
| CPU | 4 核 |
| RAM | 8GB |
| 存储 | 50GB SSD |
| 网络 | 1Gbps |

**适用场景**: 生产环境、中型打印农场（5-10 台打印机）

### 大型部署配置

| 组件 | 要求 |
|------|------|
| CPU | 8 核+ |
| RAM | 16GB+ |
| 存储 | 100GB SSD |
| 网络 | 1Gbps+ |

**适用场景**: 商业打印服务、大型打印农场（10+ 台打印机）

### 操作系统

- Ubuntu 20.04 LTS（推荐）
- Ubuntu 22.04 LTS
- CentOS 7+
- Debian 10+
- Windows Server 2019+（需额外配置）

---

## Docker 部署（推荐）

### 前置要求

| 软件 | 版本 | 安装链接 |
|------|------|----------|
| Docker | 20.10+ | https://docs.docker.com/get-docker/ |
| Docker Compose | 2.0+ | https://docs.docker.com/compose/install/ |

### 步骤 1：准备项目文件

```bash
# 克隆代码
git clone <repo-url>
cd 3d-print-agent-system

# 目录结构
tree -L 2
.
├── backend/           # 后端代码
├── admin-web/         # 前端代码
├── docs/              # 文档
└── docker-compose.yml # Docker 编排
```

### 步骤 2：配置环境变量

```bash
# 复制环境模板
cp backend/.env.example backend/.env

# 编辑配置
nano backend/.env
```

**关键配置项**:

```bash
# 数据库密码（必须修改）
MONGODB_PASSWORD=your_strong_password

# JWT 密钥（必须修改）
JWT_SECRET=your_random_secret_key_$(openssl rand -hex 32)

# 七牛云配置（如使用）
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
```

### 步骤 3：docker-compose.yml

```yaml
version: '3.8'

services:
  # MongoDB 数据库
  mongodb:
    image: mongo:7
    container_name: 3dprint-mongodb
    restart: always
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGODB_PASSWORD}
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"
    networks:
      - 3dprint-net

  # Redis 缓存
  redis:
    image: redis:7-alpine
    container_name: 3dprint-redis
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - 3dprint-net

  # 后端 API 服务
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: 3dprint-backend
    restart: always
    environment:
      NODE_ENV: production
      PORT: 3001
      MONGODB_URI: mongodb://admin:${MONGODB_PASSWORD}@mongodb:27017/3dprint_db
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET: ${JWT_SECRET}
      # 七牛云配置
      QINIU_ACCESS_KEY: ${QINIU_ACCESS_KEY:-}
      QINIU_SECRET_KEY: ${QINIU_SECRET_KEY:-}
      QINIU_BUCKET: ${QINIU_BUCKET:-}
      QINIU_DOMAIN: ${QINIU_DOMAIN:-}
      # 混元 API 配置
      HUNYUAN_SECRET_ID: ${HUNYUAN_SECRET_ID:-}
      HUNYUAN_SECRET_KEY: ${HUNYUAN_SECRET_KEY:-}
    volumes:
      - uploads_data:/app/uploads
      - ./backend:/app
    ports:
      - "3001:3001"
    depends_on:
      - mongodb
      - redis
    networks:
      - 3dprint-net

  # 前端服务
  frontend:
    build:
      context: ./admin-web
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL:-http://localhost:3001/api}
        VITE_SOCKET_SERVER: ${VITE_SOCKET_SERVER:-http://localhost:3001}
    container_name: 3dprint-frontend
    restart: always
    ports:
      - "3000:80"
    depends_on:
      - backend
    networks:
      - 3dprint-net

volumes:
  mongodb_data:
    driver: local
  redis_data:
    driver: local
  uploads_data:
    driver: local

networks:
  3dprint-net:
    driver: bridge
```

### 步骤 4：后端 Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制代码
COPY . .

# 创建上传目录
RUN mkdir -p uploads/models uploads/gcode

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

# 启动
CMD ["node", "src/app.js"]
```

### 步骤 5：前端 Dockerfile

```dockerfile
# admin-web/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖配置
COPY package*.json ./
RUN npm ci

# 复制代码并构建
COPY . .
ARG VITE_API_BASE_URL=http://localhost:3001/api
ARG VITE_SOCKET_SERVER=http://localhost:3001
RUN npm run build

# 生产镜像
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 步骤 6：前端 Nginx 配置

```nginx
# admin-web/nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 不缓存 HTML
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

### 步骤 7：构建并启动

```bash
# 启动所有服务
docker-compose up -d

# 查看构建日志
docker-compose logs -f

# 等待服务就绪（约 30 秒）
sleep 30

# 验证服务
curl http://localhost:3001/health
curl http://localhost:3000/
```

### 步骤 8：配置反向代理（生产环境）

**Nginx 主配置**:

```bash
# 安装 Nginx
sudo apt update
sudo apt install -y nginx

# 创建站点配置
sudo nano /etc/nginx/sites-available/3dprint
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS（生产环境推荐）
    # return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 后端 API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $http_host;
        
        # 上传文件大小组
        client_max_body_size 100M;
        proxy_request_buffering off;
    }

    # 上传文件
    location /uploads {
        proxy_pass http://localhost:3001/uploads;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket 支持
    location /socket.io {
        proxy_pass http://localhost:3001/socket.io;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

**启用站点**:

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/3dprint /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx

# 启用防火墙
sudo ufw allow 'Nginx Full'
sudo ufw status
```

### 步骤 9：HTTPS 证书（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 手动部署

### 步骤 1：安装 Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证版本
node --version  # v18.x
npm --version   # 9.x

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

### 步骤 2：安装 MongoDB

```bash
# Ubuntu 20.04/22.04
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

sudo apt-get update
sudo apt-get install -y mongodb-org

# 启动服务
sudo systemctl start mongod
sudo systemctl enable mongod

# 验证状态
sudo systemctl status mongod

# 创建管理员
mongosh
> use admin
> db.createUser({
>   user: "admin",
>   pwd: "your_password",
>   roles: ["root"]
> })
```

### 步骤 3：安装 Redis

```bash
# Ubuntu/Debian
sudo apt-get install -y redis-server

# 配置 Redis
sudo nano /etc/redis/redis.conf
# 修改：bind 127.0.0.1
# 修改：requirepass your_redis_password

# 启动服务
sudo systemctl start redis
sudo systemctl enable redis

# 验证
redis-cli ping  # 应返回 PONG
```

### 步骤 4：部署应用

```bash
# 克隆代码
cd /opt
git clone <repo-url> 3d-print-agent-system
cd 3d-print-agent-system

# 安装后端依赖
cd backend
npm install --production

# 配置环境变量
cp .env.example .env
nano .env

# 安装前端依赖
cd ../admin-web
npm install

# 构建前端
npm run build

# 复制前端到 Nginx
sudo mkdir -p /var/www/3dprint
sudo cp -r dist/* /var/www/3dprint/
sudo chown -R www-data:www-data /var/www/3dprint
```

### 步骤 5：配置 PM2 进程管理

```bash
# 安装 PM2
sudo npm install -g pm2

# 启动后端
cd /opt/3d-print-agent-system/backend
pm2 start src/app.js --name 3dprint-backend

# 查看状态
pm2 status

# 保存进程列表
pm2 save

# 设置开机自启
pm2 startup
# 按提示运行生成的命令
```

### 步骤 6：配置 Nginx

```bash
sudo nano /etc/nginx/sites-available/3dprint
# （参考上面的 Nginx 配置）

sudo ln -s /etc/nginx/sites-available/3dprint /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 环境变量配置

### 后端 .env 完整配置

```bash
# ==================== 环境配置 ====================
NODE_ENV=production
PORT=3001

# ==================== 数据库配置 ====================
MONGODB_URI=mongodb://admin:your_password@localhost:27017/3dprint_db
MONGODB_DB_NAME=3dprint_db

# ==================== Redis 配置 ====================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# ==================== JWT 配置 ====================
JWT_SECRET=your_random_secret_key_here
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# ==================== 文件上传配置 ====================
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
ALLOWED_FILE_TYPES=stl,obj,3mf

# ==================== 七牛云存储（可选） ====================
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=your_bucket_name
QINIU_DOMAIN=https://your-cdn.com
QINIU_ZONE=Zone_z2

# ==================== 混元 3D API（可选） ====================
HUNYUAN_SECRET_ID=your_secret_id
HUNYUAN_SECRET_KEY=your_secret_key
HUNYUAN_ENDPOINT=3d.ai.tencentcloudapi.com

# ==================== Replicate API（备选） ====================
REPLICATE_API_TOKEN=your_replicate_token

# ==================== 邮件服务（可选） ====================
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_email@qq.com
SMTP_PASS=your_smtp_password

# ==================== 日志配置 ====================
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# ==================== CORS 配置 ====================
CORS_ORIGIN=http://your-domain.com
```

### 前端 .env 配置

```bash
# API 地址
VITE_API_BASE_URL=http://your-domain.com:3001/api
VITE_SOCKET_SERVER=http://your-domain.com:3001

# 七牛云 CDN（可选）
VITE_QINIU_CDN=https://your-cdn.com

# 功能开关
VITE_ENABLE_PRINTER_INTEGRATION=true
VITE_ENABLE_3D_PREVIEW=true

# 上传限制
VITE_MAX_UPLOAD_SIZE=50
```

---

## 数据库初始化

### 创建数据库和用户

```javascript
// 使用 mongosh 连接
mongosh "mongodb://admin:your_password@localhost:27017/admin"

// 创建数据库
use 3dprint_db

// 创建应用用户
db.createUser({
  user: "3dprint_app",
  pwd: "your_app_password",
  roles: [
    {
      role: "readWrite",
      db: "3dprint_db"
    }
  ]
})

// 创建索引
db.orders.createIndex({ status: 1, createdAt: -1 })
db.orders.createIndex({ customerName: 1 })
db.orders.createIndex({ device: 1 })

db.devices.createIndex({ status: 1 })
db.devices.createIndex({ type: 1 })

db.materials.createIndex({ name: 1 })
db.materials.createIndex({ "stock.quantity": 1 })

// 创建管理员账号
db.users.insertOne({
  username: "admin",
  password: "$2b$10$YourBcryptHashedPasswordHere",
  role: "admin",
  email: "admin@example.com",
  createdAt: new Date(),
  updatedAt: new Date()
})
```

### 初始化测试数据

```javascript
// 创建种子脚本 seed.js
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function seed() {
  const client = new MongoClient('mongodb://admin:password@localhost:27017');
  
  try {
    await client.connect();
    const db = client.db('3dprint_db');
    
    // 初始化材料
    await db.collection('materials').insertMany([
      {
        name: "黑色 PLA 线材",
        type: "filament",
        color: "#000000",
        stock: {
          quantity: 5000,
          unit: "g",
          threshold: 1000
        },
        pricePerGram: 0.1,
        createdAt: new Date()
      },
      {
        name: "白色 PLA 线材",
        type: "filament",
        color: "#FFFFFF",
        stock: {
          quantity: 3000,
          unit: "g",
          threshold: 1000
        },
        pricePerGram: 0.1,
        createdAt: new Date()
      },
      {
        name: "透明树脂",
        type: "resin",
        color: "#888888",
        stock: {
          quantity: 2000,
          unit: "ml",
          threshold: 500
        },
        pricePerMl: 0.3,
        createdAt: new Date()
      }
    ]);
    
    // 初始化设备
    await db.collection('devices').insertMany([
      {
        name: "Printer-001",
        type: "fdm",
        status: "idle",
        connection: {
          type: "octoprint",
          url: "http://192.168.1.100:5000",
          apiKey: "test_api_key"
        },
        capabilities: {
          buildVolume: { x: 220, y: 220, z: 250 },
          materials: ["PLA", "ABS", "PETG"],
          nozzleDiameter: 0.4
        },
        createdAt: new Date()
      }
    ]);
    
    console.log('种子数据创建成功！');
  } finally {
    await client.close();
  }
}

seed().catch(console.error);
```

**运行种子脚本**:

```bash
cd backend
node seed.js
```

---

## 常见问题

### Q1: 服务启动失败

**症状**: Docker 容器无法启动或立即退出

**排查步骤**:

```bash
# 查看容器日志
docker-compose logs backend

# 检查端口占用
netstat -tlnp | grep 3001
# 或
lsof -i :3001

# 重启服务
docker-compose restart backend

# 重新构建
docker-compose up -d --build
```

**常见原因**:
- 数据库连接失败：检查 MongoDB 是否运行
- 端口被占用：修改 PORT 或停止占用进程
- 环境变量缺失：检查 .env 文件

### Q2: 前端无法访问

**症状**: 浏览器显示连接被拒绝或 404

**排查步骤**:

```bash
# 检查 Nginx 配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx

# 检查防火墙
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/error.log
```

### Q3: 数据库连接失败

**症状**: 后端日志显示 MongoDB 连接错误

**排查步骤**:

```bash
# 检查 MongoDB 状态
sudo systemctl status mongod
# 或 Docker
docker ps | grep mongodb

# 验证连接
mongosh "mongodb://admin:password@localhost:27017/3dprint_db"

# 检查用户权限
use 3dprint_db
db.getUser("3dprint_app")

# 查看 MongoDB 日志
sudo tail -f /var/log/mongodb/mongod.log
```

### Q4: 文件上传失败

**症状**: 上传返回 413 Request Entity Too Large

**解决**:

```bash
# 修改 Nginx 配置
sudo nano /etc/nginx/nginx.conf

# 添加/修改：
http {
    client_max_body_size 100M;
}

# 重启 Nginx
sudo systemctl restart nginx

# 检查后端配置
# 确保后端 .env 中 MAX_FILE_SIZE 设置正确
```

### Q5: Redis 连接失败

**症状**: 后端启动时报 Redis 连接错误

**排查步骤**:

```bash
# 检查 Redis 状态
sudo systemctl status redis
# 或 Docker
docker ps | grep redis

# 测试连接
redis-cli ping
redis-cli -a your_password ping

# 检查 Redis 配置
cat /etc/redis/redis.conf | grep -E "bind|requirepass"
```

### Q6: WebSocket 连接失败

**症状**: 前端无法建立实时连接

**排查步骤**:

```bash
# 检查后端日志
docker-compose logs backend | grep socket

# 验证 Nginx WebSocket 配置
# 确保有 Upgrade 和 Connection 头

# 测试连接
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Host: your-domain.com" \
  http://your-domain.com/socket.io/
```

### Q7: 内存泄漏

**症状**: 服务运行一段时间后内存持续增长

**排查步骤**:

```bash
# 监控内存使用
docker stats
# 或
pm2 monit

# 检查 Node.js 堆内存
# 在代码中添加内存监控
setInterval(() => {
  const used = process.memoryUsage();
  console.log('Memory:', Math.round(used.heapUsed / 1024 / 1024), 'MB');
}, 60000);
```

---

## 监控与维护

### 日志管理

**Docker 部署**:

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务
docker-compose logs -f backend
docker-compose logs -f frontend

# 限制日志行数
docker-compose logs --tail=100 backend

# 导出日志
docker-compose logs backend > backend.log
```

**手动部署**:

```bash
# PM2 日志
pm2 logs 3dprint-backend
pm2 logs --lines 100

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# 应用日志
tail -f /opt/3d-print-agent-system/backend/logs/app.log
```

### 性能监控

**PM2 监控**:

```bash
# 安装 PM2 Plus（可选）
pm2 plus

# 本地监控
pm2 monit

# 查看状态
pm2 status

# 重启应用
pm2 restart 3dprint-backend

# 优雅重启
pm2 reload 3dprint-backend
```

**系统监控**:

```bash
# 安装 htop
sudo apt install -y htop
htop

# 磁盘使用
df -h

# 内存使用
free -h

# 网络流量
iftop
```

### 定期备份

**MongoDB 备份**:

```bash
#!/bin/bash
# backup-mongodb.sh

BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="mongodb://admin:password@localhost:27017/3dprint_db" \
  --out="${BACKUP_DIR}/${DATE}"

# 保留最近 7 天的备份
find ${BACKUP_DIR} -type d -mtime +7 -exec rm -rf {} \;
```

**Redis 备份**:

```bash
# 手动触发备份
redis-cli BGSAVE

# 检查备份文件
ls -lh /var/lib/redis/dump.rdb
```

**文件备份**:

```bash
#!/bin/bash
# backup-files.sh

BACKUP_DIR="/backup/files"
DATE=$(date +%Y%m%d_%H%M%S)

# 备份上传文件
tar -czf "${BACKUP_DIR}/uploads_${DATE}.tar.gz" ./uploads

# 备份代码
tar -czf "${BACKUP_DIR}/code_${DATE}.tar.gz" ./backend ./admin-web

# 保留最近 7 天的备份
find ${BACKUP_DIR} -type f -mtime +7 -delete
```

**定时任务**:

```bash
# 编辑 crontab
crontab -e

# 每天凌晨 2 点备份
0 2 * * * /opt/3d-print-agent-system/scripts/backup-mongodb.sh
0 2 * * * /opt/3d-print-agent-system/scripts/backup-files.sh
```

### 健康检查

**后端健康检查 API**:

```javascript
// GET /health
{
  "status": "ok",
  "timestamp": "2026-03-07T10:00:00.000Z",
  "uptime": 86400,
  "database": "connected",
  "redis": "connected",
  "memory": {
    "used": "128MB",
    "free": "896MB"
  }
}
```

**监控脚本**:

```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:3001/health"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ "$response" != "200" ]; then
  echo "Health check failed at $(date)"
  # 发送告警邮件/消息
  # 重启服务
  pm2 restart 3dprint-backend
fi
```

**添加到 crontab**:

```bash
# 每分钟检查一次
* * * * * /opt/3d-print-agent-system/scripts/health-check.sh
```

---

## 故障恢复

### 服务完全不可用

```bash
# 1. 检查所有服务状态
docker-compose ps
# 或
pm2 status

# 2. 重启所有服务
docker-compose restart
# 或
pm2 restart all

# 3. 检查数据库
docker-compose ps mongodb
mongosh --eval "db.runCommand('ping')"

# 4. 查看错误日志
docker-compose logs --tail=200
```

### 数据恢复

```bash
# 从备份恢复 MongoDB
mongorestore --uri="mongodb://admin:password@localhost:27017/3dprint_db" \
  /backup/mongodb/20260307_020000/3dprint_db

# 恢复上传文件
tar -xzf /backup/files/uploads_20260307_020000.tar.gz -C ./
```

---

**文档版本**: v1.0  
**最后更新**: 2026-03-07  
**维护者**: AI Agent Team
