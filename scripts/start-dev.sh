#!/bin/bash

echo "============================================"
echo "3D 打印多 Agent 系统 - 快速启动脚本 (WSL)"
echo "============================================"
echo ""

# 检查 Docker 是否运行
if ! docker ps &> /dev/null; then
    echo "[错误] Docker 未运行或未安装！"
    echo ""
    echo "请先启动 Docker Desktop"
    exit 1
fi

echo "[✓] Docker 运行正常"
echo ""

# 检查 docker-compose.yml 是否存在
if [ ! -f "docker-compose.yml" ]; then
    echo "[错误] docker-compose.yml 文件不存在！"
    exit 1
fi

echo "正在启动数据库服务..."
echo ""

# 启动 Docker 服务
docker-compose up -d

if [ $? -ne 0 ]; then
    echo ""
    echo "[错误] 服务启动失败！"
    echo ""
    echo "查看日志：docker-compose logs"
    exit 1
fi

echo ""
echo "等待服务初始化..."
sleep 5

echo ""
echo "============================================"
echo "服务状态检查"
echo "============================================"
echo ""

# 检查 MongoDB
echo "检查 MongoDB..."
if docker exec mongodb-3dprint mongosh --eval "db.adminCommand('ping')" &> /dev/null; then
    echo "[✓] MongoDB 运行正常"
else
    echo "[⚠] MongoDB 仍在启动中，请稍后重试"
fi

# 检查 Redis
echo "检查 Redis..."
if docker exec redis-3dprint redis-cli ping &> /dev/null; then
    echo "[✓] Redis 运行正常"
else
    echo "[⚠] Redis 仍在启动中，请稍后重试"
fi

echo ""
echo "============================================"
echo "连接信息"
echo "============================================"
echo ""
echo "MongoDB: mongodb://localhost:27017/3dprint-demo"
echo "Redis:   redis://localhost:6379"
echo ""
echo "查看详细日志：docker-compose logs -f"
echo "停止服务：docker-compose down"
echo ""
echo "============================================"
echo ""
