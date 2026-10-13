@echo off
echo ========================================
echo  Rembg 多模型背景抠图服务 - 快速部署
echo  支持：通用/人像/衣物/3D 物体
echo ========================================
echo.

REM 默认模型
set MODEL=%1
if "%MODEL%"=="" set MODEL=u2net_human_seg

set PORT=%2
if "%PORT%"=="" set PORT=7000

echo 正在部署...
echo   模型：%MODEL%
echo   端口：%PORT%
echo.

echo [1/5] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python
    pause
    exit /b 1
)

echo [2/5] 创建虚拟环境...
if not exist "venv" (
    python -m venv venv
    echo [完成] 虚拟环境已创建
) else (
    echo [完成] 虚拟环境已存在
)

echo [3/5] 安装 Rembg...
call venv\Scripts\activate.bat
pip install rembg[gpu] --quiet

echo [4/5] 下载模型：%MODEL%...
REM 预下载模型
python -c "from rembg import new_session; new_session('%MODEL%')" 2>nul

echo [5/5] 启动 API 服务器...
echo.
echo ========================================
echo   服务器启动成功！
echo   地址：http://localhost:%PORT%
echo   模型：%MODEL%
echo ========================================
echo.
echo 可用模型:
echo   - u2net              ^(通用，平衡^)
echo   - u2netp             ^(更快，质量略低^)
echo   - u2net_human_seg    ^(^^^* 人像专用^)
echo   - u2net_cloth_seg    ^(衣物专用^)
echo   - silueta            ^(3D 物体^)
echo   - isnet-general-use  ^(高精度^)
echo   - isnet-anime        ^(动漫^)
echo.
echo 切换模型:
echo   deploy.bat ^<model-name^> ^<port^>
echo   例：deploy.bat u2net 7000
echo.
echo 按 Ctrl+C 停止服务
echo.

rembg s --model %MODEL% --host 0.0.0.0 --port %PORT%
