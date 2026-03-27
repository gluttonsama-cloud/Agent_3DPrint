# 数据库服务状态

## Docker 服务（本地方案）

### 启动服务
```bash
docker-compose up -d
```

### 查看状态
```bash
docker-compose ps
```

### 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 只查看 MongoDB 日志
docker-compose logs -f mongodb

# 只查看 Redis 日志
docker-compose logs -f redis
```

### 重启服务
```bash
docker-compose restart
```

### 停止服务
```bash
docker-compose down
```

### 完全重置（删除数据）
```bash
docker-compose down -v
```

---

## 验证连接

### MongoDB
```bash
# 使用 mongosh（如已安装）
mongosh mongodb://localhost:27017/3dprint-demo --eval "db.adminCommand('ping')"

# 或使用 docker exec
docker exec mongodb-3dprint mongosh --eval "db.adminCommand('ping')"

# 预期输出：
# { ok: 1, ... }
```

### Redis
```bash
# 使用 redis-cli（如已安装）
redis-cli -h localhost -p 6379 ping

# 或使用 docker exec
docker exec redis-3dprint redis-cli ping

# 预期输出：PONG
```

---

## 云服务配置（备选方案）

### MongoDB Atlas 设置步骤

1. **注册账户**
   - 访问：https://www.mongodb.com/cloud/atlas/register
   - 使用邮箱注册（不需要信用卡）

2. **创建集群**
   - 点击 "Build a Database"
   - 选择 "M0 FREE" 计划
   - 选择云提供商和区域（建议选 Asia Pacific - Tokyo/Singapore）
   - 集群名称：`3dprint-demo`
   - 点击 "Create Cluster"

3. **设置安全**
   - **Database Access** → Add New Database User
     - 认证方式：Password
     - 用户名：`3dprint_user`
     - 密码：（生成强密码并保存）
     - Database User Privileges: "Read and write to any database"
   - **Network Access** → Add IP Address
     - 选择 "Allow Access from Anywhere"
     - IP 地址：`0.0.0.0/0`
     - 点击 Confirm

4. **获取连接字符串**
   - 点击 "Connect" → "Connect your application"
   - 复制连接字符串
   - 替换 `<password>` 为你设置的密码
   - 格式：`mongodb+srv://3dprint_user:<password>@cluster0.xxxxx.mongodb.net/3dprint-demo?retryWrites=true&w=majority`

5. **更新 .env 文件**
   ```
   MONGODB_URI=mongodb+srv://3dprint_user:your_password@cluster0.xxxxx.mongodb.net/3dprint-demo?retryWrites=true&w=majority
   ```

### Upstash Redis 设置步骤

1. **注册账户**
   - 访问：https://upstash.com/
   - 点击 "Try Free"
   - 使用 GitHub/邮箱注册

2. **创建数据库**
   - 点击 "Create Database"
   - 名称：`3dprint-redis`
   - 区域：选择亚洲区域（如 Tokyo/Singapore）
   - 其他设置保持默认
   - 点击 "Create"

3. **获取连接信息**
   - 在数据库页面，复制 "REST API" 或 "Connect" 信息
   - UPSTASH_REDIS_REST_URL: `https://xxx.upstash.io`
   - UPSTASH_REDIS_REST_TOKEN: `your_token`
   - 或使用传统 URL 格式：`redis://default:your_password@xxx.upstash.io:6379`

4. **更新 .env 文件**
   ```
   REDIS_URL=redis://default:your_password@xxx.upstash.io:6379
   ```

---

## 故障排查

### Docker 问题

**问题 1: 服务无法启动**
```bash
# 检查 Docker 是否运行
docker ps

# 查看具体错误
docker-compose logs mongodb
docker-compose logs redis
```

**问题 2: 端口被占用**
```bash
# 检查端口占用（Windows PowerShell）
netstat -ano | findstr :27017
netstat -ano | findstr :6379

# 解决方法：停止占用进程或修改 docker-compose.yml 端口映射
```

**问题 3: MongoDB 容器持续重启**
```bash
# 删除并重建容器
docker-compose down
docker-compose up -d --force-recreate
```

### 云服务问题

**问题 1: MongoDB Atlas 连接超时**
- 检查 Network Access 是否添加了 0.0.0.0/0
- 检查用户名密码是否正确
- 等待 3-5 分钟让集群完全启动

**问题 2: Upstash 连接失败**
- 检查数据库状态是否为 "Active"
- 验证 URL 和 Token 是否正确
- 检查网络连接

---

## 性能优化建议

### MongoDB
- 开发环境使用默认配置即可
- 演示前运行：`docker-compose restart mongodb` 确保服务新鲜

### Redis
- 已启用 AOF 持久化（appendonly yes）
- 内存限制：开发环境默认足够
- 演示前可运行：`docker exec redis-3dprint redis-cli CONFIG SET maxmemory 256mb`

---

## 备份与恢复

### MongoDB 备份
```bash
# 导出数据
docker exec mongodb-3dprint mongodump --out /tmp/backup

# 从容器复制备份到本地
docker cp mongodb-3dprint:/tmp/backup ./mongodb-backup
```

### Redis 备份
```bash
# 触发 RDB 快照
docker exec redis-3dprint redis-cli BGSAVE

# 复制 RDB 文件
docker cp redis-3dprint:/data/dump.rdb ./redis-backup.rdb
```

---

## 演示日检查清单

- [ ] Docker 服务正常运行：`docker-compose ps`
- [ ] MongoDB 可连接：`docker exec mongodb-3dprint mongosh --eval "db.adminCommand('ping')"`
- [ ] Redis 可连接：`docker exec redis-3dprint redis-cli ping`
- [ ] 后端服务可连接数据库
- [ ] 前端可正常访问
- [ ] 准备云服务备用连接字符串（防止本地故障）
- [ ] 测试完整演示流程至少 2 次

---

## 联系支持

如遇到文档未涵盖的问题，请提供：
1. 错误日志：`docker-compose logs`
2. 系统环境：Windows 版本、Docker 版本
3. 已尝试的解决方案

祝演示顺利！🚀
