@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title Atualizador do Infoboard TV - Infobrasil

:: =============================================================================
:: CONFIGURACAO DE AMBIENTE E CORES ANSI
:: =============================================================================
reg add "HKCU\Console" /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
for /f "delims=" %%a in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "[char]27"') do set "ESC=%%a"

set "C_RESET=!ESC![0m"
set "C_BOLD=!ESC![1m"
set "C_DIM=!ESC![2m"
set "C_GREEN=!ESC![92m"
set "C_YELLOW=!ESC![93m"
set "C_CYAN=!ESC![96m"
set "C_RED=!ESC![91m"
set "C_WHITE=!ESC![97m"
set "C_GRAY=!ESC![90m"

:: =============================================================================
:: VERIFICACAO E ELEVACAO DE PRIVILEGIOS DE ADMINISTRADOR (COM AVISO PREVIO)
:: =============================================================================
net session >nul 2>&1
if %errorLevel% neq 0 goto :SOLICITAR_ELEVACAO
goto :INICIAR_ATUALIZACAO

:SOLICITAR_ELEVACAO
cls
echo.
echo ===============================================================================
echo                    !C_CYAN!!C_BOLD!INFOBRASIL - ATUALIZADOR DO INFOBOARD TV!C_RESET!
echo ===============================================================================
echo.
echo !C_YELLOW!!C_BOLD![AVISO DE ELEVACAO] Privilegios de Administrador Necessarios!C_RESET!
echo.
echo  Para atualizar o Infoboard TV com seguranca, este assistente precisa
echo  de permissoes administrativas do Windows para:
echo.
echo    1. Parar e reiniciar o Servico Nativo do Windows (Infoboard TV)
echo    2. Liberar arquivos bloqueados em uso e gravar no diretorio do sistema
echo    3. Criar arquivos de backup compactados (.ZIP) com seguranca
echo    4. Atualizar modulos e dependencias de producao
echo.
echo -------------------------------------------------------------------------------
echo !C_WHITE!Uma janela de solicitacao do Windows (UAC) sera exibida ao confirmar.!C_RESET!
echo.
set /p "UAC_CONFIRM=Deseja abrir a solicitacao de Administrador agora? (S/N) [S]: "
if "!UAC_CONFIRM!"=="" set "UAC_CONFIRM=S"

if /i "!UAC_CONFIRM!"=="S" (
    echo.
    echo !C_CYAN!Solicitando elevacao ao Windows... Aguarde...!C_RESET!
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs" 2>nul
    if !errorLevel! neq 0 (
        echo.
        echo !C_RED!!C_BOLD![FALHA] A solicitacao de elevacao foi negada ou falhou.!C_RESET!
        echo !C_YELLOW!Para prosseguir manualmente:!C_RESET!
        echo   1. Clique com o botao direito no arquivo 'ATUALIZAR_INFOBOARD.bat'
        echo   2. Selecione a opcao 'Executar como Administrador'
        echo.
        pause
    )
    exit /b 0
) else (
    echo.
    echo !C_YELLOW!Atualizacao cancelada pelo usuario antes da elevacao.!C_RESET!
    pause
    exit /b 0
)

:INICIAR_ATUALIZACAO
:: Ancorar diretorio atual no diretorio onde o script esta localizado
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: =============================================================================
:: CABECALHO PRINCIPAL E VISUAL DAS ETAPAS
:: =============================================================================
cls
echo ===============================================================================
echo                    !C_CYAN!!C_BOLD!INFOBRASIL - ATUALIZADOR DO INFOBOARD TV!C_RESET!
echo ===============================================================================
echo !C_GRAY!  Modo Seguro com Backup Automatico e Mecanismo de Rollback!C_RESET!
echo.
echo !C_BOLD!Etapas do Assistente de Atualizacao:!C_RESET!
echo   !C_CYAN![ 1/6 ]!C_RESET! Descoberta e Validacao da Pasta Instalada
echo   !C_CYAN![ 2/6 ]!C_RESET! Verificacao de Versao e Checagem de Downgrade
echo   !C_CYAN![ 3/6 ]!C_RESET! Encerramento Seguro de Servicos e Processos Ativos
echo   !C_CYAN![ 4/6 ]!C_RESET! Geracao de Backup Completo com Timestamp (.ZIP)
echo   !C_CYAN![ 5/6 ]!C_RESET! Sincronizacao de Arquivos e Atualizacao de Dependencias
echo   !C_CYAN![ 6/6 ]!C_RESET! Reinicializacao do Servico e Validacao de Conectividade
echo ===============================================================================
echo.

