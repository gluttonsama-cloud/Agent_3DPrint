@echo off
echo ========================================
echo  启动 Cloudflare Tunnel
echo  将本地服务暴露到公网
echo ========================================
echo.

set TARGET_URL=%1
if "%TARGET_URL%"=="" set TARGET_URL=http://localhost:7000

echo 目标地址：%TARGET_URL%
echo.

rem 检查 cloudflared 是否安装
where cloudflared >nul 2>&1
if errorlevel 1 (
    echo [错误] cloudflared 未安装
    echo.
    echo 请先安装:
    echo   winget install cloudflare.cloudflared
    echo.
    pause
    exit /b 1
)

echo [✓] cloudflared 已安装
echo.

echo 正在启动 Tunnel...
echo 按 Ctrl+C 停止
echo.

cloudflared tunnel --url %TARGET_URL%
