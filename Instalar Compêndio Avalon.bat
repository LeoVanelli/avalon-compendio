@echo off
chcp 65001 >nul
title Instalar Compêndio Avalon
cd /d "%~dp0"
echo.
echo   =========================================
echo       AVALON - INSTALACAO DO COMPENDIO
echo   =========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado neste computador.
  echo Instale a versao LTS em https://nodejs.org/
  echo Depois execute novamente este arquivo.
  pause
  exit /b 1
)
node -e "const v=process.versions.node.split('.').map(Number); process.exit(v[0]>22 || (v[0]===22 && v[1]>=12) ? 0 : 1)"
if errorlevel 1 (
  echo A versao do Node.js e antiga. Instale Node.js 22 ou mais recente.
  pause
  exit /b 1
)
echo Instalando as dependencias do compendio Astro.
call npm ci
if errorlevel 1 (
  echo.
  echo Nao foi possivel concluir a instalacao. Verifique a internet e tente novamente.
  pause
  exit /b 1
)
echo.
echo Instalacao concluida!
echo Use "visualizar.bat" para abrir o compendio localmente.
pause
