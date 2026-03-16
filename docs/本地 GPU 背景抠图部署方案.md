# 本地 GPU 背景抠图服务部署指南

> **适用场景**: 有 NVIDIA GPU 的笔记本/工作站  
> **显卡要求**: NVIDIA RTX 3060+（推荐 RTX 4070/5070）  
> **模型**: RMBG-1.4 / RMBG-2.0（BRIA AI）或 rembg（U-2-Net）

---

## 🎯 方案对比

### 方案 A：Rembg（推荐新手）⭐⭐⭐⭐⭐

**优点**:
- ✅ 安装简单（pip 一行命令）
- ✅ 支持多种模型（u2net/u2netp/u2net_human_seg 等）
- ✅ 自带 HTTP 服务器模式
- ✅ Docker 支持
- ✅ 社区活跃（22K+ stars）
- ✅ 完全免费开源（MIT License）

**缺点**:
- ⚠️ 边缘质量略逊于 RMBG
- ⚠️ 速度较慢

**适合**: 快速部署，测试验证

---

### 方案 B：RMBG-1.4 / RMBG-2.0（推荐生产）⭐⭐⭐⭐⭐

**优点**:
- ✅ 业界 SOTA 效果
- ✅ 边缘处理优秀（媲美 Remove.bg）
- ✅ 商业可用（需授权）
- ✅ HuggingFace 官方支持

**缺点**:
- ⚠️ 需要自己搭建 API 服务
- ⚠️ 商业使用需授权（非商用免费）

**适合**: 生产环境，高质量要求

---

## 🚀 方案 A：Rembg 快速部署（推荐）

### 1. 在笔记本上安装

#### 方法 1：PIP 安装（最简单）

```bash
# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# 安装 rembg（GPU 版本）
pip install rembg[gpu]

# 验证安装
rembg --version
```

#### 方法 2：Docker 安装（推荐生产）

```bash
# 拉取 Docker 镜像
docker pull ghcr.io/danielgatis/rembg:latest

# 测试运行
docker run --gpus all --rm -p 7000:5000 ghcr.io/danielgatis/rembg:latest
```

---

### 2. 启动 HTTP 服务器

```bash
# 启动 API 服务器（GPU 加速）
rembg s --host 0.0.0.0 --port 7000

# 输出：
# Starting server on http://0.0.0.0:7000
# Using GPU: NVIDIA GeForce RTX 5070
```

---

### 3. 测试 API

```bash
# 测试端点
curl http://localhost:7000/api/remove

# 上传图片测试
curl -X POST http://localhost:7000/api/remove \
  -F "image=@photo.jpg" \
  -o output.png
```

**预览**: 打开 `output.png` 查看效果

---

### 4. 配置内网穿透（让云端访问）

#### 方法 1：Cloudflare Tunnel（推荐）

```bash
# 安装 cloudflared
# Windows (PowerShell)
winget install cloudflare.cloudflared

# 创建隧道
cloudflared tunnel --url http://localhost:7000
```

**输出**:
```
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://xxxx-rembg.trycloudflare.com
```

**记录这个 URL**，云端后端可以直接调用！

#### 方法 2：Ngrok

```bash
# 安装 ngrok
npm install -g ngrok

# 启动隧道
ngrok http 7000
```

**输出**:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:7000
```

#### 方法 3：Frp（自有服务器）

如果有云服务器，可以搭建 frp 反向代理：

```ini
# frpc.ini
[rembg]
type = tcp
local_ip = 127.0.0.1
local_port = 7000
remote_port = 6000
```

---

### 5. 云端后端调用

更新 `backend/.env`:
```env
# 本地 Rembg API（通过内网穿透）
REMBG_API_URL=https://xxxx-rembg.trycloudflare.com
# 或者云服务器的 IP
# REMBG_API_URL=http://your-server-ip:6000
```

---

## 🚀 方案 B：RMBG-1.4 部署（高质量）

### 1. 准备环境

```bash
# 创建项目目录
mkdir rmbg-service
cd rmbg-service

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows

# 安装依赖
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
pip install transformers pillow fastapi uvicorn python-multipart
```

---

### 2. 创建 API 服务

**文件**: `rmbg-service/main.py`

```python
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from PIL import Image
import torch
from transformers import AutoModelForImageSegmentation
from io import BytesIO
import numpy as np

app = FastAPI(title="RMBG Background Removal API")

# 加载模型
print("Loading RMBG-1.4 model...")
model = AutoModelForImageSegmentation.from_pretrained(
    'briaai/RMBG-1.4', 
    trust_remote_code=True
)
model.to('cuda' if torch.cuda.is_available() else 'cpu')
model.eval()
print("✅ Model loaded!")

@app.post("/api/remove")
async def remove_background(file: UploadFile = File(...)):
    try:
        # 读取图片
        image = Image.open(file.file).convert('RGB')
        orig_size = image.size
        
        # 预处理
        model_input = image.resize((1024, 1024))
        model_input = torch.tensor(np.array(model_input)).float() / 255.0
        model_input = model_input.permute(2, 0, 1).unsqueeze(0)
        model_input = model_input.to(model.device)
        
        # 推理
        with torch.no_grad():
            pred = model(model_input)[0][0]
        
        # 后处理
        pred = torch.sigmoid(pred)
        pred = (pred > 0.5).float()
        pred = pred.squeeze().cpu().numpy()
        
        # 创建蒙版
        mask = Image.fromarray((pred * 255).astype('uint8'))
        mask = mask.resize(orig_size, Image.LANCZOS)
        
        # 应用蒙版
        result = Image.new('RGBA', orig_size)
        result.paste(image.convert('RGBA'), mask=mask)
        
        # 返回 PNG
        output = BytesIO()
        result.save(output, format='PNG')
        output.seek(0)
        
        return Response(
            content=output.getvalue(),
            media_type='image/png'
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "gpu": torch.cuda.is_available(),
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7000)
```

---

### 3. 启动服务

```bash
# 启动 API 服务器
python main.py

