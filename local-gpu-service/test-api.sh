#!/bin/bash

echo "========================================"
echo " 测试 Rembg 本地 GPU 背景抠图服务"
echo "========================================"
echo ""

API_URL="${1:-http://localhost:7000}"

echo "API 地址：$API_URL"
echo ""

# 测试 1：健康检查
echo "[测试 1] 健康检查..."
health=$(curl -s "$API_URL/health")
if [ $? -eq 0 ]; then
    echo "✓ 健康检查成功"
    echo "响应：$health"
else
    echo "✗ 健康检查失败"
    exit 1
fi
echo ""

# 测试 2：抠图测试（需要准备测试图片）
echo "[测试 2] 抠图测试..."
if [ -f "test.jpg" ]; then
    curl -X POST "$API_URL/api/remove" \
        -F "image=@test.jpg" \
        -o output.png
    
    if [ $? -eq 0 ] && [ -f "output.png" ]; then
        echo "✓ 抠图成功"
        echo "输出文件：output.png ($(ls -lh output.png | awk '{print $5}'))"
        
        # Mac 自动打开
        if command -v open &> /dev/null; then
            open output.png
        # Windows WSL
        elif command -v start &> /dev/null; then
            start output.png
        # Linux
        elif command -v xdg-open &> /dev/null; then
            xdg-open output.png
        fi
    else
        echo "✗ 抠图失败"
    fi
else
    echo "⚠ 未找到 test.jpg，跳过抠图测试"
    echo "提示：放置一张 test.jpg 到当前目录进行测试"
fi
echo ""

echo "========================================"
echo " 测试完成"
echo "========================================"
