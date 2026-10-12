!macro customInstall
  ${GetParameters} $R0
  ${GetOptions} $R0 "/GPU=" $R1
  ${If} ${Silent}
    ${If} $R1 == "1"
      nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\gpu-setup\Install-Gpu.ps1" -InstallDirectory "$INSTDIR" -AssetDirectory "$EXEDIR" -NonInteractive -InstallGpu'
      Pop $R0
    ${Else}
      StrCpy $R0 "0"
    ${EndIf}
  ${Else}
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\gpu-setup\Install-Gpu.ps1" -InstallDirectory "$INSTDIR" -AssetDirectory "$EXEDIR"'
    Pop $R0
  ${EndIf}
  ${If} $R0 != "0"
    DetailPrint "GPU setup not completed; see installation guide."
    ${If} $R0 == "3"
      SetRebootFlag true
    ${EndIf}
    ${If} ${Silent}
      ${If} $R0 == "3"
        SetErrorLevel 3010
      ${Else}
        SetErrorLevel 1
      ${EndIf}
      Quit
    ${EndIf}
  ${EndIf}
!macroend
