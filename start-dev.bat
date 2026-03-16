@echo off
chcp 65001 >nul
echo ============================================
echo 3D 打印多 Agent 系统 - 快速启动脚本
echo ============================================
echo.

REM 检查 Docker 是否运行
docker ps >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker 未运行或未安装！
    echo.
    echo 请先安装 Docker Desktop:
    echo https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe
    echo.
    pause
    exit /b 1
)

echo [✓] Docker 运行正常
echo.

REM 检查 docker-compose.yml 是否存在
if not exist docker-compose.yml (
    echo [错误] docker-compose.yml 文件不存在！
    echo.
    pause
    exit /b 1
)

echo 正在启动数据库服务...
echo.

REM 启动 Docker 服务
docker-compose up -d

if errorlevel 1 (
    echo.
    echo [错误] 服务启动失败！
    echo.
    echo 查看日志：
    echo   docker-compose logs
    echo.
    pause
    exit /b 1
)

echo.
echo 等待服务初始化...
timeout /t 5 /nobreak >nul

echo.
echo ============================================
echo 服务状态检查
echo ============================================
echo.

REM 检查 MongoDB
echo 检查 MongoDB...
docker exec mongodb-3dprint mongosh --eval "db.adminCommand('ping')" >nul 2>&1
if errorlevel 1 (
    echo [⚠] MongoDB 仍在启动中，请稍后重试
) else (
    echo [✓] MongoDB 运行正常
)

REM 检查 Redis
echo 检查 Redis...
docker exec redis-3dprint redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo [⚠] Redis 仍在启动中，请稍后重试
) else (
    echo [✓] Redis 运行正常
)

echo.
echo ============================================
echo 连接信息
echo ============================================
echo.
echo MongoDB: mongodb://localhost:27017/3dprint-demo
echo Redis:   redis://localhost:6379
echo.
echo 查看详细日志：docker-compose logs -f
echo 停止服务：docker-compose down
echo.
echo ============================================
echo.

pause
