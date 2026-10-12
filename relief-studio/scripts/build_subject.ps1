param(
  [string]$OutputDirectory = 'artifacts/gpu-dist',
  [string]$ModelDirectory = 'model-runtime'
)
$ErrorActionPreference = 'Stop'
# 在已按 gpu-runtime.txt 安装的隔离环境中构建，源码和权重来源见验证记录。
& .gpu-venv/Scripts/python -m PyInstaller --noconfirm --clean --onedir --name subject-engine --distpath $OutputDirectory --workpath build/gpu --collect-all sam2 --collect-submodules hydra --collect-submodules iopath --collect-all timm --collect-all transformers --collect-all kornia --collect-all einops engine/gpu_main.py
if ($LASTEXITCODE -ne 0) { throw '模型运行时构建失败' }
$runtime = Join-Path $OutputDirectory 'subject-engine'
Copy-Item -LiteralPath (Join-Path $ModelDirectory 'sam2.1_hiera_tiny.pt') -Destination $runtime
$foreground = Join-Path $runtime 'birefnet-hr'
New-Item -ItemType Directory -Force $foreground | Out-Null
Copy-Item -LiteralPath (Join-Path $ModelDirectory 'birefnet-hr/model.safetensors'),(Join-Path $ModelDirectory 'birefnet-hr/config.json') -Destination $foreground
Copy-Item -LiteralPath engine/vendor/birefnet/LICENSE,engine/vendor/birefnet/SOURCE.md -Destination $foreground
$env:RELIEF_LICENSE_DESTINATION = Join-Path $runtime 'licenses'
@'
import importlib.metadata as metadata
import shutil
import sys
from pathlib import Path
destination = Path(__import__('os').environ['RELIEF_LICENSE_DESTINATION'])
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
Remove-Item Env:RELIEF_LICENSE_DESTINATION
$packageVersion = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
if (!$packageVersion) { throw '无法读取应用版本' }
[IO.File]::WriteAllText((Join-Path $runtime 'relief-runtime-version.txt'), $packageVersion, [Text.UTF8Encoding]::new($false))
Write-Output '运行时已构建；归档时将 subject-engine 目录命名为 model-runtime，再生成完整安装清单。用户安装由完整安装程序完成。'