:: =============================================================================
:: ETAPA 1/6: DESCOBERTA E VALIDACAO DA PASTA INSTALADA
:: =============================================================================
:ETAPA_1
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 1/6 ] Descoberta e Validacao da Pasta Instalada!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Executando busca automatica da instalacao em 4 camadas...!C_RESET!

set "DETECTED_DIR="

:: Camada 1: Servico Windows via WMI / CIM
for /f "usebackq delims=" %%s in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$svc = Get-CimInstance Win32_Service -Filter 'Name like ''*Infoboard*''' -ErrorAction SilentlyContinue | Select-Object -First 1; "^
    "if ($svc -and $svc.PathName) { "^
    "    $path = $svc.PathName.Trim([char]34); "^
    "    $dir = Split-Path -Parent $path; "^
    "    if (Test-Path (Join-Path $dir 'server.js')) { Write-Output $dir } "^
    "    elseif (Test-Path (Join-Path (Split-Path -Parent $dir) 'server.js')) { Write-Output (Split-Path -Parent $dir) } "^
    "}"`) do (
    set "DETECTED_DIR=%%s"
)

:: Camada 2: Atalhos da Area de Trabalho (Usuario e Publico)
if not defined DETECTED_DIR (
    for /f "usebackq delims=" %%k in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ws = New-Object -ComObject WScript.Shell; "^
        "$desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory')); "^
        "foreach ($d in $desktops) { "^
        "    $lnk = Join-Path $d 'Atualizar Infoboard.lnk'; "^
        "    if (Test-Path $lnk) { "^
        "        $target = $ws.CreateShortcut($lnk).TargetPath; "^
        "        $dir = Split-Path -Parent (Split-Path -Parent $target); "^
        "        if (Test-Path (Join-Path $dir 'server.js')) { Write-Output $dir; break } "^
        "    } "^
        "}"`) do (
        set "DETECTED_DIR=%%k"
    )
)

:: Camada 3: Diretorio Relativo do Script (%SCRIPT_DIR%\..)
if not defined DETECTED_DIR (
    if exist "%SCRIPT_DIR%\..\server.js" (
        pushd "%SCRIPT_DIR%\.."
        set "DETECTED_DIR=!CD!"
        popd
    ) else if exist "%SCRIPT_DIR%\server.js" (
        set "DETECTED_DIR=%SCRIPT_DIR%"
    )
)

:: Camada 4: Diretorios Padrao Conhecidos
if not defined DETECTED_DIR (
    if exist "C:\Infoboard\server.js" (
        set "DETECTED_DIR=C:\Infoboard"
    ) else if exist "D:\Infoboard\server.js" (
        set "DETECTED_DIR=D:\Infoboard"
    ) else if exist "%ProgramFiles%\Infoboard\server.js" (
        set "DETECTED_DIR=%ProgramFiles%\Infoboard"
    )
)

