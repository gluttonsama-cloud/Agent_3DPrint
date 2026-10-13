@echo off
chcp 65001 >nul
echo ============================================
echo    停止所有服务
echo ============================================
echo.

taskkill /F /IM node.exe 2>nul
if %errorlevel% == 0 (
    echo 所有 Node.js 进程已停止
) else (
    echo 没有找到运行中的 Node.js 进程
)

echo.
echo 按任意键退出...
pause >nul