@echo off
REM ============================================
REM 3D 打印多 Agent 系统 - Windows 部署脚本
REM ============================================

setlocal enabledelayedexpansion

REM 检查 Docker 是否安装
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker 未安装，请先安装 Docker Desktop
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose 未安装
    exit /b 1
)

echo [INFO] Docker 环境检查通过

REM 检查环境变量文件
if not exist .env (
    echo [WARN] .env 文件不存在，从模板创建...
    copy .env.example .env >nul
    echo [INFO] 已创建 .env 文件，请编辑填写正确的配置
    exit /b 1
)

REM 解析命令
if "%1"=="" goto deploy
if "%1"=="build" goto build
if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="logs" goto logs
if "%1"=="clean" goto clean
if "%1"=="help" goto help
goto deploy

:build
echo [INFO] 构建 Docker 镜像...
docker-compose build --no-cache
echo [INFO] 镜像构建完成
goto end

:start
echo [INFO] 启动服务...
docker-compose up -d
echo [INFO] 等待服务就绪...
timeout /t 10 /nobreak >nul
docker-compose ps
goto end

:stop
echo [INFO] 停止服务...
docker-compose down
echo [INFO] 服务已停止
goto end

:logs
docker-compose logs -f
goto end

:clean
echo [WARN] 这将删除所有数据，确定吗？
set /p confirm="输入 yes 确认: "
if "!confirm!"=="yes" (
    docker-compose down -v
    echo [INFO] 数据已清理
) else (
    echo [INFO] 操作已取消
)
goto end

:help
echo 用法: deploy.bat [命令]
echo.
echo 命令列表:
echo   build     构建 Docker 镜像
echo   start     启动所有服务
echo   stop      停止所有服务
echo   logs      查看服务日志
echo   clean     清理所有数据
echo   help      显示此帮助信息
goto end

:deploy
echo [INFO] 执行完整部署流程...
echo [INFO] 构建 Docker 镜像...
docker-compose build --no-cache

echo [INFO] 启动服务...
docker-compose up -d

echo [INFO] 等待服务就绪...
timeout /t 15 /nobreak >nul

echo [INFO] 服务状态:
docker-compose ps

echo.
echo [INFO] 部署完成！
echo [INFO] 后端 API: http://localhost:3001
echo [INFO] 管理端: http://localhost:3000
echo [INFO] 健康检查: http://localhost:3001/health
goto end

:end
endlocal