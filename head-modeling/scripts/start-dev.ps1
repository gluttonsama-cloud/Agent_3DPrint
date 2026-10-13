param(
  [ValidateSet('user', 'api', 'gpu')]
  [string]$Target = 'user'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$targetDirectories = @{
  user = 'apps/ai-3d-head-modeler'
  api = 'services/backend'
  gpu = 'services/local-gpu-service'
}
Push-Location (Join-Path $projectRoot $targetDirectories[$Target])
try {
  if ($Target -eq 'gpu') {
    rembg s --port 7000 --host 127.0.0.1
  } else {
    npm run dev
  }
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