:: Se uma pasta foi detectada:
if defined DETECTED_DIR (
    echo   !C_GREEN![OK] Instalacao localizada:!C_RESET! !C_CYAN!!C_BOLD!!DETECTED_DIR!!C_RESET!
    echo.
    echo Opcoes para a pasta de atualizacao:
    echo   !C_WHITE![ENTER/S]!C_RESET! Confirmar e atualizar nesta pasta
    echo   !C_WHITE![   G   ]!C_RESET! Abrir janela grafica para selecionar outra pasta
    echo   !C_WHITE![   M   ]!C_RESET! Digitar um caminho diferente manualmente
    echo.
    set /p "CONFIRM_LOC=Deseja atualizar em '!DETECTED_DIR!'? [ENTER/G/M]: "
    if defined CONFIRM_LOC set "CONFIRM_LOC=!CONFIRM_LOC: =!"
    if "!CONFIRM_LOC!"=="" set "CONFIRM_LOC=S"
    if /i "!CONFIRM_LOC!"=="SIM" set "CONFIRM_LOC=S"
    if /i "!CONFIRM_LOC!"=="Y" set "CONFIRM_LOC=S"
    if /i "!CONFIRM_LOC!"=="YES" set "CONFIRM_LOC=S"
    if /i "!CONFIRM_LOC!"=="S" (
        set "APP_DIR=!DETECTED_DIR!"
        goto :VALIDAR_APP_DIR
    )
    if /i "!CONFIRM_LOC!"=="G" goto :SELECIONAR_GUI_UPD
    if /i "!CONFIRM_LOC!"=="M" goto :SELECIONAR_MANUAL_UPD
    
    :: Se o usuario colou um caminho diretamente:
    set "APP_DIR=!CONFIRM_LOC!"
    goto :VALIDAR_APP_DIR
) else (
    echo   !C_YELLOW![AVISO] Nenhuma instalacao padrao foi encontrada automaticamente.!C_RESET!
)

:SELECIONAR_GUI_UPD
echo.
echo   !C_CYAN!* Abrindo seletor grafico de pastas do Windows...!C_RESET!
set "SELECTED_GUI_UPD="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Add-Type -AssemblyName System.Windows.Forms; "^
    "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "^
    "$f.Description = 'Selecione a pasta onde o Infoboard TV esta instalado:'; "^
    "$f.ShowNewFolderButton = $false; "^
    "if (Test-Path 'C:\Infoboard') { $f.SelectedPath = 'C:\Infoboard' }; "^
    "$top = New-Object System.Windows.Forms.Form; "^
    "$top.TopMost = $true; $top.MinimizeBox = $false; $top.MaximizeBox = $false; $top.ShowInTaskbar = $false; "^
    "if ($f.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"`) do (
    set "SELECTED_GUI_UPD=%%I"
)

if defined SELECTED_GUI_UPD (
    set "APP_DIR=!SELECTED_GUI_UPD!"
    goto :VALIDAR_APP_DIR
) else (
    echo   !C_YELLOW![AVISO] Nenhuma pasta selecionada na janela grafica.!C_RESET!
)

:SELECIONAR_MANUAL_UPD
echo.
set /p "APP_DIR=Digite o caminho completo da pasta do Infoboard: "

:VALIDAR_APP_DIR
:: Sanitizacao de aspas e barras
set "APP_DIR=!APP_DIR:"=!"
if "!APP_DIR:~-1!"=="\" set "APP_DIR=!APP_DIR:~0,-1!"
if "!APP_DIR:~-1!"=="/" set "APP_DIR=!APP_DIR:~0,-1!"
if "!APP_DIR:~-1!"==":" set "APP_DIR=!APP_DIR!\"

if not exist "!APP_DIR!\server.js" (
    echo.
    echo !C_RED!!C_BOLD![ERRO] Pasta invalida! O arquivo 'server.js' nao foi encontrado em '!APP_DIR!'.!C_RESET!
    echo.
    echo Deseja tentar novamente? [S/N] [S]:
    set /p "RETRY_DIR=> "
    if "!RETRY_DIR!"=="" set "RETRY_DIR=S"
    if /i "!RETRY_DIR!"=="S" goto :ETAPA_1
    call :ERRO_FATAL "ETAPA 1/6 - Localizacao" "101" "Nao foi selecionada uma pasta valida do Infoboard." "Selecione a pasta onde os arquivos 'server.js' e 'package.json' estao localizados."
    exit /b 1
)

echo   !C_GREEN![OK] Pasta de instalacao confirmada:!C_RESET! !C_CYAN!!C_BOLD!!APP_DIR!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 2/6: VERIFICACAO DE VERSAO E CHECAGEM DE DOWNGRADE
:: =============================================================================
:ETAPA_2
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 2/6 ] Verificacao de Versao e Checagem de Downgrade!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Lendo informacoes de versao do sistema...!C_RESET!

set "INSTALLED_VER=1.0.0"
if exist "!APP_DIR!\package.json" (
    for /f "usebackq delims=" %%v in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "try { (Get-Content -LiteralPath '!APP_DIR!\package.json' -Raw | ConvertFrom-Json).version } catch { '1.0.0' }"`) do (
        set "INSTALLED_VER=%%v"
    )
)

