@echo off
REM 端到端测试脚本 (Windows)
REM 测试用户端 -> 后端 -> 员工端 的完整流程

setlocal enabledelayedexpansion

set API_URL=http://localhost:3001
echo === 端到端测试 ===
echo API URL: %API_URL%
echo.

REM 1. 健康检查
echo 1. 健康检查...
curl -s %API_URL%/health
echo.
echo.

REM 2. 创建订单
echo 2. 创建订单...
curl -s -X POST %API_URL%/api/orders -H "Content-Type: application/json" -d "{\"userId\": \"507f1f77bcf86cd799439011\", \"items\": [{\"quantity\": 1, \"unitPrice\": 299}], \"totalPrice\": 299}"
echo.
echo.

REM 3. 获取订单列表
echo 3. 获取订单列表...
curl -s %API_URL%/api/orders
echo.
echo.

REM 4. 测试 Dashboard
echo 4. 测试 Dashboard...
curl -s %API_URL%/api/dashboard/stats
echo.
echo.

REM 5. 测试设备和材料
echo 5. 测试设备 API...
curl -s %API_URL%/api/devices
echo.
echo.

echo 6. 测试材料 API...
curl -s %API_URL%/api/materials
echo.
echo.

echo ===================================
echo 端到端测试完成！
echo ===================================

endlocal