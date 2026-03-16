#!/bin/bash

# 3D Head Modeling API - 服务器部署脚本
# 使用方法：bash deploy.sh

set -e

echo "========================================="
echo "  3D Head Modeling API - 部署脚本"
echo "========================================="

# 1. 更新系统
echo "[1/6] 更新系统..."
apt update && apt upgrade -y

# 2. 安装 Node.js 18
echo "[2/6] 安装 Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 验证安装
node -v
npm -v

# 3. 安装 PM2
echo "[3/6] 安装 PM2..."
npm install -g pm2

# 4. 安装 Redis（可选）
echo "[4/6] 安装 Redis..."
apt install -y redis-server
systemctl start redis
systemctl enable redis

# 5. 安装 Nginx
echo "[5/6] 安装 Nginx..."
apt install -y nginx
systemctl start nginx
systemctl enable nginx

# 6. 配置防火墙
echo "[6/6] 配置防火墙..."
apt install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
echo "y" | ufw enable

echo ""
echo "========================================="
echo "  ✅ 服务器环境安装完成！"
echo "========================================="
echo ""
echo "下一步："
echo "1. 上传代码到 /var/www/3d-head-modeling"
echo "2. cd /var/www/3d-head-modeling"
echo "3. npm install"
echo "4. cp .env.example .env"
echo "5. 编辑 .env 填入密钥"
echo "6. pm2 start src/app.js --name 3d-api"
echo ""
