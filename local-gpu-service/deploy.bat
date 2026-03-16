@echo off
echo ========================================
echo  Rembg 本地 GPU 背景抠图服务 - 快速部署
echo ========================================
echo.

echo [1/5] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.8+
    echo 下载地址：https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [✓] Python 环境正常

echo.
echo [2/5] 创建虚拟环境...
if not exist "venv" (
    python -m venv venv
    echo [✓] 虚拟环境已创建
) else (
    echo [✓] 虚拟环境已存在
)

echo.
echo [3/5] 激活虚拟环境...
call venv\Scripts\activate.bat

echo.
echo [4/5] 安装 Rembg (GPU 版本)...
echo 这可能需要几分钟...
pip install rembg[gpu] --quiet
if errorlevel 1 (
    echo [警告] GPU 版本安装失败，尝试安装 CPU 版本...
    pip install rembg --quiet
)
echo [✓] Rembg 安装完成

echo.
echo [5/5] 启动 API 服务器...
echo.
echo ========================================
echo  服务器启动成功！
echo  地址：http://localhost:7000
echo  API: http://localhost:7000/api/remove
echo ========================================
echo.
echo 按 Ctrl+C 停止服务
echo.

rembg s --host 0.0.0.0 --port 7000
