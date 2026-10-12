$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixture = Join-Path $root ('artifacts/installer-modes-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$template = @'
function global:Get-CimInstance {
  param([string]$ClassName, [int]$OperationTimeoutSec)
  return [pscustomobject]@{ PNPDeviceID='__DEVICE__'; ConfigManagerErrorCode=0; DriverVersion='31.0.15.5123' }
}
& '__SCRIPT__' -InstallDirectory '__DIRECTORY__' -NonInteractive __REQUEST__
exit $LASTEXITCODE
'@
try {
  foreach ($case in @(
    @{name='manual'; device='VEN_1002'; request=''; expected=0},
    @{name='missing-nvidia'; device='VEN_1002'; request='-InstallGpu'; expected=1},
    @{name='old-driver'; device='VEN_10DE'; request='-InstallGpu'; expected=1}
  )) {
    # 只替换硬件查询；真实安装脚本决定模式和退出码，不调用驱动更新。
    $harness = Join-Path $fixture ($case.name + '.ps1')
    $script = $template.Replace('__DEVICE__', $case.device).Replace('__REQUEST__', $case.request).
      Replace('__SCRIPT__', (Join-Path $root 'installer/Install-Gpu.ps1').Replace("'", "''")).
      Replace('__DIRECTORY__', $fixture.Replace("'", "''"))
    [IO.File]::WriteAllText($harness, $script, [Text.UTF8Encoding]::new($true))
    & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $harness | Out-Null
    if ($LASTEXITCODE -ne $case.expected) { throw ($case.name + ': unexpected exit ' + $LASTEXITCODE) }
    Write-Output ('PASS: ' + $case.name)
  }
} finally {
  if (!$fixture.StartsWith((Join-Path $root 'artifacts').TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Test cleanup path escaped' }
  Remove-Item -LiteralPath $fixture -Recurse -Force
}
