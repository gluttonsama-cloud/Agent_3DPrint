#!/bin/bash
# 端到端测试脚本
# 测试用户端 -> 后端 -> 员工端 的完整流程

set -e

API_URL="${API_URL:-http://localhost:3001}"
echo "=== 端到端测试 ==="
echo "API URL: $API_URL"
echo ""

# 1. 健康检查
echo "1. 健康检查..."
HEALTH=$(curl -s "$API_URL/health")
echo "   响应: $HEALTH"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "   ✅ 后端服务正常"
else
    echo "   ❌ 后端服务异常"
    exit 1
fi
echo ""

# 2. 创建订单（用户端操作）
echo "2. 创建订单（模拟用户端）..."
ORDER_RESPONSE=$(curl -s -X POST "$API_URL/api/orders" \
  -H "Content-Type: application/json" \
  -d '{"userId": "507f1f77bcf86cd799439011", "items": [{"quantity": 1, "unitPrice": 299}], "totalPrice": 299}')
echo "   响应: $ORDER_RESPONSE"
ORDER_ID=$(echo "$ORDER_RESPONSE" | grep -o '"orderId":"[^"]*"' | cut -d'"' -f4)
if [ -n "$ORDER_ID" ]; then
    echo "   ✅ 订单创建成功: $ORDER_ID"
else
    echo "   ❌ 订单创建失败"
    exit 1
fi
echo ""

# 3. 获取订单列表（员工端操作）
echo "3. 获取订单列表（模拟员工端）..."
ORDER_LIST=$(curl -s "$API_URL/api/orders")
echo "   响应: $ORDER_LIST"
if echo "$ORDER_LIST" | grep -q "$ORDER_ID"; then
    echo "   ✅ 订单列表包含新订单"
else
    echo "   ❌ 订单列表未包含新订单"
    exit 1
fi
echo ""

# 4. 获取订单详情
echo "4. 获取订单详情..."
ORDER_DETAIL=$(curl -s "$API_URL/api/orders/$ORDER_ID")
echo "   响应: $ORDER_DETAIL"
if echo "$ORDER_DETAIL" | grep -q "pending_review"; then
    echo "   ✅ 订单状态: 待审核"
else
    echo "   ❌ 订单状态异常"
    exit 1
fi
echo ""

# 5. 更新订单状态（员工审核）
echo "5. 更新订单状态（审核通过）..."
UPDATE_RESPONSE=$(curl -s -X PATCH "$API_URL/api/orders/$ORDER_ID/status" \
  -H "Content-Type: application/json" \
  -d '{"status": "scheduled", "reason": "审核通过"}')
echo "   响应: $UPDATE_RESPONSE"
if echo "$UPDATE_RESPONSE" | grep -q "scheduled"; then
    echo "   ✅ 订单状态已更新: 已排期"
else
    echo "   ❌ 订单状态更新失败"
    exit 1
fi
echo ""

# 6. 验证 Dashboard 统计
echo "6. 验证 Dashboard 统计..."
DASHBOARD=$(curl -s "$API_URL/api/dashboard/stats")
echo "   响应: $DASHBOARD"
if echo "$DASHBOARD" | grep -q '"totalOrders"'; then
    echo "   ✅ Dashboard 统计正常"
else
    echo "   ❌ Dashboard 统计异常"
    exit 1
fi
echo ""

# 7. 测试设备和材料 API
echo "7. 测试设备和材料 API..."
DEVICES=$(curl -s "$API_URL/api/devices")
MATERIALS=$(curl -s "$API_URL/api/materials")
echo "   设备: $DEVICES"
echo "   材料: $MATERIALS"
if echo "$DEVICES" | grep -q '"success":true' && echo "$MATERIALS" | grep -q '"success":true'; then
    echo "   ✅ 设备和材料 API 正常"
else
    echo "   ❌ 设备或材料 API 异常"
    exit 1
fi
echo ""

echo "==================================="
echo "✅ 端到端测试全部通过！"
echo "==================================="
echo ""
echo "用户端可以:"
echo "  - 提交订单 → POST /api/orders"
echo "  - 查看订单状态 → GET /api/orders/:id"
echo ""
echo "员工端可以:"
echo "  - 查看订单列表 → GET /api/orders"
echo "  - 审核订单 → PATCH /api/orders/:id/status"
echo "  - 查看统计 → GET /api/dashboard/stats"
echo ""
echo "订单 ID: $ORDER_ID"