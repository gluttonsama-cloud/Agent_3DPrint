@echo off
echo ========================================
echo  一键启动：本地 GPU 背景抠图服务
echo  模型：u2net_human_seg (人像专用)
echo  内网穿透：Cloudflare Tunnel
echo ========================================
echo.

echo [1/3] 启动 Rembg API 服务器...
start "Rembg API Server" cmd /k "cd /d %~dp0 && rembg s --port 7000 --host 0.0.0.0"
echo [✓] Rembg 服务已启动 (端口 7000)
timeout /t 3 /nobreak >nul

echo.
echo [2/3] 启动 Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cd /d %~dp0 && cloudflared tunnel --url http://localhost:7000"
echo [✓] Cloudflare Tunnel 已启动
echo.
echo [3/3] 等待服务启动...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo  ✅ 所有服务已启动！
echo ========================================
echo.
echo  本地访问：http://localhost:7000
echo  公网访问：查看 Cloudflare Tunnel 窗口的 URL
echo.
echo  模型切换：
echo    - 当前：u2net (通用)
echo    - 推荐：u2net_human_seg (人像专用)
echo    - 在 API 请求时指定：formData.append('model', 'u2net_human_seg')
echo.
echo  提示：
echo    - 不要关闭这两个窗口
echo    - 停止服务：直接关闭窗口
echo    - 下次运行：再次执行 start-all.bat
echo.
echo ========================================

REM 打开测试页面
start http://localhost:7000

echo 已打开测试页面
pause
