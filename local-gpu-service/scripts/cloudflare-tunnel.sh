#!/bin/bash

echo "========================================"
echo " 启动 Cloudflare Tunnel"
echo " 将本地服务暴露到公网"
echo "========================================"
echo ""

TARGET_URL="${1:-http://localhost:7000}"

echo "目标地址：$TARGET_URL"
echo ""

# 检查 cloudflared 是否安装
if ! command -v cloudflared &> /dev/null; then
    echo "[错误] cloudflared 未安装"
    echo ""
    echo "请先安装:"
    echo "  Windows: winget install cloudflare.cloudflared"
    echo "  Mac:     brew install cloudflared"
    echo "  Linux:   查看 https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    exit 1
fi

echo "[✓] cloudflared 已安装"
echo ""

echo "正在启动 Tunnel..."
echo "按 Ctrl+C 停止"
echo ""

# 启动 quick tunnel
cloudflared tunnel --url "$TARGET_URL"
