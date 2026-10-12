function Convert-NvidiaDriverVersion([string]$Value) {
  # Windows 的四段版本映射到 NVIDIA 的发布版本。
  $parts = $Value.Split('.')
  if ($parts.Count -eq 4) {
    $major = ([int]$parts[2] % 10) * 100 + [math]::Floor([int]$parts[3] / 100)
    return [version]::new([int]$major, [int]$parts[3] % 100)
  }
  return [version]$Value
}

function Get-ReliefGpuStatus {
  param([object[]]$Controllers = $null)
  if ($null -eq $Controllers) { $Controllers = @(Get-CimInstance Win32_VideoController -OperationTimeoutSec 20) }
  $devices = @($Controllers | Where-Object { $_.PNPDeviceID -match 'VEN_10DE' })
  $ready = @($devices | Where-Object {
    $_.ConfigManagerErrorCode -eq 0 -and
    (Convert-NvidiaDriverVersion $_.DriverVersion) -ge [version]'570.65'
  })
  return [pscustomobject]@{ HasNvidia = $devices.Count -gt 0; DriverReady = $ready.Count -gt 0;
    Devices = @($devices | Select-Object Name, DriverVersion, ConfigManagerErrorCode) }
}

function Install-ReliefNvidiaDriver {
  # 仅使用系统匹配本机硬件的签名显示驱动，不处理其他系统更新。
  $session = New-Object -ComObject Microsoft.Update.Session
  $session.ClientApplicationID = 'Relief Studio GPU Setup'
  $found = $session.CreateUpdateSearcher().Search("IsInstalled=0 and Type='Driver'")
  $candidates = @($found.Updates | Where-Object {
    $_.DriverManufacturer -match 'NVIDIA' -and $_.DriverClass -eq 'Display' -and
    $_.Title -match '\b\d+\.\d+\.\d+\.\d+\b' -and
    (Convert-NvidiaDriverVersion ([regex]::Match($_.Title, '\b\d+\.\d+\.\d+\.\d+\b').Value)) -ge [version]'570.65'
  } | Sort-Object DriverVerDate -Descending)
  if (!$candidates.Count) { throw 'Windows Update 未提供兼容的 NVIDIA 显示驱动。请从 NVIDIA 官方网站安装适合本机的驱动后重试。' }
  $updates = New-Object -ComObject Microsoft.Update.UpdateColl
  $selected = $candidates[0]
  if (!$selected.EulaAccepted) { $selected.AcceptEula() }
  [void]$updates.Add($selected)
  $downloader = $session.CreateUpdateDownloader()
  $downloader.Updates = $updates
  if ($downloader.Download().ResultCode -ne 2) { throw '显卡驱动下载未完成，请检查网络后重试。' }
  $installer = $session.CreateUpdateInstaller()
  $installer.Updates = $updates
  $result = $installer.Install()
  if ($result.ResultCode -ne 2) { throw '显卡驱动安装未完成，请使用 NVIDIA 官方驱动安装程序。' }
  return $result.RebootRequired
}

function Get-ReliefChildPath([string]$Root, [string]$Name) {
  $absoluteRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $target = [IO.Path]::GetFullPath((Join-Path $absoluteRoot $Name))
  if (!$target.StartsWith($absoluteRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw '安装路径越出目标目录。'
  }
  return $target
}

function Test-ReliefRuntime([string]$Directory, $Manifest) {
  if (!$Manifest.files -or !$Manifest.files.Count) { return $false }
  if (!(Test-Path -LiteralPath (Join-Path $Directory 'relief-runtime-version.txt'))) { return $false }
  if ((Get-Content -LiteralPath (Join-Path $Directory 'relief-runtime-version.txt') -Raw).Trim() -ne $Manifest.version) { return $false }
  foreach ($file in $Manifest.files) {
    $target = Get-ReliefChildPath $Directory $file.path
    if (!(Test-Path -LiteralPath $target) -or (Get-Item -LiteralPath $target).Length -ne [long]$file.bytes -or
        (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.sha256) { return $false }
  }
  return $true
}

function Publish-ReliefRuntime([string]$Root, [string]$Runtime) {
  $absoluteRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  if (![IO.Path]::GetFullPath($Runtime).StartsWith($absoluteRoot, [StringComparison]::OrdinalIgnoreCase)) { throw '运行时发布源路径越界。' }
  $destination = Get-ReliefChildPath $Root 'model-runtime'
  $backup = Get-ReliefChildPath $Root ('model-runtime-backup-' + [guid]::NewGuid().ToString('N'))
  if (Test-Path -LiteralPath $destination) { Move-Item -LiteralPath $destination -Destination $backup }
  try { Move-Item -LiteralPath $Runtime -Destination $destination }
  catch {
    if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $destination }
    throw
  }
  if (Test-Path -LiteralPath $backup) {
    try { Remove-Item -LiteralPath $backup -Recurse -Force }
    catch { Write-Warning ('新运行时已安装，旧运行时缓存暂时无法清理：' + $backup) }
  }
}
