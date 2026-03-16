# 🚀 本地 GPU 背景抠图 - 快速部署指南

> **5 分钟完成部署** - 使用你的 NVIDIA GPU 运行免费无限制的 AI 背景抠图服务

---

## 📦 部署包内容

```
local-gpu-service/
├── deploy.bat              # Windows 一键部署
├── deploy.sh               # Linux/Mac 一键部署
├── Dockerfile              # Docker 镜像
├── docker-compose.yml      # Docker Compose 配置
├── test-api.bat            # Windows 测试脚本
├── test-api.sh             # Linux/Mac 测试脚本
├── cloudflare-tunnel.bat   # Windows 内网穿透
├── cloudflare-tunnel.sh    # Linux/Mac 内网穿透
└── README.md               # 详细文档
```

---

## ⚡ 快速开始（3 步）

### 步骤 1：运行部署脚本

**Windows 用户**:
```bash
cd local-gpu-service
deploy.bat
```

**Linux/Mac 用户**:
```bash
cd local-gpu-service
chmod +x deploy.sh
./deploy.sh
```

**Docker 用户**:
```bash
cd local-gpu-service
docker-compose up -d
```

---

### 步骤 2：启动内网穿透（让云端访问）

**Windows**:
```bash
cloudflare-tunnel.bat
```

**Linux/Mac**:
```bash
./cloudflare-tunnel.sh
```

**记录输出的 URL**，例如：
```
https://abc123-rembg.trycloudflare.com
```

---

### 步骤 3：配置云端后端

编辑 `backend/.env`:

```env
# 本地 GPU 背景抠图
REMBG_API_URL=https://abc123-rembg.trycloudflare.com
USE_LOCAL_GPU_BACKGROUND=true

# 备用方案（可选）
PICWISH_API_KEY=your_picwish_key
```

---

## 🧪 测试连接

### 测试 1：本地测试

```bash
cd local-gpu-service
test-api.bat  # Windows
# 或
./test-api.sh  # Linux/Mac
```

### 测试 2：云端测试

```bash
cd backend
node api_test/test-remove-bg-local.js
```

**预期输出**:
```
✅ 健康检查成功
✅ 抠图成功
✅ 结果已保存：output-local.png
```

---

## 💰 成本对比

| 方案 | 单张成本 | 月成本 (4000 张) | 年成本 |
|------|---------|----------------|--------|
| **本地 GPU** | ¥0.01（电费） | **¥50** | **¥600** |
| PicWish | ¥0.05 | ¥200 | ¥2400 |
| Remove.bg | ¥1.5 | ¥6000 | ¥72000 |

**每年节省**: ¥1800-71000！💰

---

## ⚙️ 硬件要求

| 组件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| **GPU** | GTX 1060 | RTX 4070/5070+ |
| **显存** | 4GB | 8GB+ |
| **内存** | 8GB | 16GB+ |
| **Python** | 3.8+ | 3.10+ |

---

## 🔧 故障排查

### 问题 1：服务无法启动

```bash
# 检查端口占用
netstat -ano | findstr :7000

# 杀掉占用进程
taskkill /F /PID <进程 ID>

# 重新启动
deploy.bat
```

### 问题 2：GPU 未被使用

```bash
# 检查 CUDA
python -c "import torch; print(torch.cuda.is_available())"

# 如果为 False，重新安装 GPU 版本
pip uninstall torch torchvision rembg
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
pip install rembg[gpu]
```

### 问题 3：Cloudflare Tunnel 断开

```bash
# 重启 Tunnel
cloudflare-tunnel.bat

# 或使用 ngrok 备用方案
ngrok http 7000
```

---

## 📊 性能参考（RTX 5070）

| 模型 | 速度/张 | 显存 | 质量 |
|------|--------|------|------|
| **u2net** | 1 秒 | 3GB | ⭐⭐⭐⭐ |
| **u2netp** | 0.5 秒 | 2GB | ⭐⭐⭐ |
| **u2net_human_seg** | 1 秒 | 3GB | ⭐⭐⭐⭐⭐（人像） |

---

## 🎯 下一步

1. ✅ 部署本地服务
2. ✅ 配置内网穿透
3. ✅ 更新云端配置
4. ✅ 测试连接
5. ✅ 集成到上传 API

---

## 📚 完整文档

详细文档请查看：[local-gpu-service/README.md](local-gpu-service/README.md)

---

**祝你使用愉快！** 🚀
