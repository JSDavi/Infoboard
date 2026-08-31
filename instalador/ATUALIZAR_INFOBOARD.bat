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
    if exist "C:\Infoboard\server.js" (
        set "APP_DIR=C:\Infoboard"
    ) else (
        set "APP_DIR=%SCRIPT_DIR%"
    )
)

cls
echo ===============================================================================
echo            INFOBRASIL - ATUALIZACAO AUTOMATICA DO INFOBOARD
echo ===============================================================================
echo.
echo Localizamos uma possivel instalacao em: "!APP_DIR!"
set /p CONFIRM_DIR="Deseja atualizar nesta pasta? [S/N] (Pressione ENTER para Sim): "
if /i "!CONFIRM_DIR!"=="N" (
    set /p USER_APP_DIR="Digite o caminho completo da pasta do Infoboard a atualizar: "
    if not "!USER_APP_DIR!"=="" set "APP_DIR=!USER_APP_DIR!"
)

echo.
echo Diretorio do Sistema para atualizacao: "!APP_DIR!"
echo.

:: -----------------------------------------------------------------------------
:: [ETAPA 1/5] Backup
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 1/5] Criando backup de seguranca da versao atual...
echo -------------------------------------------------------------------------------
if not exist "!APP_DIR!\server.js" (
    call :ERRO_FATAL "ETAPA 1/5 - Backup" "Nao foi encontrada uma instalacao valida do Infoboard no diretorio selecionado (!APP_DIR!)."
    exit /b
)

set "BACKUP_FILE=!APP_DIR!\backup_antes_atualizacao.zip"
echo       - Compactando arquivos para "!BACKUP_FILE!"...
:: Exclui a propria pasta node_modules para o zip nao ficar gigante, ou apenas faz um backup dos essenciais
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $src = '!APP_DIR!'; $dst = '!BACKUP_FILE!'; if (Test-Path $dst) { Remove-Item $dst -Force }; $files = Get-ChildItem -Path $src -Exclude 'node_modules', 'backup_antes_atualizacao.zip', '.git'; [System.IO.Compression.ZipFile]::Open($dst, [System.IO.Compression.ZipArchiveMode]::Create) | ForEach-Object { $zip = $_; $files | ForEach-Object { if ($_.PSIsContainer) { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $_.Name + '/') | Out-Null } else { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $_.Name) | Out-Null } }; $zip.Dispose() }" >nul 2>&1

if not exist "!BACKUP_FILE!" (
    call :ERRO_FATAL "ETAPA 1/5 - Backup" "Falha ao criar o arquivo de backup ZIP."
    exit /b
)
echo       - [OK] Backup concluido com sucesso!
echo.

:: -----------------------------------------------------------------------------
:: [ETAPA 2/5] Parando o Servico Windows
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 2/5] Parando o servico 'Infoboard TV' para atualizacao segura...
echo -------------------------------------------------------------------------------
net stop "Infoboard TV" >nul 2>&1
echo       - Servico pausado temporariamente.
echo.

:: -----------------------------------------------------------------------------
:: [ETAPA 3/5] Sincronizando com o GitHub
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 3/5] Baixando a versao mais recente do GitHub...
echo -------------------------------------------------------------------------------
cd /d "!APP_DIR!"
if not exist "!APP_DIR!\.git" goto :BAIXAR_ZIP

echo       - Repositorio Git detectado. Executando git pull...
git -c core.askPass= -c credential.helper= pull origin master
if %errorLevel% neq 0 (
    call :ROLLBACK "ETAPA 3/5 - Download" "Falha ao baixar atualizacoes via Git."
    exit /b
)
goto :FIM_DOWNLOAD

:BAIXAR_ZIP
echo       - Baixando pacote atualizado do GitHub (ZIP - Windows Server Mode)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/JSDavi/Infoboard/archive/refs/heads/master.zip' -OutFile '%TEMP%\infoboard_update.zip' -UseBasicParsing; Expand-Archive -Path '%TEMP%\infoboard_update.zip' -DestinationPath '%TEMP%\infoboard_upd_extracted' -Force; Copy-Item -Path '%TEMP%\infoboard_upd_extracted\Infoboard-master\*' -Destination '!APP_DIR!' -Recurse -Exclude '.env' -Force -Verbose; Remove-Item -Path '%TEMP%\infoboard_upd_extracted' -Recurse -Force; Remove-Item -Path '%TEMP%\infoboard_update.zip' -Force"
if %errorLevel% neq 0 (
    call :ROLLBACK "ETAPA 3/5 - Download" "Falha ao baixar e extrair o arquivo ZIP oficial."
    exit /b
)

:FIM_DOWNLOAD
echo       - [OK] Arquivos atualizados com sucesso!
echo.

:: -----------------------------------------------------------------------------
:: [ETAPA 4/5] Atualizando dependencias
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 4/5] Verificando novas dependencias (npm install)...
echo -------------------------------------------------------------------------------
cd /d "!APP_DIR!"
call npm install --omit=dev
if %errorLevel% neq 0 (
    call :ROLLBACK "ETAPA 4/5 - Dependencias" "Falha ao executar npm install."
    exit /b
)
echo       - [OK] Modulos verificados.
echo.

:: -----------------------------------------------------------------------------
:: [ETAPA 5/5] Reiniciando o Servico Windows
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 5/5] Reiniciando o servico 'Infoboard TV'...
echo -------------------------------------------------------------------------------
net start "Infoboard TV"
if %errorLevel% neq 0 (
    call :ROLLBACK "ETAPA 5/5 - Servico" "Falha ao iniciar o servico Infoboard TV."
    exit /b
)
echo.

echo ===============================================================================
echo                      SISTEMA ATUALIZADO COM SUCESSO!
echo ===============================================================================
echo.
echo O Infoboard ja esta rodando com a versao mais recente na porta 3000.
echo.
pause
goto :EOF

:ERRO_FATAL
echo.
echo ===============================================================================
echo [ERRO FATAL] O processo falhou na %~1.
echo Motivo: %~2
echo.
echo Pressione qualquer tecla para sair...
echo ===============================================================================
pause >nul
exit /b

:ROLLBACK
echo.
echo ===============================================================================
echo [FALHA CRITICA] A atualizacao falhou na %~1.
echo Motivo: %~2
echo.
echo Iniciando restauracao do backup (Rollback)...
echo ===============================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $dst = '!APP_DIR!'; $zipFile = '!APP_DIR!\backup_antes_atualizacao.zip'; if (Test-Path $zipFile) { [System.IO.Compression.ZipFile]::ExtractToDirectory($zipFile, $dst, $true) }" >nul 2>&1
if %errorLevel% equ 0 (
    echo.
    echo [OK] O sistema foi revertido para a versao anterior com sucesso!
) else (
    echo.
    echo [ERRO] Nao foi possivel restaurar o backup automaticamente. 
    echo O arquivo de backup encontra-se em: "!APP_DIR!\backup_antes_atualizacao.zip"
)
echo.
echo Pressione qualquer tecla para sair...
pause >nul
exit /b
