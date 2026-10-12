$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../installer/GpuSetup.Core.ps1')
if ((Convert-NvidiaDriverVersion '32.0.15.8180') -ne [version]'581.80') { throw 'Windows driver mapping failed' }
if ((Convert-NvidiaDriverVersion '570.65') -ne [version]'570.65') { throw 'Release driver parsing failed' }
if ((Convert-NvidiaDriverVersion '31.0.15.5123') -ge [version]'570.65') { throw 'Old driver accepted' }
$root = Join-Path $env:TEMP 'relief-installer-test'
if ((Get-ReliefChildPath $root 'model-runtime') -ne (Join-Path $root 'model-runtime')) { throw 'Child path failed' }
$escaped = $false
try { Get-ReliefChildPath $root '../outside' | Out-Null } catch { $escaped = $true }
if (!$escaped) { throw 'Traversal accepted' }
$valid = [pscustomobject]@{ Name='Test NVIDIA'; PNPDeviceID='PCI\VEN_10DE'; DriverVersion='32.0.15.9186'; ConfigManagerErrorCode=0 }
if (!(Get-ReliefGpuStatus -Controllers @($valid)).DriverReady) { throw 'Compatible GPU rejected' }
$valid.DriverVersion='31.0.15.5123'
if ((Get-ReliefGpuStatus -Controllers @($valid)).DriverReady) { throw 'Incompatible GPU accepted' }
if ((Get-ReliefGpuStatus -Controllers @([pscustomobject]@{ PNPDeviceID='PCI\VEN_8086' })).HasNvidia) { throw 'Non-NVIDIA GPU accepted' }
$fixture = Join-Path $env:TEMP ('relief-runtime-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$runtime = Get-ReliefChildPath $fixture 'model-runtime'
$incoming = Get-ReliefChildPath $fixture 'incoming'
New-Item -ItemType Directory -Path $runtime,$incoming | Out-Null
Set-Content -LiteralPath (Join-Path $runtime 'old.txt') -Value 'old'
Set-Content -LiteralPath (Join-Path $incoming 'new.txt') -Value 'new'
function Move-Item { param($LiteralPath,$Destination)
  if ($LiteralPath -eq $incoming) { throw 'Injected publish failure' }
  Microsoft.PowerShell.Management\Move-Item -LiteralPath $LiteralPath -Destination $Destination
}
try { Publish-ReliefRuntime $fixture $incoming } catch {}
if (!(Test-Path -LiteralPath (Join-Path $runtime 'old.txt'))) { throw 'Rollback failed' }
Remove-Item Function:Move-Item
Publish-ReliefRuntime $fixture $incoming
if (!(Test-Path -LiteralPath (Join-Path $runtime 'new.txt'))) { throw 'Publish failed' }
if (@(Get-ChildItem -LiteralPath $fixture -Filter 'model-runtime-backup-*').Count) { throw 'Backup not cleaned' }
Set-Content -LiteralPath (Join-Path $runtime 'relief-runtime-version.txt') -Value 'test'
$manifest = [pscustomobject]@{ version='test'; files=@([pscustomobject]@{path='missing.exe';bytes=1;sha256='none'}) }
if (Test-ReliefRuntime $runtime $manifest) { throw 'Marker accepted without files' }
if (!$fixture.StartsWith([IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\')) { throw 'Test cleanup path escaped' }
Remove-Item -LiteralPath $fixture -Recurse -Force
Write-Output 'PASS: driver versions and installation path boundaries'
