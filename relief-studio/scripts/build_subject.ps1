$ErrorActionPreference = 'Stop'
# 在已按 gpu-runtime.txt 安装的隔离环境中构建，源码和权重来源见验证记录。
& .gpu-venv/Scripts/python -m PyInstaller --noconfirm --onedir --name subject-engine --distpath artifacts/gpu-dist --workpath build/gpu --collect-all sam2 --collect-submodules hydra --collect-submodules iopath --collect-all timm --collect-all transformers --collect-all kornia --collect-all einops engine/subject_worker.py
if ($LASTEXITCODE -ne 0) { throw '模型运行时构建失败' }
Copy-Item -LiteralPath artifacts/sam2.1_hiera_tiny.pt -Destination artifacts/gpu-dist/subject-engine/sam2.1_hiera_tiny.pt
New-Item -ItemType Directory -Force artifacts/gpu-dist/subject-engine/birefnet-hr | Out-Null
Copy-Item -LiteralPath artifacts/birefnet-hr/model.safetensors,artifacts/birefnet-hr/config.json -Destination artifacts/gpu-dist/subject-engine/birefnet-hr
Copy-Item -LiteralPath engine/vendor/birefnet/LICENSE,engine/vendor/birefnet/SOURCE.md -Destination artifacts/gpu-dist/subject-engine/birefnet-hr
@'
import importlib.metadata as metadata
import shutil
import sys
from pathlib import Path
destination = Path('artifacts/gpu-dist/subject-engine/licenses')
destination.mkdir(exist_ok=True)
shutil.copyfile(Path(sys.base_prefix)/'LICENSE.txt', destination/'Python-LICENSE.txt')
for distribution in metadata.distributions():
  for index, item in enumerate(distribution.files or []):
    if any(word in str(item).lower() for word in ['license', 'copying', 'copyright', 'notice']):
      source = Path(distribution.locate_file(item))
      if source.is_file():
        shutil.copyfile(source, destination/f'{distribution.metadata["Name"]}-{index}-{source.name}')
'@ | & .gpu-venv/Scripts/python -
if ($LASTEXITCODE -ne 0) { throw '模型许可收集失败' }
Write-Output '分发整个 subject-engine 目录，重命名为 model-runtime，放在 Relief Studio.exe 同目录。'