# 输出：
# Loading RMBG-1.4 model...
# ✅ Model loaded!
# INFO:     Uvicorn running on http://0.0.0.0:7000
```

---

### 4. 测试

```bash
# 健康检查
curl http://localhost:7000/health

# 抠图测试
curl -X POST http://localhost:7000/api/remove \
  -F "image=@photo.jpg" \
  -o output.png
```

---

## 🔗 后端集成（云端调用本地 GPU）

### 1. 更新 `.env`

```env
# 背景抠图 API（本地 GPU）
# 选项 1: Cloudflare Tunnel
REMBG_API_URL=https://xxxx-rembg.trycloudflare.com

# 选项 2: Ngrok
# REMBG_API_URL=https://abc123.ngrok.io

# 选项 3: 云服务器中转
# REMBG_API_URL=http://your-server-ip:6000

# 启用本地 GPU 抠图
USE_LOCAL_GPU_BACKGROUND=true
```

---

### 2. 更新后端服务

**文件**: `backend/src/services/backgroundRemoval.js`

```javascript
const axios = require('axios');

const REMBG_API_URL = process.env.REMBG_API_URL || 'http://localhost:7000';
const USE_LOCAL_GPU = process.env.USE_LOCAL_GPU_BACKGROUND === 'true';

/**
 * 本地 GPU 抠图（Rembg/RMBG）
 */
async function removeBackgroundLocal(imageUrl) {
  if (!USE_LOCAL_GPU) {
    throw new Error('本地 GPU 抠图未启用');
  }

  try {
    console.log(`🎨 本地 GPU 抠图：${imageUrl}`);

    // 下载图片
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });

    // 发送到本地 API
    const formData = new FormData();
    formData.append('image', Buffer.from(imageResponse.data), 'input.jpg');

    const result = await axios.post(
      `${REMBG_API_URL}/api/remove`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        responseType: 'arraybuffer',
        timeout: 60000
      }
    );

    console.log(`✅ 本地 GPU 抠图完成`);
    
    return Buffer.from(result.data);

  } catch (error) {
    console.error('❌ 本地 GPU 抠图失败:', error.message);
    throw new Error(`本地抠图失败：${error.message}`);
  }
}

module.exports = {
  removeBackgroundLocal,
  // ... 其他导出
};
```

---

### 3. 混合策略（本地 + 云端备用）

```javascript
async function removeBackground(imageUrl) {
  // 优先使用本地 GPU
  if (USE_LOCAL_GPU) {
    try {
      return await removeBackgroundLocal(imageUrl);
    } catch (error) {
      console.warn('⚠️  本地 GPU 失败，降级到 PicWish API');
      // 降级到 PicWish
    }
  }
  
  // 备用：PicWish API
  return await removeBackgroundPicWish(imageUrl);
}
```

---

## 📊 性能对比

| 方案 | 速度/张 | 边缘质量 | 成本 | 推荐场景 |
|------|--------|---------|------|---------|
| **Rembg (GPU)** | 2-3 秒 | ⭐⭐⭐⭐ | 免费 | 开发测试 |
| **RMBG-1.4 (GPU)** | 1-2 秒 | ⭐⭐⭐⭐⭐ | 免费 | 生产环境 |
| **PicWish API** | 1-2 秒 | ⭐⭐⭐⭐ | ¥0.05/张 | 备用方案 |
| **Remove.bg** | ~3 秒 | ⭐⭐⭐⭐⭐ | ¥1.5/张 | 不推荐 |

---

## 🎯 推荐方案

### 开发阶段

```
1. 笔记本安装 Rembg（pip install rembg[gpu]）
2. 启动 HTTP 服务器（rembg s --port 7000）
3. Cloudflare Tunnel 暴露（cloudflared tunnel --url http://localhost:7000）
4. 云端后端配置 REMBG_API_URL
5. 测试验证
```

**成本**: ¥0（完全免费）

---

### 生产阶段

```
方案 A: 笔记本 24 小时运行
- RMBG-1.4 + FastAPI
- 云服务器 frp 中转
- 成本：笔记本电费

方案 B: 租用 GPU 云服务器
- AutoDL / Vast.ai
- RTX 4090: ~¥2/小时
- 成本：¥500-1000/月

方案 C: 混合模式
- 日常：本地 GPU
- 高峰：PicWish API 备用
- 成本：¥100-200/月（备用额度）
```

---

## ⚠️ 注意事项

### 1. 网络稳定性

- 家用网络可能不稳定
- 建议配置备用方案（PicWish API）
- 使用云服务器中转更可靠

### 2. 笔记本续航

- GPU 全速运行功耗高（200-300W）
- 建议插电使用
- 注意散热

### 3. 公网访问

- Cloudflare Tunnel 免费但速度一般
- Ngrok 免费版有限制
- 推荐：云服务器 + frp

### 4. 商业授权

- Rembg: MIT License（商用免费）
- RMBG-1.4: 非商用免费，商用需授权
- 生产环境建议购买授权或自训练模型

---

## 📚 参考资源

- [Rembg GitHub](https://github.com/danielgatis/rembg)
- [RMBG-1.4 HuggingFace](https://huggingface.co/briaai/RMBG-1.4)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/run-tunnel/)
- [Frp GitHub](https://github.com/fatedier/frp)

---

**下一步**: 选择方案后，我可以帮你创建完整的部署脚本和配置文件！🚀
