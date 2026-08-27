@echo off
setlocal EnableDelayedExpansion
title Atualizador Automatico - Infoboard TV

:: -----------------------------------------------------------------------------
:: Garante que o diretorio atual seja a pasta do script
:: -----------------------------------------------------------------------------
cd /d "%~dp0"

:: -----------------------------------------------------------------------------
:: Verifica privilegios de Administrador
:: -----------------------------------------------------------------------------
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/k cd /d \"\"%~dp0\"\" && \"\"%~f0\"\"' -Verb RunAs"
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
echo            INFOBRASIL - ATUALIZACAO AUTOMATICA DO INFOBOARD
echo ===============================================================================
echo.
echo Diretorio do Sistema: "!APP_DIR!"
echo.

:: -----------------------------------------------------------------------------
:: 1. Parando o Servico Windows
:: -----------------------------------------------------------------------------
echo [1/4] Parando o servico 'Infoboard TV' para atualizacao segura...
net stop "Infoboard TV" >nul 2>&1
echo       - Servico pausado temporariamente.
echo.

:: -----------------------------------------------------------------------------
:: 2. Sincronizando com o GitHub
:: -----------------------------------------------------------------------------
echo [2/4] Baixando a versao mais recente do GitHub...
cd /d "!APP_DIR!"
if exist "!APP_DIR!\.git" (
    echo       - Repositorio Git detectado. Executando git pull...
    git -c core.askPass= -c credential.helper= pull origin master
) else (
    echo       - Baixando pacote atualizado do GitHub (ZIP)...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/JSDavi/Infoboard/archive/refs/heads/master.zip' -OutFile '%TEMP%\infoboard_update.zip'; Expand-Archive -Path '%TEMP%\infoboard_update.zip' -DestinationPath '%TEMP%\infoboard_upd_extracted' -Force; Get-ChildItem -Path '%TEMP%\infoboard_upd_extracted\Infoboard-master' -Recurse | Where-Object { $_.Name -ne '.env' } | Copy-Item -Destination { Join-Path '!APP_DIR!' $_.FullName.Substring(('%TEMP%\infoboard_upd_extracted\Infoboard-master').Length) } -Force; Remove-Item -Path '%TEMP%\infoboard_upd_extracted' -Recurse -Force; Remove-Item -Path '%TEMP%\infoboard_update.zip' -Force"
)
echo       - Arquivos atualizados com sucesso!
echo.

:: -----------------------------------------------------------------------------
:: 3. Atualizando dependencias
:: -----------------------------------------------------------------------------
echo [3/4] Verificando novas dependencias (npm install)...
cd /d "!APP_DIR!"
call npm install --omit=dev
echo       - Modulos verificados.
echo.

:: -----------------------------------------------------------------------------
:: 4. Reiniciando o Servico Windows
:: -----------------------------------------------------------------------------
echo [4/4] Reiniciando o servico 'Infoboard TV'...
net start "Infoboard TV"
echo.

echo ===============================================================================
echo                      SISTEMA ATUALIZADO COM SUCESSO!
echo ===============================================================================
echo.
echo O Infoboard ja esta rodando com a versao mais recente na porta 3000.
echo.
pause
