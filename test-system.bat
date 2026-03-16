@echo off
echo ======================================
echo  系统测试脚本
echo ======================================
echo.

REM 测试后端健康检查
echo [1/4] 测试后端健康检查...
curl -s http://localhost:3001/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 后端服务正常
    curl -s http://localhost:3001/health
) else (
    echo ❌ 后端服务未响应
    echo 请确认后端已启动：npm run dev
)
echo.

REM 测试七牛云 AI
echo [2/4] 测试七牛云 AI 连接...
cd backend
npm run test:qiniu
cd ..
echo.

REM 测试 Socket.IO
echo [3/4] 测试 Socket.IO...
curl -s "http://localhost:3001/socket.io/?EIO=4&transport=polling" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Socket.IO 正常
) else (
    echo ⚠️  Socket.IO 可能未启动
)
echo.

REM 测试前端
echo [4/4] 检查前端配置...
if exist "admin-web\.env" (
    echo ✅ 前端配置文件存在
) else (
    echo ❌ 前端配置文件缺失
)
echo.

echo ======================================
echo  测试完成
echo ======================================
pause
