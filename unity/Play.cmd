@echo off
if not exist "%~dp0Builds\Windows\Dashing.exe" (
  echo Build the Windows player first. See README.md.
  pause
  exit /b 1
)
start "Dashing" "%~dp0Builds\Windows\Dashing.exe"
