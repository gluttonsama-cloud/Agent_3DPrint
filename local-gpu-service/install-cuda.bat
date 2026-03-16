@echo off
chcp 65001 >nul
echo Installing CUDA support...
pip uninstall onnxruntime onnxruntime-gpu -y
pip install onnxruntime-gpu
echo Done! Restart the service.
pause
