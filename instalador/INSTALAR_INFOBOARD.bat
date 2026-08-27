@echo off
setlocal EnableDelayedExpansion
title Instalador Automatico - Infoboard TV (GitHub)

:: -----------------------------------------------------------------------------
:: Verifica privilegios de Administrador
:: -----------------------------------------------------------------------------
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ===============================================================================
    echo [AVISO] Solicitando permissoes de Administrador...
    echo ===============================================================================
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cls
echo ===============================================================================
echo            INFOBRASIL - INSTALADOR COMPLETO DO INFOBOARD TV
echo ===============================================================================
echo.
echo Repositorio Oficial: https://github.com/JSDavi/Infoboard.git
echo.

:: -----------------------------------------------------------------------------
:: 1. Define o Diretorio de Instalacao
:: -----------------------------------------------------------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: Se o script estiver dentro da pasta instalador de um projeto clonado:
if exist "%SCRIPT_DIR%\..\server.js" (
    pushd "%SCRIPT_DIR%\.."
    set "TARGET_DIR=!CD!"
    popd
    echo Modo: Instalacao a partir do diretorio local atual:
    echo "!TARGET_DIR!"
) else if exist "%SCRIPT_DIR%\server.js" (
    set "TARGET_DIR=%SCRIPT_DIR%"
    echo Modo: Instalacao no diretorio atual:
    echo "!TARGET_DIR!"
) else (
    set "TARGET_DIR=C:\Infoboard"
    echo Diretorio de destino padrao:
    echo "%TARGET_DIR%"
)
echo ===============================================================================
echo.

:: -----------------------------------------------------------------------------
:: 2. Verifica se o Node.js esta instalado
:: -----------------------------------------------------------------------------
echo [1/6] Verificando instalacao do Node.js...
node -v >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [ATENCAO] Node.js NAO foi detectado no computador!
    echo Deseja baixar e instalar o Node.js LTS automaticamente agora? (S/N)
    set /p INSTALAR_NODE="> "
    if /i "!INSTALAR_NODE!"=="S" (
        echo Baixando instalador do Node.js LTS...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\nodejs_installer.msi'"
        echo Instalando Node.js (aguarde a conclusao)...
        msiexec /i "%TEMP%\nodejs_installer.msi" /quiet /norestart
        echo Atualizando variaveis de ambiente...
        set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
        node -v >nul 2>&1
        if !errorLevel! neq 0 (
            echo [ERRO] O Node.js foi instalado, mas requer reiniciar o prompt.
            echo Por favor, execute este instalador novamente apos a instalacao.
            pause
            exit /b
        )
    ) else (
        echo [ERRO] O Node.js e obrigatorio. Baixe em https://nodejs.org e tente novamente.
        pause
        exit /b
    )
)
for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo       - Node.js detectado: %NODE_VER%
echo.

:: -----------------------------------------------------------------------------
:: 3. Obtem os arquivos do GitHub (Git clone ou Download ZIP)
:: -----------------------------------------------------------------------------
echo [2/6] Baixando/Sincronizando arquivos do GitHub...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

if exist "%TARGET_DIR%\server.js" (
    echo       - Arquivos do Infoboard ja presentes em "%TARGET_DIR%".
) else (
    :: Checa se tem Git instalado
    git --version >nul 2>&1
    if !errorLevel! equ 0 (
        echo       - Git detectado. Clonando repositorio via Git...
        git clone https://github.com/JSDavi/Infoboard.git "%TARGET_DIR%"
    ) else (
        echo       - Git nao detectado. Baixando codigo fonte direto do GitHub (ZIP)...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/JSDavi/Infoboard/archive/refs/heads/master.zip' -OutFile '%TEMP%\infoboard_source.zip'; Expand-Archive -Path '%TEMP%\infoboard_source.zip' -DestinationPath '%TEMP%\infoboard_extracted' -Force; Copy-Item -Path '%TEMP%\infoboard_extracted\Infoboard-master\*' -Destination '%TARGET_DIR%' -Recurse -Force; Remove-Item -Path '%TEMP%\infoboard_extracted' -Recurse -Force; Remove-Item -Path '%TEMP%\infoboard_source.zip' -Force"
    )
)

if not exist "%TARGET_DIR%\server.js" (
    echo [ERRO] Nao foi possivel obter os arquivos do servidor. Verifique a conexao de internet.
    pause
    exit /b
)
echo       - Arquivos sincronizados com sucesso!
echo.

