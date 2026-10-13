@echo off
REM =====================================================
REM Mock 数据库模式启动脚本 (Windows)
REM =====================================================
REM 用途：在没有真实 MongoDB/Redis 的情况下启动后端服务
REM 
REM 使用方法:
REM   1. 双击运行此脚本
REM   2. 或者在命令行执行：start-dev-mock.bat
REM =====================================================

echo ╔════════════════════════════════════════════════════════╗
echo ║  3D Head Modeling API - Mock 数据库模式                  ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM 设置环境变量
set MOCK_DB=true
set NODE_ENV=development

echo [配置] MOCK_DB=%MOCK_DB%
echo [配置] NODE_ENV=%NODE_ENV%
echo.

REM 检查是否在 backend 目录
if not exist "src\app.js" (
    echo [错误] 请在 backend 目录下运行此脚本
    echo [提示] cd backend
    pause
    exit /b 1
)

REM 检查 node_modules
if not exist "node_modules" (
    echo [警告] 未找到 node_modules，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo ════════════════════════════════════════════════════════
echo  启动 Mock 数据库模式...
echo ════════════════════════════════════════════════════════
echo.
echo [信息] Mock 模式说明:
echo   - MongoDB: 使用内存数据库（重启后数据清空）
echo   - Redis:   使用内存存储（重启后数据清空）
echo   - 适用场景：本地开发、API 测试、快速原型
echo.
echo [警告] 生产环境请勿使用 Mock 模式!
echo.
echo ════════════════════════════════════════════════════════
echo.

REM 启动服务
call npm run dev

echo.
echo ════════════════════════════════════════════════════════
echo  服务已停止
echo ════════════════════════════════════════════════════════
pause
