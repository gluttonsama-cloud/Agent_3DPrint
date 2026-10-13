$ErrorActionPreference = 'Stop'
$composeFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'deploy/docker-compose.yml'
docker compose -f $composeFile up -d --build
exit $LASTEXITCODE