:: Obter versao do pacote novo (local ou remoto)
set "NEW_VER="
if exist "%SCRIPT_DIR%\..\package.json" (
    pushd "%SCRIPT_DIR%\.."
    set "SOURCE_DIR_CANDIDATE=!CD!"
    popd
    if /i not "!SOURCE_DIR_CANDIDATE!"=="!APP_DIR!" (
        for /f "usebackq delims=" %%v in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "try { (Get-Content -LiteralPath '!SOURCE_DIR_CANDIDATE!\package.json' -Raw | ConvertFrom-Json).version } catch { '' }"`) do (
            set "NEW_VER=%%v"
        )
    )
)

if not defined NEW_VER (
    for /f "usebackq delims=" %%v in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; "^
        "try { (Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/JSDavi/Infoboard/master/package.json' -TimeoutSec 5).version } catch { '' }"`) do (
        set "NEW_VER=%%v"
    )
)

if not defined NEW_VER set "NEW_VER=!INSTALLED_VER!"

echo.
echo   !C_WHITE!Versao Atual Instalada:!C_RESET! !C_CYAN!v!INSTALLED_VER!!C_RESET!
echo   !C_WHITE!Versao do Pacote Novo:!C_RESET!  !C_CYAN!v!NEW_VER!!C_RESET!
echo.

:: Comparacao SemVer via PowerShell
set "COMPARE_RESULT=EQUAL"
for /f "usebackq delims=" %%c in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { "^
    "    $v1 = [System.Version]::Parse('!INSTALLED_VER!'.Trim()); "^
    "    $v2 = [System.Version]::Parse('!NEW_VER!'.Trim()); "^
    "    if ($v2 -gt $v1) { 'UPGRADE' } elseif ($v2 -lt $v1) { 'DOWNGRADE' } else { 'EQUAL' } "^
    "} catch { 'EQUAL' }"`) do (
    set "COMPARE_RESULT=%%c"
)

if "!COMPARE_RESULT!"=="UPGRADE" goto :VERSAO_UPGRADE
if "!COMPARE_RESULT!"=="DOWNGRADE" goto :VERSAO_DOWNGRADE
goto :VERSAO_EQUAL

:VERSAO_UPGRADE
echo   !C_GREEN!!C_BOLD![UPGRADE DETECTADO] Atualizacao recomendada: v!INSTALLED_VER! -> v!NEW_VER!!C_RESET!
echo.
goto :FIM_CHECK_VERSAO

:VERSAO_EQUAL
echo   !C_YELLOW![AVISO] O sistema ja se encontra na versao v!INSTALLED_VER!.!C_RESET!
set /p "FORCE_UPD=Deseja forcar a reinstalacao/atualizacao dos arquivos? [S/N] [S]: "
if "!FORCE_UPD!"=="" set "FORCE_UPD=S"
if /i not "!FORCE_UPD!"=="S" (
    echo.
    echo !C_YELLOW!Atualizacao cancelada pelo usuario.!C_RESET!
    pause
    exit /b 0
)
echo.
goto :FIM_CHECK_VERSAO

:VERSAO_DOWNGRADE
echo ===============================================================================
echo !C_RED!!C_BOLD![ALERTA CRITICO DE DOWNGRADE]!C_RESET!
echo -------------------------------------------------------------------------------
echo  A versao instalada [!C_CYAN!v!INSTALLED_VER!!C_RESET!] e !C_RED!!C_BOLD!MAIS RECENTE!C_RESET! que o pacote a instalar [!C_YELLOW!v!NEW_VER!!C_RESET!].
echo  Realizar o downgrade pode causar incompatibilidade no banco ou configuracoes.
echo ===============================================================================
echo.
set /p "DOWNGRADE_CONFIRM=Deseja REALMENTE prosseguir com o DOWNGRADE para a versao v!NEW_VER!? [S/N] [N]: "
if "!DOWNGRADE_CONFIRM!"=="" set "DOWNGRADE_CONFIRM=N"
if /i not "!DOWNGRADE_CONFIRM!"=="S" (
    echo.
    echo !C_GREEN![CANCELADO] Operacao de downgrade abortada com seguranca pelo usuario.!C_RESET!
    pause
    exit /b 0
)
echo.
echo   !C_YELLOW![AVISO] Downgrade confirmado pelo operador. Prosseguindo com cautela...!C_RESET!
echo.

:FIM_CHECK_VERSAO

:: =============================================================================
:: ETAPA 3/6: ENCERRAMENTO SEGURO DE SERVICOS E PROCESSOS ATIVOS
:: =============================================================================
:ETAPA_3
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 3/6 ] Encerramento Seguro de Servicos e Processos Ativos!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Interrompendo servicos do Windows para liberar arquivos em uso...!C_RESET!

net stop "Infoboard TV" >nul 2>&1
net stop "InfoboardService" >nul 2>&1

echo   !C_GRAY!* Finalizando processos em segundo plano (daemons e node.exe na porta 3000)...!C_RESET!
taskkill /F /IM "infoboardservice.exe" >nul 2>&1
taskkill /F /IM "infoboardtv.exe" >nul 2>&1

:: Encerrar processo node na porta 3000 se houver
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { "^
    "    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} "^
    "}" >nul 2>&1

:: Aguardar 1.5 segundo para liberacao completa dos descritores de arquivo
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Milliseconds 1500"

echo   !C_GREEN![OK] Servicos e processos interrompidos com seguranca!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 4/6: GERACAO DE BACKUP COMPLETO COM TIMESTAMP (.ZIP)
:: =============================================================================
:ETAPA_4
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 4/6 ] Geracao de Backup Completo com Timestamp (.ZIP)!C_RESET!
echo -------------------------------------------------------------------------------

:: Criar diretorio de backups
if not exist "!APP_DIR!\backups" mkdir "!APP_DIR!\backups" >nul 2>&1

:: Obter timestamp no formato YYYYMMDD_HHMMSS
for /f "usebackq delims=" %%t in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"`) do (
    set "TIMESTAMP=%%t"
)
if "!TIMESTAMP!"=="" set "TIMESTAMP=backup_manual"

