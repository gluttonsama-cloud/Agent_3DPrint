# ✅ 配置完成！内网穿透 + 人像专用模型

> **配置时间**: 2026-03-02  
> **状态**: ✅ 已完成  
> **模型**: u2net_human_seg (人像专用)  
> **内网穿透**: Cloudflare Tunnel（每次运行）

---

## 📝 回答你的问题

### Q1: 内网穿透只用配置一次吗？

**不是**，每次运行都需要重新启动，因为：

1. **Cloudflare Tunnel 是临时的**
   - 每次运行生成新的 URL
   - 关闭后 URL 失效
   - 下次运行 URL 会变

2. **Rembg 服务也是临时的**
   - 关闭后需要重启
   - 端口占用需要释放

**解决方案**: 使用一键启动脚本！

---

### Q2: 切换成 u2net_human_seg 了吗？

**是的！** 已经配置好，默认使用 **u2net_human_seg** 人像专用模型！

在云端后端代码中已设置：
```javascript
const REMBG_MODEL = process.env.REMBG_MODEL || 'u2net_human_seg';
```

---

## 🚀 每次使用流程（简单 3 步）

### 步骤 1：一键启动（每次都要做）

**双击运行**:
```
local-gpu-service/start-all.bat
```

**会自动**:
1. ✅ 启动 Rembg API 服务器（端口 7000）
2. ✅ 启动 Cloudflare Tunnel（内网穿透）
3. ✅ 打开浏览器测试页面

**两个窗口会保持运行**:
- **Rembg API Server** - API 服务
- **Cloudflare Tunnel** - 显示公网 URL

**记录 Cloudflare URL**，例如：
```
https://abc123-rembg.trycloudflare.com
```

---

### 步骤 2：配置云端后端

编辑 `backend/.env`:

```env
# 本地 GPU 背景抠图（人像专用）
REMBG_API_URL=https://abc123-rembg.trycloudflare.com
USE_LOCAL_GPU_BACKGROUND=true
REMBG_MODEL=u2net_human_seg

# 备用方案（推荐）
PICWISH_API_KEY=your_picwish_key
```

---

### 步骤 3：测试连接

```bash
cd backend
node api_test/test-remove-bg-local.js
```

**预期输出**:
```
✅ 健康检查成功
✅ 抠图成功（使用 u2net_human_seg 模型）
✅ 结果已保存：output-local.png
```

---

## 🛑 停止服务

**双击运行**:
```
local-gpu-service/stop-all.bat
```

**或手动关闭**:
- 关闭 "Rembg API Server" 窗口
- 关闭 "Cloudflare Tunnel" 窗口

---

## 📊 使用对比

| 操作 | 频率 | 说明 |
|------|------|------|
| **start-all.bat** | 每次使用 | 启动服务 + 内网穿透 |
| **stop-all.bat** | 停止使用 | 关闭所有服务 |
| **配置 .env** | 仅第一次 | 保存 REMBG_API_URL |
| **测试** | 可选 | 确认连接正常 |

---

## 💡 优化建议

### 1. 长期运行（推荐）

如果笔记本 24 小时开机：
- 运行一次 `start-all.bat`
- 保持笔记本开机+联网
- 关闭睡眠模式
- 插电运行

**可以一周只启动一次**！

### 2. 固定 URL（进阶）

如果嫌每次 URL 变化麻烦：

**方案 A**: Cloudflare Zero Trust（免费，需域名）
- 绑定自己的域名
- 获得固定 URL：`rembg.yourdomain.com`

**方案 B**: Ngrok 付费版（$8/月）
- 固定子域名：`rembg.ngrok.io`

**方案 C**: 云服务器 frp 中转（¥100-200/月）
- 固定 IP+ 端口

### 3. 开机自启动

**Windows**:
1. 创建 `start-all.bat` 快捷方式
2. 按 `Win+R`，输入 `shell:startup`
3. 拖快捷方式到启动文件夹

**注意**: 需要保持登录状态

---

## 🎯 模型说明

### 当前配置：u2net_human_seg ⭐⭐⭐⭐⭐

**专为人体/人像优化**:
- ✅ 头发细节清晰
- ✅ 边缘自然无白边
- ✅ 多人场景识别准确
- ✅ 侧脸也能识别

**适合场景**:
- 3D 头部建模（正面/侧面/背面）
- 人像摄影
- 全身/半身照

### 其他可选模型

| 模型 | 速度 | 质量 | 推荐场景 |
|------|------|------|---------|
| **u2net_human_seg** | 1 秒 | ⭐⭐⭐⭐⭐ | 3D 头部建模 ⭐ |
| u2net | 1 秒 | ⭐⭐⭐⭐ | 通用场景 |
| u2netp | 0.5 秒 | ⭐⭐⭐ | 批量处理 |
| isnet-general-use | 2 秒 | ⭐⭐⭐⭐⭐ | 高精度需求 |

**切换模型**: 修改 `.env` 的 `REMBG_MODEL`

---

## 📚 完整文档

- [一键启动指南](local-gpu-service/START-GUIDE.md)
- [部署成功说明](local-gpu-service/DEPLOYMENT-SUCCESS.md)
- [人像专用指南](local-gpu-service/README-PORTRAIT.md)

---

## ⚠️ 重要提示

1. **每次使用都要运行** `start-all.bat`
2. **关闭时运行** `stop-all.bat`
3. **笔记本保持联网**才能使用
4. **Cloudflare URL 每次会变**，重新配置即可
5. **默认使用 u2net_human_seg**（人像专用）

---

**现在运行 `start-all.bat` 开始使用吧！** 🚀

下次使用时，再次运行 `start-all.bat` 即可！
