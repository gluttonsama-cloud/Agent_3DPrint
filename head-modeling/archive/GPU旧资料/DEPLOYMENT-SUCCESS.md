# ✅ 本地 GPU 背景抠图服务 - 已部署完成！

> **部署时间**: 2026-03-02  
> **状态**: ✅ 运行中  
> **模型**: u2net (默认，支持切换到 u2net_human_seg)  
> **地址**: http://localhost:7000

---

## 🎉 部署成功！

Rembg 背景抠图 API 服务已成功启动！

**当前状态**:
- ✅ Python 环境已配置
- ✅ Rembg[gpu,cli] 已安装
- ✅ API 服务器运行中
- ✅ 服务地址：http://localhost:7000

---

## 🧪 立即测试

### 方法 1：浏览器访问

打开浏览器访问：
```
http://localhost:7000
```

你会看到 Rembg 的 Web 界面，可以上传图片测试抠图。

---

### 方法 2：命令行测试

```bash
cd local-gpu-service
python test-portrait.py
```

**预期输出**:
```
测试 1: 健康检查...
✓ 健康检查成功：200

测试 2: 下载测试图片...
✓ 图片已下载：xxxxx bytes

测试 3: 发送到 API 抠图...
✓ 抠图成功！
📦 响应大小：xxxxx bytes
✅ 结果已保存：output.png

完成！
```

---

### 方法 3：curl 测试

```bash
# 健康检查
curl http://localhost:7000/health

# 抠图测试
curl -X POST http://localhost:7000/api/remove ^
  -F "image=@test.jpg" ^
  -o output.png
```

---

## 🔄 切换到人像专用模型

当前运行的是默认的 u2net 模型。要获得更好的 3D 头部建模效果，建议切换到 **u2net_human_seg** 人像专用模型。

### 步骤：

1. **停止当前服务** (Ctrl+C)

2. **重新启动（指定模型）**：

```bash
# 方法 1：使用 Python
cd local-gpu-service
python -c "import subprocess; subprocess.Popen(['rembg', 's', '--port', '7000', '--host', '0.0.0.0'])"

# 方法 2：直接运行
rembg s --port 7000 --host 0.0.0.0
```

**注意**: Rembg 的服务器模式不支持直接指定模型，需要在 API 请求时指定。

---

## 🌐 内网穿透（让云端访问）

### 使用 Cloudflare Tunnel

打开**新的命令行窗口**：

```bash
cd local-gpu-service
cloudflare-tunnel.bat
```

**输出示例**:
```
Your quick Tunnel has been created!
Visit it at: https://abc123-rembg.trycloudflare.com
```

**复制这个 URL**，配置到云端后端！

---

## ⚙️ 云端后端配置

编辑 `backend/.env`:

```env
# 本地 GPU 背景抠图
REMBG_API_URL=https://abc123-rembg.trycloudflare.com
USE_LOCAL_GPU_BACKGROUND=true

# 备用方案
PICWISH_API_KEY=your_picwish_key
```

### 测试连接

```bash
cd backend
node api_test/test-remove-bg-local.js
```

---

## 📊 性能预期（RTX 5070）

| 模型 | 速度/张 | 显存 | 质量 | 推荐场景 |
|------|--------|------|------|---------|
| **u2net** (当前) | 1 秒 | 3GB | ⭐⭐⭐⭐ | 通用场景 |
| **u2net_human_seg** | 1 秒 | 3GB | ⭐⭐⭐⭐⭐ | **3D 头部建模** ⭐ |
| **u2netp** | 0.5 秒 | 2GB | ⭐⭐⭐ | 批量处理 |
| **isnet-general-use** | 2 秒 | 4GB | ⭐⭐⭐⭐⭐ | 高精度需求 |

---

## 💡 重要提示

### 1. 模型选择

当前运行的是 **u2net**（通用模型）。对于 3D 头部建模，强烈推荐使用 **u2net_human_seg**。

**如何切换**:

在 API 请求时指定模型：

```javascript
// 云端后端代码
const formData = new FormData();
formData.append('image', imageBuffer);
formData.append('model', 'u2net_human_seg'); // 指定人像模型

const response = await axios.post(
  `${REMBG_API_URL}/api/remove`,
  formData,
  {
    headers: { 'Content-Type': 'multipart/form-data' }
  }
);
```

### 2. 服务保持运行

- 笔记本需要保持**开机**和**联网**
- 建议关闭睡眠/休眠模式
- 确保电源连接

### 3. 内网穿透

- Cloudflare Tunnel 免费但速度一般
- 如果断开，重新运行 `cloudflare-tunnel.bat`
- 建议设置开机自启动

---

## 🔧 故障排查

### 问题 1：服务无法访问

```bash
# 检查端口
netstat -ano | findstr :7000

# 如果无结果，重启服务
cd local-gpu-service
rembg s --port 7000 --host 0.0.0.0
```

### 问题 2：Cloudflare 断开

```bash
# 重启 Tunnel
cloudflare-tunnel.bat

# 或使用 ngrok 备用方案
ngrok http 7000
```

### 问题 3：GPU 未使用

```bash
# 检查 CUDA
python -c "import torch; print(torch.cuda.is_available())"

# 应该输出：True
```

---

## 📚 下一步

1. ✅ **测试本地服务** - 确认抠图正常
2. ✅ **配置内网穿透** - 获得公网 URL
3. ✅ **更新云端配置** - 配置 REMBG_API_URL
4. ✅ **测试云端调用** - 运行 test-remove-bg-local.js
5. ✅ **集成到上传 API** - 修改 upload.js 支持本地抠图

---

## 🎯 推荐配置

**对于 3D 头部建模，推荐**:

- **模型**: u2net_human_seg (人像专用)
- **角度**: 正面/侧面 90°/270°
- **备选**: PicWish API（本地挂掉时备用）
- **成本**: ¥0（电费约¥50/月）

---

**部署完成！现在可以开始测试了！** 🚀

查看完整文档：
- [README-PORTRAIT.md](README-PORTRAIT.md)
- [MULTI-MODEL-GUIDE.md](MULTI-MODEL-GUIDE.md)