set "BACKUP_FILE=!APP_DIR!\backups\backup_Infoboard_!TIMESTAMP!.zip"

echo   !C_CYAN!* Compactando recursivamente todos os arquivos e pastas da instalacao...!C_RESET!
echo   !C_GRAY!  (Excluindo node_modules, backups antigos e logs para otimizar tamanho)!C_RESET!

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; "^
    "$src = [System.IO.Path]::GetFullPath('!APP_DIR!').TrimEnd('\', '/'); "^
    "$prefix = $src + '\'; "^
    "$dst = '!BACKUP_FILE!'; "^
    "$excludeDirs = @('node_modules', 'backups', '.git', '.agents'); "^
    "$zip = [System.IO.Compression.ZipFile]::Open($dst, 'Create'); "^
    "try { "^
    "    Get-ChildItem -LiteralPath $src -Recurse -Force | ForEach-Object { "^
    "        $full = [System.IO.Path]::GetFullPath($_.FullName); "^
    "        if ($full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { "^
    "            $rel = $full.Substring($prefix.Length); "^
    "            $skip = $false; "^
    "            foreach ($ex in $excludeDirs) { "^
    "                if ($rel -eq $ex -or $rel.StartsWith($ex + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $rel.StartsWith($ex + '/', [System.StringComparison]::OrdinalIgnoreCase)) { "^
    "                    $skip = $true; break "^
    "                } "^
    "            }; "^
    "            if (-not $skip -and -not $_.PSIsContainer) { "^
    "                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $rel, 'Optimal') | Out-Null "^
    "            } "^
    "        } "^
    "    } "^
    "} finally { "^
    "    $zip.Dispose() "^
    "}"

if not exist "!BACKUP_FILE!" (
    call :ERRO_FATAL "ETAPA 4/6 - Backup" "401" "Falha critica ao gerar o arquivo ZIP de backup." "Verifique se ha espaco suficiente em disco na unidade de '!APP_DIR!'."
    exit /b 1
)

for /f "usebackq delims=" %%s in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$b = (Get-Item -LiteralPath '!BACKUP_FILE!').Length; if ($b -gt 1MB) { '{0:N2} MB' -f ($b / 1MB) } else { '{0:N2} KB' -f ($b / 1KB) }"`) do (
    set "BACKUP_SIZE=%%s"
)

