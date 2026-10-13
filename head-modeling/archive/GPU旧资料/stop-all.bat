@echo off
echo ========================================
echo  停止所有服务
echo ========================================
echo.

echo 正在停止 Rembg API 服务器...
taskkill /FI "WINDOWTITLE eq Rembg API Server*" /T /F 2>nul
echo [✓] Rembg 服务已停止

echo.
echo 正在停止 Cloudflare Tunnel...
taskkill /FI "WINDOWTITLE eq Cloudflare Tunnel*" /T /F 2>nul
echo [✓] Cloudflare Tunnel 已停止

echo.
echo ========================================
echo  ✅ 所有服务已停止
echo ========================================
pause
