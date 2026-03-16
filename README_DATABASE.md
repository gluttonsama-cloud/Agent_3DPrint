# 3D 打印多 Agent 系统 - 数据库环境配置

> **最后更新**: 2026 年 3 月 6 日
> **适用系统**: Windows 10/11

---

## ⚡ 快速开始（3 分钟）

### 步骤 1: 确认 Docker Desktop 已安装

```bash
# 检查 Docker 是否运行
docker ps
```

如未安装，请下载：https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe

### 步骤 2: 启动数据库服务

**Windows:**
```bash
start-dev.bat
```

**WSL / macOS / Linux:**
```bash
chmod +x start-dev.sh
./start-dev.sh
```

### 步骤 3: 验证连接

```bash
# MongoDB
docker exec mongodb-3dprint mongosh --eval "db.adminCommand('ping')"

# Redis
docker exec redis-3dprint redis-cli ping
```

看到 `ok: 1` 和 `PONG` 即表示成功！

---

## 📋 目录说明

```
项目根目录/
├── docker-compose.yml      # Docker 服务配置（MongoDB + Redis）
├── .env.example            # 环境变量模板
├── .env                    # 实际环境变量（需自行创建）
├── start-dev.bat           # Windows 启动脚本
├── start-dev.sh            # Linux/macOS启动脚本
├── DATABASE_SETUP.md       # 详细配置文档
└── README_DATABASE.md      # 本文件
```

---

## 🔧 配置文件说明

### 1. 创建 .env 文件

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

### 2. 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MONGODB_URI` | MongoDB 连接字符串 | `mongodb://localhost:27017/3dprint-demo` |
| `MONGODB_DB_NAME` | 数据库名称 | `3dprint-demo` |
| `REDIS_URL` | Redis 连接字符串 | `redis://localhost:6379` |
| `PORT` | 后端服务端口 | `3001` |
| `NODE_ENV` | 运行环境 | `development` |

---

## 🐳 Docker 服务详情

### MongoDB 7.x
- **端口**: 27017
- **数据卷**: mongo-data（持久化）
- **健康检查**: 每 10 秒 ping 一次
- **启动时间**: 约 15-30 秒

### Redis 7.x
- **端口**: 6379
- **数据卷**: redis-data（持久化）
- **持久化**: AOF（追加日志）
- **启动时间**: 约 5-10 秒

---

## 🛠️ 常用命令

### 服务管理
```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 完全重置（删除所有数据）
docker-compose down -v
```

### 数据库操作
```bash
# 进入 MongoDB Shell
docker exec -it mongodb-3dprint mongosh

# 进入 Redis CLI
docker exec -it redis-3dprint redis-cli

# 查看 MongoDB 数据库列表
docker exec mongodb-3dprint mongosh --eval "show dbs"

# 查看 Redis 所有 key
docker exec redis-3dprint redis-cli KEYS "*"
```

---

## ☁️ 云服务备选方案

如 Docker 无法使用，可使用云服务：

### MongoDB Atlas（免费）
1. 访问：https://www.mongodb.com/cloud/atlas/register
2. 创建 M0 Free Cluster（512MB）
3. 获取连接字符串
4. 更新 `.env` 中的 `MONGODB_URI`

### Upstash Redis（免费）
1. 访问：https://upstash.com/
2. 创建免费数据库（30MB）
3. 获取连接字符串
4. 更新 `.env` 中的 `REDIS_URL`

详细步骤请参考 `DATABASE_SETUP.md`

---

## ❓ 故障排查

### 问题 1: Docker 服务无法启动

```bash
# 检查 Docker 是否运行
docker ps

# 查看具体错误
docker-compose logs
```

### 问题 2: 端口被占用

```bash
# 检查端口占用（Windows）
netstat -ano | findstr :27017
netstat -ano | findstr :6379

# 解决方法：停止占用进程或修改 docker-compose.yml 端口
```

### 问题 3: MongoDB 连接超时

```bash
# 等待 30 秒后重试（MongoDB 启动较慢）
timeout /t 30

# 检查容器状态
docker-compose ps

# 查看 MongoDB 日志
docker-compose logs mongodb
```

### 问题 4: Redis 连接被拒绝

```bash
# 检查 Redis 是否运行
docker exec redis-3dprint redis-cli ping

# 如失败，重启 Redis
docker-compose restart redis
```

---

## 📊 演示日检查清单

- [ ] Docker Desktop 已启动
- [ ] 运行 `start-dev.bat` 无错误
- [ ] MongoDB 可连接：`docker exec mongodb-3dprint mongosh --eval "db.adminCommand('ping')"`
- [ ] Redis 可连接：`docker exec redis-3dprint redis-cli ping`
- [ ] 后端服务可正常连接数据库
- [ ] 前端页面可正常访问
- [ ] 完整演示流程测试 2 次以上
- [ ] 准备云服务备用配置（防止本地故障）

---

## 🎯 下一步

数据库环境配置完成后，请继续：

1. 安装后端依赖：`npm install`
2. 配置后端环境变量：复制 `.env.example` 到后端目录
3. 启动后端服务：`npm run dev`
4. 启动前端服务：（待前端代码实现后补充）

---

## 📞 获取帮助

如遇问题，请提供以下信息：

1. **错误日志**: `docker-compose logs`
2. **系统信息**: Windows 版本、Docker 版本
3. **已尝试的解决方案**

祝开发顺利！🚀
