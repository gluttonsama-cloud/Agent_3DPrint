@echo off
chcp 65001 >nul
echo Starting Rembg API Server...
start "Rembg API" cmd /k "rembg s --port 7000 --host 0.0.0.0"
timeout /t 3 /nobreak >nul

echo Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:7000"
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   All services started!
echo ========================================
echo.
echo   Local: http://localhost:7000
echo   Public: Check Cloudflare Tunnel window
echo.
start http://localhost:7000
pause
