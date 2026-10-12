param(
  [Parameter(Mandatory=$true)][string]$InstallDirectory,
  [string]$AssetDirectory = '',
  [string]$RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'ReliefStudio'),
  [switch]$NonInteractive,
  [switch]$InstallGpu,
  [switch]$DriverOnly
)
$ErrorActionPreference = 'Stop'
$staging = $null
. (Join-Path $PSScriptRoot 'GpuSetup.Core.ps1')

function Ask([string]$Text) {
  Add-Type -AssemblyName System.Windows.Forms
  return [Windows.Forms.MessageBox]::Show($Text, 'Relief Studio 安装', 'YesNo', 'Question') -eq 'Yes'
}
function Inform([string]$Text) {
  if (!$NonInteractive) {
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($Text, 'Relief Studio 安装', 'OK', 'Information')
  }
  Write-Output $Text
}

try {
  if ($DriverOnly) {
    if (Install-ReliefNvidiaDriver) { exit 3 }
    if (!(Get-ReliefGpuStatus).DriverReady) { throw '更新后驱动仍未满足要求。' }
    exit 0
  }
  if ($NonInteractive -and !$InstallGpu) { exit 0 }
  $status = Get-ReliefGpuStatus
  $driverApproved = $false
  if (!$status.HasNvidia) {
    Inform '未检测到 NVIDIA 显卡，软件已安装，可使用手工编辑和导出。自动主体识别暂不可用。'
    if ($NonInteractive -and $InstallGpu) { exit 1 }
    exit 0
  }
  if (!$status.DriverReady) {
    if ($NonInteractive) { throw '驱动不兼容；无人值守安装不会擅自修改显卡驱动。' }
    if (!(Ask '显卡驱动缺失或不兼容。是否自动安装适合本机的 NVIDIA 驱动及 AI 模型？将通过 Windows Update 安装驱动并下载约 2.86 GB 的模型配套。选择“否”可继续手工编辑。')) { exit 0 }
    $driverApproved = $true
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'),
      '-InstallDirectory', ('"' + $InstallDirectory + '"'), '-DriverOnly', '-NonInteractive')
    $process = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -eq 3) { Inform '驱动已安装，需要重启电脑。重启后再次运行安装程序，即可安装模型。'; exit 3 }
    if ($process.ExitCode -ne 0) { throw '自动驱动安装失败；软件可继续手工编辑。请安装 NVIDIA 官方驱动后重试。' }
  }
  if (!$NonInteractive -and !$driverApproved -and !(Ask '是否启用 AI 主体识别？安装程序会自动下载并校验模型与运行时，下载量约 2.86 GB。选择“否”可稍后再运行安装程序添加。')) { exit 0 }
  $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'gpu-manifest.json') -Raw | ConvertFrom-Json
  $destination = Get-ReliefChildPath $RuntimeRoot 'model-runtime'
  if (Test-ReliefRuntime $destination $manifest) {
    $diagnostic = & (Join-Path $destination 'subject-engine.exe') --diagnose
    if ($LASTEXITCODE -eq 0 -and ($diagnostic | ConvertFrom-Json).cudaAvailable) { Inform '当前版本 GPU 模型已安装且运行检查通过。'; exit 0 }
  }
  $allLocal = $AssetDirectory -and @($manifest.parts | Where-Object { !(Test-Path -LiteralPath (Get-ReliefChildPath $AssetDirectory $_.name)) }).Count -eq 0
  $required = [long]$manifest.unpackedBytes + 1GB
  if (!$allLocal) { $required += [long]$manifest.archiveBytes }
  $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($RuntimeRoot)))
  if ($drive.AvailableFreeSpace -lt $required) { throw ('可用磁盘空间不足，至少需要 {0:N1} GB。' -f ($required / 1GB)) }
  $staging = Get-ReliefChildPath $RuntimeRoot ('gpu-install-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $staging | Out-Null
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  foreach ($part in $manifest.parts) {
    if ([IO.Path]::GetFileName($part.name) -ne $part.name) { throw '模型分卷名称无效。' }
    $target = Get-ReliefChildPath $staging $part.name
    $local = if ($AssetDirectory) { Get-ReliefChildPath $AssetDirectory $part.name } else { '' }
    if ($allLocal) { $target = $local }
    elseif ($local -and (Test-Path -LiteralPath $local)) { Copy-Item -LiteralPath $local -Destination $target }
    else {
      Write-Output ('下载模型：' + $part.name)
      $url = 'https://github.com/gluttonsama-cloud/Agent_3DPrint/releases/download/' + $manifest.tag + '/' + $part.name
      (New-Object Net.WebClient).DownloadFile($url, $target)
    }
    if ((Get-Item -LiteralPath $target).Length -ne [long]$part.bytes -or
        (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $part.sha256) { throw '模型下载校验失败，请重新运行安装程序。' }
  }
  $unpack = Get-ReliefChildPath $staging 'unpacked'
  $archiveRoot = if ($allLocal) { $AssetDirectory } else { $staging }
  & (Join-Path $PSScriptRoot '7za.exe') x (Join-Path $archiveRoot $manifest.parts[0].name) ('-o' + $unpack) -y
  if ($LASTEXITCODE -ne 0) { throw '模型解压失败。' }
  $runtime = Get-ReliefChildPath $unpack 'model-runtime'
  $engine = Join-Path $runtime 'subject-engine.exe'
  $diagnostic = & $engine --diagnose
  if ($LASTEXITCODE -ne 0 -or !(($diagnostic | ConvertFrom-Json).cudaAvailable)) { throw 'GPU 运行时检测未通过，请检查驱动或重启电脑后重试。' }
  if (!(Test-ReliefRuntime $runtime $manifest)) { throw '解压后的运行时文件检查未通过。' }
  Publish-ReliefRuntime $RuntimeRoot $runtime
  # 只删除本次创建且校验为安装目录子路径的临时目录。
  $verifiedStaging = Get-ReliefChildPath $RuntimeRoot ([IO.Path]::GetFileName($staging))
  Remove-Item -LiteralPath $verifiedStaging -Recurse -Force
  Inform '模型与 GPU 运行时已安装并通过 CUDA 检查，可以使用主体提取和点击补选。'
} catch {
  if ($staging -and (Test-Path -LiteralPath $staging)) {
    $verifiedStaging = Get-ReliefChildPath $RuntimeRoot ([IO.Path]::GetFileName($staging))
    Remove-Item -LiteralPath $verifiedStaging -Recurse -Force
  }
  Inform ('GPU 配套安装未完成：' + $_.Exception.Message + "`n手工编辑和导出仍可使用。")
  exit 1
}
