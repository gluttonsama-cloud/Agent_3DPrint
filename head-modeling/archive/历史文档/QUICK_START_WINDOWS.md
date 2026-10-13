# 快速启动指南 - Windows

> 3D 打印多 Agent 系统  
> 最后更新：2026-03-06

---

## 🚀 一键启动（推荐）

### 步骤 1：双击运行启动脚本

```
start-all-services.bat
```

这个脚本会自动：
1. ✅ 检查 Node.js
2. ✅ 启动 MongoDB
3. ✅ 启动 Redis（使用正确的配置）
4. ✅ 启动后端服务（端口 3001）
5. ✅ 启动前端服务（端口 5173）
6. ✅ 自动打开浏览器

### 步骤 2：等待服务启动

大约需要 10-15 秒，所有服务会自动打开新窗口。

### 步骤 3：访问应用

浏览器会自动打开：`http://localhost:5173`

---

## 🔧 手动启动（如果一键启动失败）

### 1. 启动 MongoDB

```powershell
# 创建数据目录（首次运行）
mkdir C:\data\db

# 启动 MongoDB
mongod --dbpath "C:\data\db"
```

**确认启动成功**：看到 `waiting for connections` 日志

### 2. 启动 Redis（修正版）

```powershell
# 正确的启动命令
redis-server --bind 127.0.0.1 --port 6379
```

**确认启动成功**：看到 `Ready to accept connections`

### 3. 启动后端

```powershell
cd backend
npm install          # 首次运行
npm run dev
```

**确认启动成功**：
```
╔════════════════════════════════════════════════════════╗
║  3D Head Modeling API - v2.0.0                         ║
╠════════════════════════════════════════════════════════╣
║  Server running on port 3001                          ║
╚════════════════════════════════════════════════════════╝
```

### 4. 启动前端（新终端）

```powershell
cd admin-web
npm install          # 首次运行
npm run dev
```

**确认启动成功**：
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

## ✅ 验证启动成功

### 测试 1：后端健康检查

打开浏览器访问：`http://localhost:3001/health`

应该看到：
```json
{
  "status": "ok",
  "version": "2.0.0"
}
```

### 测试 2：前端页面

打开浏览器访问：`http://localhost:5173`

应该看到应用首页

### 测试 3：Socket.IO 连接

打开浏览器开发者工具（F12），在 Console 中应该看到：
```
Socket.IO connected
```

---

## 🐛 常见问题

### 问题 1：Redis 启动失败

**错误**：`bind: No such file or directory`

**解决方案**：
```powershell
# 使用正确的命令
redis-server --bind 127.0.0.1 --port 6379
```

### 问题 2：MongoDB 启动失败

**错误**：`dbpath 不存在`

**解决方案**：
```powershell
# 创建数据目录
mkdir C:\data\db

# 然后启动
mongod --dbpath "C:\data\db"
```

### 问题 3：端口被占用

**错误**：`EADDRINUSE: address already in use`

**解决方案**：
```powershell
# 查看占用端口的进程
netstat -ano | findstr :3001

# 杀死进程
taskkill /F /PID <进程 ID>
```

### 问题 4：npm install 失败

**错误**：`npm ERR! network timeout`

**解决方案**：
```powershell
# 切换到淘宝镜像
npm config set registry https://registry.npmmirror.com

# 重新安装
npm install
```

---

## 🧪 运行测试

### 测试七牛云 AI

```powershell
cd backend
npm run test:qiniu
```

### 运行完整测试

双击运行：
```
test-system.bat
```

---

## 📊 服务状态检查

| 服务 | 检查方法 | 预期结果 |
|------|---------|---------|
| MongoDB | `mongosh` | 能进入 MongoDB shell |
| Redis | `redis-cli ping` | 返回 `PONG` |
| 后端 | `curl http://localhost:3001/health` | 返回 `{"status":"ok"}` |
| 前端 | 访问 `http://localhost:5173` | 页面正常加载 |
| Socket.IO | 浏览器 Console | 看到 `Socket.IO connected` |

---

## 🛑 停止服务

### 一键停止

关闭所有打开的命令行窗口

### 手动停止

1. **前端/后端**：在对应窗口按 `Ctrl+C`
2. **MongoDB**：
   ```powershell
   net stop MongoDB
   ```
3. **Redis**：关闭窗口或按 `Ctrl+C`

---

## 📞 需要帮助？

如果遇到问题：

1. 检查所有服务是否正常启动
2. 查看错误日志
3. 确认端口未被占用
4. 参考完整文档：`docs/DELIVERY_TEST_CHECKLIST.md`

---

**文档维护者**: AI Agent Team  
**最后更新**: 2026-03-06  
**版本**: v2.0.0
