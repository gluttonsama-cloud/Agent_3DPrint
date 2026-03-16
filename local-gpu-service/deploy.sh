#!/bin/bash

echo "========================================"
echo " Rembg 本地 GPU 背景抠图服务 - 快速部署"
echo "========================================"
echo ""

echo "[1/5] 检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未检测到 Python3，请先安装 Python 3.8+"
    exit 1
fi
echo "[✓] Python 环境正常：$(python3 --version)"

echo ""
echo "[2/5] 创建虚拟环境..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "[✓] 虚拟环境已创建"
else
    echo "[✓] 虚拟环境已存在"
fi

echo ""
echo "[3/5] 激活虚拟环境..."
source venv/bin/activate

echo ""
echo "[4/5] 安装 Rembg (GPU 版本)..."
echo "这可能需要几分钟..."
pip install -q rembg[gpu]
if [ $? -ne 0 ]; then
    echo "[警告] GPU 版本安装失败，尝试安装 CPU 版本..."
    pip install -q rembg
fi
echo "[✓] Rembg 安装完成"

echo ""
echo "[5/5] 启动 API 服务器..."
echo ""
echo "========================================"
echo " 服务器启动成功！"
echo " 地址：http://localhost:7000"
echo " API: http://localhost:7000/api/remove"
echo "========================================"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

rembg s --host 0.0.0.0 --port 7000
