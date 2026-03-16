# 🚀 一键启动指南

> **每次运行都需要执行此步骤** - 启动服务 + 内网穿透

---

## ⚡ 快速启动（每次运行都要做）

### Windows 用户

**双击运行**:
```
start-all.bat
```

**或命令行**:
```bash
cd local-gpu-service
start-all.bat
```

**预期输出**:
```
========================================
 一键启动：本地 GPU 背景抠图服务
 模型：u2net_human_seg (人像专用)
 内网穿透：Cloudflare Tunnel
========================================

[1/3] 启动 Rembg API 服务器...
[✓] Rembg 服务已启动 (端口 7000)

[2/3] 启动 Cloudflare Tunnel...
[✓] Cloudflare Tunnel 已启动

[3/3] 等待服务启动...

========================================
 ✅ 所有服务已启动！
========================================

  本地访问：http://localhost:7000
  公网访问：查看 Cloudflare Tunnel 窗口的 URL
```

**会自动打开两个窗口**:
1. **Rembg API Server** - API 服务
2. **Cloudflare Tunnel** - 内网穿透

**记录 Cloudflare Tunnel 窗口的 URL**，例如：
```
https://abc123-rembg.trycloudflare.com
```

---

### Linux/Mac 用户

```bash
cd local-gpu-service
chmod +x start-all.sh
./start-all.sh
```

---

## 🛑 停止服务

### Windows

**双击运行**:
```
stop-all.bat
```

**或手动关闭**:
- 关闭 "Rembg API Server" 窗口
- 关闭 "Cloudflare Tunnel" 窗口

### Linux/Mac

```bash
# 按 Ctrl+C 停止
# 或找到 PID 后 kill
```

---

## ❓ 常见问题

### Q1: 每次都要运行吗？

**是的**！每次使用都需要运行 `start-all.bat`，因为：

1. **Rembg 服务** - 需要启动 API 服务器
2. **Cloudflare Tunnel** - 每次生成新的临时 URL

**解决方案**: 
- 创建桌面快捷方式到 `start-all.bat`
- 设置开机自启动（见下方）

---

### Q2: 能有固定 URL 吗？

可以！有 3 种方案：

#### 方案 A：Cloudflare Zero Trust（推荐，免费）

1. 注册 Cloudflare 账号
2. 配置 Zero Trust
3. 绑定自己的域名
4. 获得固定 URL：`rembg.yourdomain.com`

**优点**: 免费、稳定、自定义域名  
**缺点**: 需要配置，有自己的域名

#### 方案 B：Ngrok（付费）

```bash
# 付费账号获得固定 URL
ngrok http 7000 --subdomain=rembg
# 输出：https://rembg.ngrok.io (固定)
```

**优点**: 简单、稳定  
**缺点**: $8-20/月

#### 方案 C：云服务器中转

用自己的云服务器做 frp 中转，获得固定 IP+ 端口

**优点**: 完全控制  
**缺点**: 服务器成本 ¥100-200/月

---

### Q3: 如何开机自启动？

#### Windows:

1. 创建快捷方式到 `start-all.bat`
2. 按 `Win+R`，输入 `shell:startup`
3. 把快捷方式拖到启动文件夹

**注意**: 需要保持登录状态

#### Linux (systemd):

创建 `/etc/systemd/system/rembg.service`:

```ini
[Unit]
Description=Rembg Background Removal API
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/local-gpu-service
ExecStart=/usr/bin/rembg s --port 7000 --host 0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable rembg
sudo systemctl start rembg
```

---

## 📊 服务信息

### 当前配置

| 项目 | 值 |
|------|-----|
| **模型** | u2net (可切换 u2net_human_seg) |
| **端口** | 7000 |
| **主机** | 0.0.0.0 |
| **内网穿透** | Cloudflare Tunnel |
| **URL 类型** | 临时（每次变化） |

### 切换到人像专用模型

在 API 请求时指定：

```javascript
const formData = new FormData();
formData.append('image', imageBuffer);
formData.append('model', 'u2net_human_seg'); // ⭐ 人像专用

const response = await axios.post(`${REMBG_API_URL}/api/remove`, formData);
```

---

## 🎯 使用流程

### 每次使用时：

1. **运行** `start-all.bat`
2. **记录** Cloudflare URL
3. **配置** 云端后端 `.env`
4. **测试** 连接
5. **使用** 抠图服务
6. **停止** 时运行 `stop-all.bat`

### 示例流程：

```bash
# 1. 启动
start-all.bat

# 2. 获得 URL: https://abc123-rembg.trycloudflare.com

# 3. 配置云端后端
# 编辑 backend/.env
REMBG_API_URL=https://abc123-rembg.trycloudflare.com

# 4. 测试
cd backend
node api_test/test-remove-bg-local.js

# 5. 正常使用...

# 6. 停止
stop-all.bat
```

---

## 💡 优化建议

### 1. 保持服务运行

如果笔记本 24 小时开机：
- 设置电源选项：不休眠
- 插上电源
- 保持联网
- 运行一次 `start-all.bat` 即可

### 2. 固定 URL（长期方案）

如果长期运行，建议配置：
- Cloudflare Zero Trust（免费，需域名）
- 或 Ngrok 付费版（$8/月）
- 或云服务器 frp 中转

### 3. 监控服务

添加健康检查脚本：

```bash
# check-health.bat
@echo off
curl http://localhost:7000/health >nul 2>&1
if errorlevel 1 (
    echo 服务异常，正在重启...
    taskkill /FI "WINDOWTITLE eq Rembg*" /T /F
    start "" cmd /k "rembg s --port 7000 --host 0.0.0.0"
) else (
    echo 服务正常
)
```

用 Windows 任务计划程序每分钟运行一次。

---

## 📚 相关文档

- [部署成功说明](DEPLOYMENT-SUCCESS.md)
- [人像专用指南](README-PORTRAIT.md)
- [多模型文档](MULTI-MODEL-GUIDE.md)

---

**现在运行 `start-all.bat` 开始使用吧！** 🚀
