# 本地背景移除服务

```powershell
python -m pip install "rembg[gpu,cli]"
rembg s --port 7000 --host 127.0.0.1
```

服务前台运行在 127.0.0.1:7000，Ctrl+C 停止。
Docker 配置为独立可选 gpu profile；具体 GPU 运行时配置和 rembg 环境需另行验证。
当前 API 抠图实现使用 PicWish，尚未接入本地 rembg；本目录保留作为后续替换候选。
历史多模型、穿透、安装及部署脚本见 ../../archive/GPU旧资料。