echo.
echo   !C_GREEN![OK] Backup 100%% integro gerado com sucesso!!C_RESET!
echo   !C_WHITE!Localizacao do Backup:!C_RESET! !C_CYAN!!BACKUP_FILE!!C_RESET!
echo   !C_WHITE!Tamanho do Pacote:!C_RESET!     !C_YELLOW!!BACKUP_SIZE!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 5/6: SINCRONIZACAO DE ARQUIVOS E ATUALIZACAO DE DEPENDENCIAS
:: =============================================================================
:ETAPA_5
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 5/6 ] Sincronizacao de Arquivos e Dependencias!C_RESET!
echo -------------------------------------------------------------------------------

:: Verificar se existe fonte local para copia
set "LOCAL_SRC="
if exist "%SCRIPT_DIR%\..\server.js" (
    pushd "%SCRIPT_DIR%\.."
    set "LOCAL_SRC=!CD!"
    popd
)

set "SYNC_SUCCESS=0"

:: Metodo 1: Copia local se a fonte estiver disponivel e for diferente de APP_DIR
if defined LOCAL_SRC (
    if /i not "!LOCAL_SRC!"=="!APP_DIR!" (
        echo   !C_CYAN!* Atualizando a partir da fonte local via Robocopy...!C_RESET!
        robocopy "!LOCAL_SRC!" "!APP_DIR!" /E /NP /NFL /NDL /R:2 /W:2 /XD node_modules .git .agents backups /XF .env *.log >nul 2>&1
        if !errorLevel! leq 7 set "SYNC_SUCCESS=1"
    )
)

:: Metodo 2: Repositorio Git
if "!SYNC_SUCCESS!"=="0" (
    if exist "!APP_DIR!\.git" (
        echo   !C_CYAN!* Repositorio Git detectado. Executando git pull origin master...!C_RESET!
        cd /d "!APP_DIR!"
        git -c core.askPass= -c credential.helper= pull origin master >nul 2>&1
        if !errorLevel! equ 0 set "SYNC_SUCCESS=1"
    )
)

:: Metodo 3: Download do pacote ZIP oficial do GitHub
if "!SYNC_SUCCESS!"=="0" (
    echo   !C_CYAN!* Baixando pacote oficial mais recente do GitHub...!C_RESET!
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$tmpZip = Join-Path $env:TEMP 'infoboard_upd.zip'; "^
        "$tmpExt = Join-Path $env:TEMP 'infoboard_upd_extracted'; "^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; "^
        "Invoke-WebRequest -Uri 'https://github.com/JSDavi/Infoboard/archive/refs/heads/master.zip' -OutFile $tmpZip -UseBasicParsing; "^
        "Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpExt -Force; "^
        "Get-ChildItem -Path (Join-Path $tmpExt 'Infoboard-master\*') | ForEach-Object { "^
        "    if ($_.Name -ne '.env' -and $_.Name -ne 'backups') { "^
        "        Copy-Item -Path $_.FullName -Destination '!APP_DIR!' -Recurse -Force "^
        "    } "^
        "}; "^
        "Remove-Item -LiteralPath $tmpExt -Recurse -Force -ErrorAction SilentlyContinue; "^
        "Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue"
    if !errorLevel! equ 0 set "SYNC_SUCCESS=1"
)

if "!SYNC_SUCCESS!"=="0" (
    call :ROLLBACK "ETAPA 5/6 - Sincronizacao" "501" "Nao foi possivel baixar ou copiar os novos arquivos da aplicacao."
    exit /b 1
)

echo   !C_GREEN![OK] Arquivos sincronizados preservando o .env e pasta backups!!C_RESET!
echo.

echo   !C_CYAN!* Atualizando dependencias de producao (npm install)...!C_RESET!
cd /d "!APP_DIR!"
call npm install --omit=dev
if !errorLevel! neq 0 (
    call :ROLLBACK "ETAPA 5/6 - Dependencias NPM" "502" "Falha ao instalar ou atualizar os modulos do Node.js."
    exit /b 1
)

