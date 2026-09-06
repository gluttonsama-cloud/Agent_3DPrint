$ErrorActionPreference = 'Stop'
# 在已按 gpu-runtime.txt 安装的隔离环境中构建，源码和权重来源见验证记录。
& .gpu-venv/Scripts/python -m PyInstaller --noconfirm --onedir --name subject-engine --distpath artifacts/gpu-dist --workpath build/gpu --collect-all sam2 --collect-submodules hydra --collect-submodules iopath engine/subject_worker.py
if ($LASTEXITCODE -ne 0) { throw '模型运行时构建失败' }
Copy-Item -LiteralPath artifacts/sam2.1_hiera_tiny.pt -Destination artifacts/gpu-dist/subject-engine/sam2.1_hiera_tiny.pt
Write-Output '分发整个 subject-engine 目录，重命名为 model-runtime，放在 Relief Studio.exe 同目录。'
