#!/bin/bash

echo "======================================"
echo " 3D 打印多 Agent 系统 - 完整测试脚本"
echo "======================================"
echo ""

# 测试 1：检查后端服务
echo "📋 测试 1: 检查后端服务状态..."
curl -s http://localhost:3001/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ 后端服务运行正常"
    curl -s http://localhost:3001/health | head -1
else
    echo "❌ 后端服务未响应"
    echo "💡 提示：请先运行 'npm run dev' 启动后端服务"
fi
echo ""

# 测试 2：测试七牛云 AI 连接
echo "📋 测试 2: 测试七牛云 AI 连接..."
npm run test:qiniu
echo ""

# 测试 3：测试 Agent 决策 API
echo "📋 测试 3: 测试 Agent 决策 API..."
curl -X POST http://localhost:3001/api/agent-decisions/decide \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "coordinator",
    "action": "review_order",
    "data": {
      "orderId": "TEST_'$(date +%s)'",
      "context": {
        "priority": "normal"
      }
    }
  }' 2>&1 | head -20
echo ""

# 测试 4：检查 Socket.IO
echo "📋 测试 4: 检查 Socket.IO..."
curl -s http://localhost:3001/socket.io/?EIO=4\&transport=polling > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Socket.IO 服务正常"
else
    echo "⚠️  Socket.IO 可能未正确配置"
fi
echo ""

echo "======================================"
echo "  测试完成"
echo "======================================"
