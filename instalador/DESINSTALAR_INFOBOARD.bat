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
    echo ===============================================================================
    echo [AVISO] Solicitando permissoes de Administrador...
    echo Uma nova janela sera aberta em Modo Administrador.
    echo Por favor, clique em "Sim" quando o Windows solicitar.
    echo ===============================================================================
    timeout /t 3 >nul
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
echo -------------------------------------------------------------------------------
echo [ETAPA 1/3] Removendo servico nativo do Windows (services.msc)...
echo -------------------------------------------------------------------------------
cd /d "!APP_DIR!"
if exist "!APP_DIR!\instalador\uninstall_service.js" (
    call node "!APP_DIR!\instalador\uninstall_service.js"
) else if exist "!APP_DIR!\uninstall_service.js" (
    call node "!APP_DIR!\uninstall_service.js"
) else (
    echo       - [AVISO] Arquivo de desinstalacao de servico nao encontrado.
)
if %errorLevel% neq 0 (
    echo       - [AVISO] Ocorreram erros ao tentar remover o servico (ele pode nao existir).
)
echo.

echo -------------------------------------------------------------------------------
echo [ETAPA 2/3] Removendo regra do Firewall do Windows...
echo -------------------------------------------------------------------------------
powershell -Command "Remove-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -ErrorAction SilentlyContinue" >nul 2>&1
echo       - Regra de firewall verificada/removida.
echo.

echo -------------------------------------------------------------------------------
echo [ETAPA 3/3] Removendo atalhos da Area de Trabalho...
echo -------------------------------------------------------------------------------
powershell -Command "Remove-Item -Path ([Environment]::GetFolderPath('Desktop') + '\Abrir Painel Infoboard.url') -ErrorAction SilentlyContinue; Remove-Item -Path ([Environment]::GetFolderPath('Desktop') + '\Atualizar Infoboard.lnk') -ErrorAction SilentlyContinue" >nul 2>&1
echo       - Atalhos verificados/removidos.
echo.

echo ===============================================================================
echo                    DESINSTALACAO CONCLUIDA COM SUCESSO!
echo ===============================================================================
echo.
echo Nota: Os arquivos do projeto na pasta "!APP_DIR!" foram mantidos. 
echo Se desejar remove-los completamente, apague a pasta manualmente.
echo.
pause
goto :EOF
