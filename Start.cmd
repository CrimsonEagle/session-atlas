@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 oder neuer wird benoetigt.
  pause
  exit /b 1
)
node launcher.mjs
if errorlevel 1 pause