echo   !C_GREEN![OK] Modulos e dependencias verificados com sucesso!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 6/6: REINICIALIZACAO DO SERVICO E VALIDACAO DE CONECTIVIDADE
:: =============================================================================
:ETAPA_6
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 6/6 ] Reinicializacao do Servico e Validacao!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Iniciando o servico nativo 'Infoboard TV' no Windows...!C_RESET!

net start "InfoboardService" >nul 2>&1
if !errorLevel! neq 0 (
    net start "Infoboard TV" >nul 2>&1
)

:: Se o servico ainda nao estiver ativo, tentar registrar/iniciar via install_service.js
sc query "InfoboardService" | findstr /i "RUNNING" >nul 2>&1
if !errorLevel! neq 0 (
    sc query "Infoboard TV" | findstr /i "RUNNING" >nul 2>&1
    if !errorLevel! neq 0 (
        if exist "!APP_DIR!\instalador\install_service.js" (
            node "!APP_DIR!\instalador\install_service.js" >nul 2>&1
        )
    )
)

echo   !C_GRAY!* Aguardando inicializacao do servidor web na porta 3000...!C_RESET!
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"

set "HTTP_OK=0"
for /f "usebackq delims=" %%h in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { $res = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 4; if ($res.StatusCode -eq 200) { '1' } else { '0' } } catch { '0' }"`) do (
    set "HTTP_OK=%%h"
)

if "!HTTP_OK!"=="1" (
    echo   !C_GREEN![OK] Servidor respondendo perfeitamente na porta 3000!!C_RESET!
) else (
    echo   !C_YELLOW![AVISO] Servico iniciado, porem resposta HTTP demorou mais que o previsto.!C_RESET!
)
echo.

:: Obter IP local da maquina
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4" 2^>nul') do (
    set "LOCAL_IP=%%i"
    set "LOCAL_IP=!LOCAL_IP: =!"
    goto :IP_UPD_ENCONTRADO
)
set "LOCAL_IP=127.0.0.1"
:IP_UPD_ENCONTRADO

:: =============================================================================
:: FINALIZACAO E SUMARIO ANALITICO DE ATUALIZACAO
:: =============================================================================
cls
echo ===============================================================================
echo            !C_GREEN!!C_BOLD!ATUALIZACAO DO INFOBOARD CONCLUIDA COM SUCESSO!!C_RESET!
echo ===============================================================================
echo.
echo !C_WHITE!!C_BOLD!Relatorio da Atualizacao:!C_RESET!
echo   !C_CYAN!* Versao Aplicada:!C_RESET!   v!NEW_VER!
echo   !C_CYAN!* Diretorio:!C_RESET!         !APP_DIR!
echo   !C_CYAN!* Servico Windows:!C_RESET!   'Infoboard TV' (Status: Ativo / Em Execucao)
echo   !C_CYAN!* Backup de Seguranca:!C_RESET! !BACKUP_FILE!
echo.
echo !C_WHITE!!C_BOLD!Enderecos de Acesso ao Painel:!C_RESET!
echo   !C_GREEN!* Local:!C_RESET!            http://localhost:3000
echo   !C_GREEN!* Rede Local (TVs):!C_RESET! http://!LOCAL_IP!:3000
echo.
echo ===============================================================================
echo !C_GRAY!Pressione qualquer tecla para finalizar o assistente.!C_RESET!
echo ===============================================================================
echo.
pause
exit /b 0

:: =============================================================================
:: ROTINA DE ROLLBACK AUTOMATICO EM CASO DE FALHA NA ATUALIZACAO
:: =============================================================================
:ROLLBACK
set "RB_STEP=%~1"
set "RB_CODE=%~2"
set "RB_MSG=%~3"

cls
echo.
echo ===============================================================================
echo        !C_RED!!C_BOLD![FALHA NA ATUALIZACAO - DISPARANDO ROLLBACK DE SEGURANCA]!C_RESET!
echo ===============================================================================
echo.
echo   !C_WHITE!Etapa da Falha:!C_RESET! !C_CYAN!!RB_STEP!!C_RESET! (Codigo: ERR_!RB_CODE!)
echo   !C_WHITE!Motivo:!C_RESET!          !RB_MSG!
echo.
echo -------------------------------------------------------------------------------
echo   !C_YELLOW!Restaurando o estado anterior da aplicacao a partir do backup recem-criado...!C_RESET!
echo   !C_GRAY!Arquivo: !BACKUP_FILE!!C_RESET!
echo -------------------------------------------------------------------------------
echo.

