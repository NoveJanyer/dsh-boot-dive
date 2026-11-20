@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\uninstall-desktop.ps1" %*
echo.
pause
