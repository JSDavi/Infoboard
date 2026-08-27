@echo off
setlocal EnableDelayedExpansion
title Instalador Automatico - Infoboard TV

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
echo Repositorio Oficial: https://github.com/JSDavi/Infoboard.git
echo.

:: -----------------------------------------------------------------------------
:: 1. Define o Diretorio de Instalacao
:: -----------------------------------------------------------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

if exist "%SCRIPT_DIR%\..\server.js" (
    pushd "%SCRIPT_DIR%\.."
    set "TARGET_DIR=!CD!"
    popd
    echo [CONFIG] Modo: Instalacao a partir do diretorio local clonado.
) else if exist "%SCRIPT_DIR%\server.js" (
    set "TARGET_DIR=%SCRIPT_DIR%"
    echo [CONFIG] Modo: Instalacao no diretorio atual.
) else (
    set "TARGET_DIR=C:\Infoboard"
    echo [CONFIG] Modo: Nova instalacao no diretorio padrao.
)
echo [CONFIG] Diretorio de Destino: "!TARGET_DIR!"
echo ===============================================================================
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 1/6: Verificacao do Node.js
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 1/6] Verificando instalacao e versao do Node.js...
echo -------------------------------------------------------------------------------
echo  -^> Checando comando 'node' no sistema...

where node >nul 2>&1
if %errorLevel% neq 0 (
    goto :INSTALAR_NODE_PROMPT
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo  -^> [OK] Node.js detectado com sucesso: !NODE_VER!
echo.
goto :ETAPA_2

:INSTALAR_NODE_PROMPT
echo.
echo [ATENCAO] O Node.js NAO foi detectado neste computador!
echo O Node.js LTS e necessario para executar o Infoboard TV.
set /p INSTALAR_NODE="Deseja baixar e instalar o Node.js LTS automaticamente agora? [S/N]: "
if /i "!INSTALAR_NODE!"=="S" (
    echo  -^> Baixando instalador oficial do Node.js LTS...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\nodejs_installer.msi'"
    echo  -^> Instalando Node.js de forma silenciosa (aguarde alguns instantes)...
    msiexec /i "%TEMP%\nodejs_installer.msi" /quiet /norestart
    echo  -^> Atualizando caminhos do sistema no prompt atual...
    set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
    node -v >nul 2>&1
    if !errorLevel! neq 0 (
        echo.
        echo [AVISO] O Node.js foi instalado, mas requer reabrir o terminal.
        echo Por favor, execute este instalador novamente para continuar.
        pause
        exit /b
    )
    for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
    echo  -^> [OK] Node.js instalado com sucesso: !NODE_VER!
    echo.
) else (
    echo [ERRO] O Node.js e obrigatorio. Baixe manualmente em https://nodejs.org e execute novamente.
    pause
    exit /b
)

:: -----------------------------------------------------------------------------
:: ETAPA 2/6: Download / Sincronizacao dos Arquivos do GitHub
:: -----------------------------------------------------------------------------
:ETAPA_2
echo -------------------------------------------------------------------------------
echo [ETAPA 2/6] Baixando e Sincronizando arquivos do GitHub...
echo -------------------------------------------------------------------------------
if not exist "!TARGET_DIR!" mkdir "!TARGET_DIR!"

if exist "!TARGET_DIR!\server.js" (
    echo  -^> [OK] Arquivos do Infoboard ja estao presentes em "!TARGET_DIR!".
) else (
    git --version >nul 2>&1
    if !errorLevel! equ 0 (
        echo  -^> Git detectado. Clonando repositorio oficial...
        git clone https://github.com/JSDavi/Infoboard.git "!TARGET_DIR!"
    ) else (
        echo  -^> Git nao detectado. Baixando codigo fonte direto do GitHub (ZIP)...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/JSDavi/Infoboard/archive/refs/heads/master.zip' -OutFile '%TEMP%\infoboard_source.zip'; Expand-Archive -Path '%TEMP%\infoboard_source.zip' -DestinationPath '%TEMP%\infoboard_extracted' -Force; Copy-Item -Path '%TEMP%\infoboard_extracted\Infoboard-master\*' -Destination '!TARGET_DIR!' -Recurse -Force; Remove-Item -Path '%TEMP%\infoboard_extracted' -Recurse -Force; Remove-Item -Path '%TEMP%\infoboard_source.zip' -Force"
    )
)

if not exist "!TARGET_DIR!\server.js" (
    echo [ERRO] Nao foi possivel obter os arquivos do servidor. Verifique sua conexao de internet.
    pause
    exit /b
)
echo  -^> [OK] Arquivos do projeto prontos com sucesso!
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 3/6: Configuracao do Arquivo .env
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 3/6] Verificando arquivo de credenciais e configuracao (.env)...
echo -------------------------------------------------------------------------------
if not exist "!TARGET_DIR!\.env" (
    echo  -^> Arquivo .env nao encontrado. Iniciando assistente de credenciais:
    echo.
    echo ===============================================================================
    echo                       ASSISTENTE DE CONFIGURACAO (.ENV)
    echo ===============================================================================
    echo Nenhuma senha fica salva no instalador. Digite os dados solicitados abaixo:
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
    set /p ATIVAR_TG="Deseja ativar alertas no Telegram para SLA critico? [S/N]: "
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
    ) > "!TARGET_DIR!\.env"
    
    echo.
    echo  -^> [OK] Arquivo .env gerado e configurado com sucesso!
) else (
    echo  -^> [OK] Arquivo .env existente detectado. Mantendo credenciais atuais preservadas.
)
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 4/6: Instalacao das Dependencias do Node.js
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 4/6] Instalando dependencias e modulos do Node.js (npm install)...
echo -------------------------------------------------------------------------------
echo  -^> Executando 'npm install --omit=dev' em "!TARGET_DIR!"...
cd /d "!TARGET_DIR!"
call npm install --omit=dev
if %errorLevel% neq 0 (
    echo  -^> [AVISO] O npm retornou avisos, prosseguindo...
) else (
    echo  -^> [OK] Todos os modulos instalados com sucesso!
)
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 5/6: Liberacao de Porta no Firewall do Windows
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 5/6] Configurando regra de rede e Firewall do Windows...
echo -------------------------------------------------------------------------------
echo  -^> Liberando porta TCP 3000 para acesso de TVs e computadores da rede local...
powershell -Command "New-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue" >nul 2>&1
echo  -^> [OK] Regra de Firewall ativada!
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 6/6: Registro e Inicializacao do Servico Windows (services.msc)
:: -----------------------------------------------------------------------------
echo -------------------------------------------------------------------------------
echo [ETAPA 6/6] Registrando Servico Nativo do Windows (services.msc)...
echo -------------------------------------------------------------------------------
echo  -^> Configurando servico 'Infoboard TV' para inicio automatico no boot...
cd /d "!TARGET_DIR!"
if exist "!TARGET_DIR!\instalador\install_service.js" (
    call node "!TARGET_DIR!\instalador\install_service.js"
) else if exist "!TARGET_DIR!\install_service.js" (
    call node "!TARGET_DIR!\install_service.js"
)

