@echo off
chcp 65001 >nul
title Compêndio Avalon - Astro
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js não foi encontrado. Instale-o em https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\astro\package.json" (
  echo Dependências não instaladas. Execute "Instalar Compêndio Avalon.bat" primeiro.
  pause
  exit /b 1
)
call npm run dev -- --open
pause
