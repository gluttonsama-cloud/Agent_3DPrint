@echo off
chcp 65001 >nul
title 3D头部建模系统 - 一键启动

echo ============================================
echo    3D头部建模系统 - 一键启动
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] 启动后端 API 服务 (端口 3001)...
start "Backend-API" cmd /k "cd /d "%~dp0backend" && npm run dev"
ping 127.0.0.1 -n 4 >nul

echo [2/3] 启动用户端 (端口 3000)...
start "User-App" cmd /k "cd /d "%~dp0ai-3d-head-modeler (1)" && npm run dev"
ping 127.0.0.1 -n 4 >nul

echo [3/3] 启动管理端 (端口 3002)...
start "Admin-Web" cmd /k "cd /d "%~dp0admin-web" && npm run dev"
ping 127.0.0.1 -n 4 >nul

echo.
echo ============================================
echo    启动完成！
echo ============================================
echo.
echo    后端 API:    http://localhost:3001
echo    用户端:      http://localhost:3000
echo    管理端:      http://localhost:3002
echo.
echo    演示模式已启用，无需配置 API 密钥
echo ============================================
echo.

start http://localhost:3000