echo  -^> Criando atalhos uteis na Area de Trabalho...
:: Atalho 1: Abrir o Painel no Navegador
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Abrir Painel Infoboard.url'); $s.TargetPath = 'http://localhost:3000'; $s.Save()" >nul 2>&1
:: Atalho 2: Atualizar o Infoboard via GitHub
if exist "!TARGET_DIR!\instalador\ATUALIZAR_INFOBOARD.bat" (
    powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Atualizar Infoboard.lnk'); $s.TargetPath = '!TARGET_DIR!\instalador\ATUALIZAR_INFOBOARD.bat'; $s.WorkingDirectory = '!TARGET_DIR!\instalador'; $s.Save()" >nul 2>&1
) else (
    powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Atualizar Infoboard.lnk'); $s.TargetPath = '!TARGET_DIR!\ATUALIZAR_INFOBOARD.bat'; $s.WorkingDirectory = '!TARGET_DIR!'; $s.Save()" >nul 2>&1
)
echo  -^> [OK] Atalhos criados na Area de Trabalho!
echo.

:: -----------------------------------------------------------------------------
:: Finalizacao e Relatorio
:: -----------------------------------------------------------------------------
echo ===============================================================================
echo                      INSTALACAO CONCLUIDA COM SUCESSO!
echo ===============================================================================
echo.
echo  * Servico Windows: 'Infoboard TV' (executa automaticamente no boot do Windows).
echo  * URL Local: http://localhost:3000
echo  * Atalhos na Area de Trabalho:
echo      - 'Abrir Painel Infoboard' (abre o painel na TV / navegador)
echo      - 'Atualizar Infoboard' (baixa atualizacoes do GitHub com 1 clique)
echo.
echo O Infoboard TV ja esta rodando em segundo plano!
echo ===============================================================================
echo.
pause
