@echo off
echo ======================================
echo  3D 打印多 Agent 系统 - 一键启动脚本
echo ======================================
echo.

REM 检查 Node.js
echo [1/5] 检查 Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装或未添加到 PATH
    echo 请安装 Node.js 18+ : https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 已安装

REM 启动 MongoDB
echo.
echo [2/5] 启动 MongoDB...
start "MongoDB" mongod --dbpath "C:\data\db" --logpath "C:\data\db\mongod.log" --logappend
timeout /t 3 /nobreak >nul
echo ✅ MongoDB 启动命令已发送（请检查是否有错误）

REM 启动 Redis
echo.
echo [3/5] 启动 Redis...
start "Redis" redis-server --bind 127.0.0.1 --port 6379
timeout /t 2 /nobreak >nul
echo ✅ Redis 启动命令已发送

REM 启动后端
echo.
echo [4/5] 启动后端服务...
echo 后端将在 http://localhost:3001 启动
start "Backend API" cmd /k "cd /d %~dp0backend && npm run dev"
timeout /t 5 /nobreak >nul

REM 启动前端
echo.
echo [5/5] 启动前端服务...
echo 前端将在 http://localhost:5173 启动
start "Frontend" cmd /k "cd /d %~dp0admin-web && npm run dev"

echo.
echo ======================================
echo  ✅ 所有服务启动完成！
echo ======================================
echo.
echo 后端：http://localhost:3001
echo 前端：http://localhost:5173
echo 健康检查：http://localhost:3001/health
echo.
echo 按任意键打开浏览器...
pause >nul
start http://localhost:5173