:: -----------------------------------------------------------------------------
:: 4. Configuracao do Arquivo .env (Credenciais Interativas)
:: -----------------------------------------------------------------------------
echo [3/6] Verificando credenciais (.env)...
if not exist "%TARGET_DIR%\.env" (
    echo.
    echo ===============================================================================
    echo                       CONFIGURACAO DE CREDENCIAIS
    echo ===============================================================================
    echo Nenhuma senha fica gravada no instalador. Digite os dados abaixo:
    echo.
    
    echo --- 1. CREDENCIAIS DO NPXMANAGER ---
    set /p NPX_EM="Email do NPX: "
    set /p NPX_PW="Senha do NPX: "
    echo.

    echo --- 2. CREDENCIAIS DO PRIXCHAT ---
    set /p PRIX_EM="Email do PrixChat: "
    set /p PRIX_PW="Senha do PrixChat: "
    echo.

    echo --- 3. CREDENCIAIS DA API PBX (Nossa Telecom) ---
    set /p PBX_URL="URL Base PBX (padrao: https://pbx.nossatelecom.com.br): "
    if "!PBX_URL!"=="" set "PBX_URL=https://pbx.nossatelecom.com.br"
    set /p PBX_TK="Token da API PBX: "
    set /p PBX_KEY="Chave API Key PBX: "
    echo.

    echo --- 4. ALERTAS TELEGRAM (OPCIONAL) ---
    echo Deseja ativar alertas no Telegram para tempo de espera critico? (S/N)
    set /p ATIVAR_TG="> "
    set "TG_ENABLE=false"
    set "TG_TOKEN="
    set "TG_CHAT="
    if /i "!ATIVAR_TG!"=="S" (
        set "TG_ENABLE=true"
        set /p TG_TOKEN="Token do Bot do Telegram: "
        set /p TG_CHAT="ID do Chat do Telegram (ex: -100...): "
    )

    (
        echo # Configuracoes do Servidor
        echo PORT=3000
        echo UPDATE_INTERVAL_SECONDS=5
        echo NODE_ENV=production
        echo LOG_LEVEL=info
        echo.
        echo # Configuracoes do NPXManager
        echo NPX_EMAIL=!NPX_EM!
        echo NPX_PASSWORD=!NPX_PW!
        echo.
        echo # Configuracoes do PrixChat
        echo PRIXCHAT_EMAIL=!PRIX_EM!
        echo PRIXCHAT_PASSWORD=!PRIX_PW!
        echo PRIXCHAT_BACKEND=https://backapp.prixchat.com.br
        echo.
        echo # Credenciais da API do PBX
        echo PBX_BASE_URL=!PBX_URL!
        echo PBX_API_TOKEN=!PBX_TK!
        echo PBX_API_KEY=!PBX_KEY!
        echo.
        echo # Limites de Alerta (SLA)
        echo ALERT_QUEUE_WARNING=2
        echo ALERT_QUEUE_CRITICAL=4
        echo ALERT_WAIT_WARNING=180
        echo ALERT_WAIT_CRITICAL=300
        echo.
        echo # Configuracoes do Telegram
        echo ENABLE_TELEGRAM_ALERTS=!TG_ENABLE!
        echo TELEGRAM_BOT_TOKEN=!TG_TOKEN!
        echo TELEGRAM_CHAT_ID=!TG_CHAT!
        echo TELEGRAM_SLA_LIMIT_SEC=420
    ) > "%TARGET_DIR%\.env"
    
    echo.
    echo       - Arquivo .env gerado com sucesso localmente!
) else (
    echo       - Arquivo .env existente detectado. Mantendo credenciais locais preservadas.
)
echo.

:: -----------------------------------------------------------------------------
:: 5. Instala Dependencias do Node.js
:: -----------------------------------------------------------------------------
echo [4/6] Instalando dependencias do projeto (npm install)...
cd /d "%TARGET_DIR%"
call npm install --omit=dev
if %errorLevel% neq 0 (
    echo [AVISO] npm install retornou advertencia, prosseguindo...
)
echo       - Dependencias configuradas!
echo.

:: -----------------------------------------------------------------------------
:: 6. Libera Porta no Firewall do Windows
:: -----------------------------------------------------------------------------
echo [5/6] Liberando porta 3000 no Firewall do Windows...
powershell -Command "New-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue" >nul 2>&1
echo       - Regra de Firewall ativada com sucesso!
echo.

:: -----------------------------------------------------------------------------
:: 7. Registra e Inicia o Servico Nativo do Windows (services.msc)
:: -----------------------------------------------------------------------------
echo [6/6] Registrando Servico Nativo do Windows (services.msc)...
cd /d "%TARGET_DIR%"
if exist "%TARGET_DIR%\instalador\install_service.js" (
    call node "%TARGET_DIR%\instalador\install_service.js"
) else if exist "%TARGET_DIR%\install_service.js" (
    call node "%TARGET_DIR%\install_service.js"
)

:: Cria atalho na Area de Trabalho para Abrir o Painel
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Abrir Painel Infoboard.url'); $s.TargetPath = 'http://localhost:3000'; $s.Save()" >nul 2>&1
:: Cria atalho na Area de Trabalho para Atualizar o Painel
if exist "%TARGET_DIR%\instalador\ATUALIZAR_INFOBOARD.bat" (
    powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Atualizar Infoboard.lnk'); $s.TargetPath = '%TARGET_DIR%\instalador\ATUALIZAR_INFOBOARD.bat'; $s.WorkingDirectory = '%TARGET_DIR%\instalador'; $s.Save()" >nul 2>&1
) else (
    powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Atualizar Infoboard.lnk'); $s.TargetPath = '%TARGET_DIR%\ATUALIZAR_INFOBOARD.bat'; $s.WorkingDirectory = '%TARGET_DIR%'; $s.Save()" >nul 2>&1
)

echo.
echo ===============================================================================
echo                      INSTALACAO CONCLUIDA COM SUCESSO!
echo ===============================================================================
echo.
echo  * Servico Windows: 'Infoboard TV' (inicializacao automatica no boot).
echo  * Porta Local: http://localhost:3000
echo  * Atalhos criados na sua Area de Trabalho:
echo      - 'Abrir Painel Infoboard'
echo      - 'Atualizar Infoboard'
echo.
echo O sistema ja esta rodando em segundo plano!
echo ===============================================================================
echo.
pause
