@echo off
setlocal EnableDelayedExpansion
title Desinstalador - Infoboard TV

:: -----------------------------------------------------------------------------
:: Garante que o diretorio atual seja a pasta do script
:: -----------------------------------------------------------------------------
cd /d "%~dp0"

:: -----------------------------------------------------------------------------
:: Verifica privilegios de Administrador
:: -----------------------------------------------------------------------------
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs" 2>nul
    if !errorLevel! neq 0 (
        echo.
        echo [ATENCAO] Execute este arquivo como Administrador.
        pause
    )
    exit /b
)

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

if exist "%SCRIPT_DIR%\..\server.js" (
    pushd "%SCRIPT_DIR%\.."
    set "APP_DIR=!CD!"
    popd
) else (
    set "APP_DIR=%SCRIPT_DIR%"
)

cls
echo ===============================================================================
echo            INFOBRASIL - DESINSTALADOR DO INFOBOARD TV
echo ===============================================================================
echo.
echo Tem certeza que deseja desinstalar o servico do Infoboard desta maquina? [S/N]
set /p CONFIRMAR="> "
if /i not "!CONFIRMAR!"=="S" (
    echo Operacao cancelada pelo usuario.
    pause
    exit /b
)

echo.
echo [1/3] Removendo servico nativo do Windows (services.msc)...
cd /d "!APP_DIR!"
if exist "!APP_DIR!\instalador\uninstall_service.js" (
    call node "!APP_DIR!\instalador\uninstall_service.js"
) else if exist "!APP_DIR!\uninstall_service.js" (
    call node "!APP_DIR!\uninstall_service.js"
)

echo.
echo [2/3] Removendo regra do Firewall do Windows...
powershell -Command "Remove-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -ErrorAction SilentlyContinue" >nul 2>&1
echo       - Regra de firewall removida.

echo.
echo [3/3] Removendo atalhos da Area de Trabalho...
powershell -Command "Remove-Item -Path ([Environment]::GetFolderPath('Desktop') + '\Abrir Painel Infoboard.url') -ErrorAction SilentlyContinue; Remove-Item -Path ([Environment]::GetFolderPath('Desktop') + '\Atualizar Infoboard.lnk') -ErrorAction SilentlyContinue" >nul 2>&1
echo       - Atalhos removidos.

echo.
echo ===============================================================================
echo                    DESINSTALACAO CONCLUIDA COM SUCESSO!
echo ===============================================================================
echo.
pause
