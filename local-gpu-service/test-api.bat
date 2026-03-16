@echo off
echo ========================================
echo  测试 Rembg 本地 GPU 背景抠图服务
echo ========================================
echo.

set API_URL=%1
if "%API_URL%"=="" set API_URL=http://localhost:7000

echo API 地址：%API_URL%
echo.

echo [测试 1] 健康检查...
curl -s "%API_URL%/health"
if errorlevel 1 (
    echo [失败] 健康检查失败
    exit /b 1
)
echo.

echo [测试 2] 抠图测试...
if exist "test.jpg" (
    curl -X POST "%API_URL%/api/remove" -F "image=@test.jpg" -o "output.png"
    if exist "output.png" (
        echo [成功] 抠图成功
        echo 输出文件：output.png
        start output.png
    ) else (
        echo [失败] 抠图失败
    )
) else (
    echo [跳过] 未找到 test.jpg
    echo 提示：放置一张 test.jpg 到当前目录进行测试
)
echo.

echo ========================================
echo  测试完成
echo ========================================
