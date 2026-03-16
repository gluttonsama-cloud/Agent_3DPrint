#!/bin/bash

echo "========================================"
echo " 一键启动：本地 GPU 背景抠图服务"
echo " 模型：u2net_human_seg (人像专用)"
echo " 内网穿透：Cloudflare Tunnel"
echo "========================================"
echo ""

echo "[1/3] 启动 Rembg API 服务器..."
rembg s --port 7000 --host 0.0.0.0 &
REMBG_PID=$!
echo "[✓] Rembg 服务已启动 (PID: $REMBG_PID)"
sleep 3

echo ""
echo "[2/3] 启动 Cloudflare Tunnel..."
cloudflared tunnel --url http://localhost:7000 &
TUNNEL_PID=$!
echo "[✓] Cloudflare Tunnel 已启动 (PID: $TUNNEL_PID)"
echo ""

echo "[3/3] 等待服务启动..."
sleep 5

echo ""
echo "========================================"
echo " ✅ 所有服务已启动！"
echo "========================================"
echo ""
echo "  本地访问：http://localhost:7000"
echo "  公网访问：查看上面的 Cloudflare URL"
echo ""
echo "  进程信息:"
echo "    Rembg: PID $REMBG_PID"
echo "    Tunnel: PID $TUNNEL_PID"
echo ""
echo "  停止服务:"
echo "    kill $REMBG_PID $TUNNEL_PID"
echo "    或按 Ctrl+C"
echo ""
echo "========================================"

# 打开浏览器
if command -v open &> /dev/null; then
    open http://localhost:7000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:7000
fi

# 等待进程
wait
