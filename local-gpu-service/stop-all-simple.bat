@echo off
echo Stopping all services...
taskkill /FI "WINDOWTITLE eq Rembg API*" /T /F 2>nul
taskkill /FI "WINDOWTITLE eq Cloudflare*" /T /F 2>nul
echo Done!
pause
