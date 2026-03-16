# Rembg 本地 GPU 背景抠图服务

> **部署指南**: 5 分钟快速部署本地 GPU 背景抠图服务  
> **适用硬件**: NVIDIA GPU (RTX 3060+ 推荐)  
> **模型**: U-2-Net (Rembg 默认)

---

## 🚀 快速开始

### Windows 用户

```bash
# 1. 运行部署脚本
deploy.bat

# 2. 等待安装完成（首次需要几分钟）

# 3. 服务自动启动
# 访问：http://localhost:7000
```

### Linux/Mac 用户

```bash
# 1. 赋予执行权限
chmod +x deploy.sh

# 2. 运行部署脚本
./deploy.sh

# 3. 服务自动启动
# 访问：http://localhost:7000
```

### Docker 用户

```bash
# 1. 构建镜像
docker build -t rembg-gpu .

# 2. 启动容器
docker run --gpus all --rm -p 7000:7000 rembg-gpu

# 3. 访问服务
curl http://localhost:7000/health
```

---

## 📋 目录结构

```
local-gpu-service/
├── deploy.bat          # Windows 部署脚本
├── deploy.sh           # Linux/Mac 部署脚本
├── Dockerfile          # Docker 镜像
├── docker-compose.yml  # Docker Compose 配置
├── README.md           # 本文件
├── test-api.sh         # API 测试脚本
└── cloudflare-tunnel.sh # Cloudflare Tunnel 脚本
```

---

## 🧪 测试 API

### 方法 1：命令行测试

```bash
# 健康检查
curl http://localhost:7000/health

# 抠图测试
curl -X POST http://localhost:7000/api/remove \
  -F "image=@test.jpg" \
  -o output.png

# 查看结果
open output.png  # Mac
start output.png # Windows
xdg-open output.png # Linux
```

### 方法 2：使用测试脚本

```bash
# Linux/Mac
chmod +x test-api.sh
./test-api.sh

# Windows
test-api.bat
```

---

## 🌐 内网穿透（让云端访问）

### 方案 A：Cloudflare Tunnel（推荐）

```bash
# 1. 安装 cloudflared
# Windows
winget install cloudflare.cloudflared

# Mac
brew install cloudflared

# Linux
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# 2. 启动隧道
cloudflared tunnel --url http://localhost:7000
```

**输出**:
```
Your quick Tunnel has been created!
Visit it at: https://xxxx-rembg.trycloudflare.com
```

**记录这个 URL**，配置到云端后端！

### 方案 B：Ngrok

```bash
# 1. 安装 ngrok
npm install -g ngrok

# 2. 启动隧道
ngrok http 7000
```

**输出**:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:7000
```

---

## ⚙️ 云端后端配置

### 1. 更新 `.env`

编辑 `backend/.env`:

```env
# 本地 GPU 背景抠图
REMBG_API_URL=https://xxxx-rembg.trycloudflare.com
USE_LOCAL_GPU_BACKGROUND=true

# 备用方案（可选）
PICWISH_API_KEY=your_picwish_key
```

### 2. 测试连接

```bash
cd backend
node api_test/test-remove-bg-local.js
```

---

## 🔧 故障排查

### 问题 1：GPU 未被使用

**症状**: 处理速度慢，显存占用低

**解决**:
```bash
# 检查 CUDA 是否可用
python -c "import torch; print(torch.cuda.is_available())"

# 如果为 False，重新安装 GPU 版本
pip uninstall torch torchvision rembg
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
pip install rembg[gpu]
```

### 问题 2：Cloudflare Tunnel 连接失败

**解决**:
```bash
# 检查服务是否运行
curl http://localhost:7000/health

# 重启 tunnel
cloudflared tunnel --url http://localhost:7000
```

### 问题 3：显存不足

**症状**: OOM 错误

**解决**:
```bash
# 使用更小的模型
rembg s --model u2netp --port 7000

# 或者关闭其他 GPU 应用
```

---

## 📊 性能参考

| GPU 型号 | 速度/张 | 显存占用 | 推荐模型 |
|---------|--------|---------|---------|
| RTX 5090 | 0.5 秒 | 3GB | u2net |
| RTX 5070 | 1 秒 | 3GB | u2net |
| RTX 4090 | 0.8 秒 | 3GB | u2net |
| RTX 4070 | 1.2 秒 | 2GB | u2netp |
| RTX 3090 | 1.5 秒 | 3GB | u2net |
| RTX 3060 | 2 秒 | 2GB | u2netp |

---

## 💡 高级配置

### 使用不同模型

```bash
# u2net (默认，平衡)
rembg s --model u2net --port 7000

# u2netp (更快，质量略低)
rembg s --model u2netp --port 7000

# u2net_human_seg (人像专用)
rembg s --model u2net_human_seg --port 7000

# u2net_cloth_seg (衣物专用)
rembg s --model u2net_cloth_seg --port 7000

# silu3d (3D 物体)
rembg s --model silu3d --port 7000
```

### 批量处理

```bash
# 批量抠图
rembg p input_folder output_folder

# 带进度条
rembg p -p input_folder output_folder
```

---

## 📚 参考资源

- [Rembg GitHub](https://github.com/danielgatis/rembg)
- [Rembg 文档](https://github.com/danielgatis/rembg#readme)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/run-tunnel/)
- [PyTorch CUDA](https://pytorch.org/get-started/locally/)

---

**祝你使用愉快！如有问题请查看故障排查章节。** 🚀