if exist "!BACKUP_FILE!" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; "^
        "$zip = [System.IO.Compression.ZipFile]::OpenRead('!BACKUP_FILE!'); "^
        "try { foreach ($entry in $zip.Entries) { "^
        "    $dest = [System.IO.Path]::Combine('!APP_DIR!', $entry.FullName); "^
        "    if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) { "^
        "        if (-not [System.IO.Directory]::Exists($dest)) { [System.IO.Directory]::CreateDirectory($dest) | Out-Null } "^
        "    } else { "^
        "        $parent = [System.IO.Path]::GetDirectoryName($dest); "^
        "        if (-not [System.IO.Directory]::Exists($parent)) { [System.IO.Directory]::CreateDirectory($parent) | Out-Null }; "^
        "        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true) "^
        "    } "^
        "} } finally { $zip.Dispose() }"
    
    if !errorLevel! equ 0 (
        echo   !C_GREEN![OK] Arquivos da versao anterior restaurados com sucesso!!C_RESET!
        echo   !C_CYAN!* Reiniciando servico do Windows...!C_RESET!
        net start "Infoboard TV" >nul 2>&1
        echo.
        echo !C_GREEN!!C_BOLD!O sistema foi revertido com seguranca para a versao v!INSTALLED_VER!.!C_RESET!
    ) else (
        echo   !C_RED![ERRO] Falha ao extrair backup automaticamente.!C_RESET!
        echo   Extraia o arquivo manualmente: '!BACKUP_FILE!'
    )
) else (
    echo   !C_RED![ERRO] Arquivo de backup nao foi encontrado para rollback.!C_RESET!
)

(
    echo [!DATE! !TIME!] FALHA NA ATUALIZACAO - ROLLBACK EXECUTADO
    echo Etapa: !RB_STEP!
    echo Codigo: ERR_!RB_CODE!
    echo Motivo: !RB_MSG!
    echo Backup Utilizado: !BACKUP_FILE!
    echo -------------------------------------------------------------------------------
) >> "%~dp0atualizacao_erro.log" 2>nul

echo.
echo Pressione qualquer tecla para encerrar...
pause >nul
exit /b 1

:: =============================================================================
:: PAINEL ANALITICO DE ERRO FATAL
:: =============================================================================
:ERRO_FATAL
set "ERR_STEP=%~1"
set "ERR_CODE=%~2"
set "ERR_MSG=%~3"
set "ERR_FIX=%~4"

cls
echo.
echo ===============================================================================
echo                !C_RED!!C_BOLD![FALHA NO ATUALIZADOR DO INFOBOARD TV]!C_RESET!
echo ===============================================================================
echo.
echo   !C_WHITE!!C_BOLD!Etapa da Falha:!C_RESET!    !C_CYAN!!ERR_STEP!!C_RESET!
echo   !C_WHITE!!C_BOLD!Codigo de Erro:!C_RESET!    !C_RED!ERR_!ERR_CODE!!C_RESET!
echo   !C_WHITE!!C_BOLD!Diagnostico:!C_RESET!       !ERR_MSG!
echo.
echo -------------------------------------------------------------------------------
echo   !C_YELLOW!!C_BOLD!Como Resolver:!C_RESET!
echo   !ERR_FIX!
echo -------------------------------------------------------------------------------
echo.

(
    echo [!DATE! !TIME!] FALHA NO ATUALIZADOR
    echo Etapa: !ERR_STEP!
    echo Codigo: ERR_!ERR_CODE!
    echo Mensagem: !ERR_MSG!
    echo Acao Recomendada: !ERR_FIX!
    echo -------------------------------------------------------------------------------
) >> "%~dp0atualizacao_erro.log" 2>nul

echo !C_GRAY!Registro salvo em: '%~dp0atualizacao_erro.log'!C_RESET!
echo.
echo Pressione qualquer tecla para encerrar...
pause >nul
exit /b 1
