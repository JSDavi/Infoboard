@echo off
title Infoboard Watchdog Service
cd /d "%~dp0"

:loop
echo [%date% %time%] Iniciando Servidor Infoboard na porta 3000...
node server.js
echo [%date% %time%] [ALERTA] Servidor finalizou ou caiu. Reiniciando em 2 segundos...
timeout /t 2 /nobreak >nul
goto loop
