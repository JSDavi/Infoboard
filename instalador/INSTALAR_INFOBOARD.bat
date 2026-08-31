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
    echo Uma nova janela sera aberta em Modo Administrador.
    echo Por favor, clique em "Sim" quando o Windows solicitar.
    echo ===============================================================================
    timeout /t 3 >nul
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs" 2>nul
    if !errorLevel! neq 0 (
        echo.
        echo ===============================================================================
        echo [ATENCAO] E necessario executar este instalador como Administrador.
        echo.
        echo 1. Clique com o BOTAO DIREITO em 'INSTALAR_INFOBOARD.bat'
        echo 2. Selecione a opcao 'Executar como Administrador'
        echo ===============================================================================
        echo.
        pause
    )
    exit /b
)

:: Garante que o diretorio atual seja a pasta do script
cd /d "%~dp0"

cls
echo ===============================================================================
echo            INFOBRASIL - INSTALADOR COMPLETO DO INFOBOARD TV
echo ===============================================================================
echo Repositorio Oficial: https://github.com/JSDavi/Infoboard.git
echo.

:: -----------------------------------------------------------------------------
:: 1. Define o Diretorio de Instalacao
:: -----------------------------------------------------------------------------
set "TARGET_DIR=C:\Infoboard"
echo ===============================================================================
echo [CONFIGURACAO] Escolha o Diretorio de Instalacao
echo ===============================================================================
set /p USER_DIR="Informe o diretorio para instalar o Infoboard (Pressione ENTER para usar !TARGET_DIR!): "
if not "!USER_DIR!"=="" set "TARGET_DIR=!USER_DIR!"

echo.
echo [CONFIG] Diretorio de Destino: "!TARGET_DIR!"
echo ===============================================================================
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 1/6: Verificacao do Node.js
:: -----------------------------------------------------------------------------
:ETAPA_1
echo -------------------------------------------------------------------------------
echo [ETAPA 1/6] Verificando instalacao e versao do Node.js...
echo -------------------------------------------------------------------------------
echo  -^> Checando Node.js no sistema...

node -v >nul 2>&1
if %errorLevel% equ 0 goto :NODE_JA_INSTALADO

where node >nul 2>&1
if %errorLevel% equ 0 goto :NODE_JA_INSTALADO

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;!PATH!"
    goto :NODE_JA_INSTALADO
)

goto :NODE_NAO_ENCONTRADO

:NODE_JA_INSTALADO
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
if "!NODE_VER!"=="" set "NODE_VER=Detectado"
echo  -^> [OK] Node.js detectado com sucesso: !NODE_VER!
echo.
goto :ETAPA_2

:NODE_NAO_ENCONTRADO
echo.
echo ===============================================================================
echo [ATENCAO] O Node.js NAO foi detectado neste computador!
echo O Node.js LTS e necessario para executar o Infoboard TV.
echo ===============================================================================
set /p INSTALAR_NODE="Deseja baixar e instalar o Node.js LTS automaticamente agora? [S/N]: "
if /i not "!INSTALAR_NODE!"=="S" goto :NODE_RECUSADO

echo  -^> Baixando instalador oficial do Node.js LTS para Windows Server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\nodejs_installer.msi' -UseBasicParsing"
if %errorLevel% neq 0 (
    call :ERRO_FATAL "ETAPA 1/6 - Node.js" "Falha ao baixar o instalador do Node.js."
    exit /b
)

echo  -^> Instalando Node.js de forma silenciosa... Aguarde a conclusao...
msiexec /i "%TEMP%\nodejs_installer.msi" /quiet /norestart
if %errorLevel% neq 0 (
    call :ERRO_FATAL "ETAPA 1/6 - Node.js" "Falha durante a instalacao do Node.js."
    exit /b
)

echo  -^> Atualizando variaveis de ambiente...
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;!PATH!"

node -v >nul 2>&1
if %errorLevel% neq 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;!PATH!"
    )
)

node -v >nul 2>&1
if %errorLevel% neq 0 (
    call :ERRO_FATAL "ETAPA 1/6 - Node.js" "Node.js instalado, mas requer reiniciar o prompt. Execute o instalador novamente."
    exit /b
)

for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo  -^> [OK] Node.js instalado com sucesso: !NODE_VER!
echo.
goto :ETAPA_2

:NODE_RECUSADO
call :ERRO_FATAL "ETAPA 1/6 - Node.js" "O Node.js e obrigatorio. Instalacao recusada pelo usuario."
exit /b

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
    goto :ETAPA_2_OK
)

set "DOWNLOAD_OK=0"
where git >nul 2>&1
if %errorLevel% equ 0 (
    echo  -^> Git detectado. Clonando repositorio oficial modo anonimo...
    git -c core.askPass= -c credential.helper= clone https://github.com/JSDavi/Infoboard.git "!TARGET_DIR!" >nul 2>&1
    if exist "!TARGET_DIR!\server.js" set "DOWNLOAD_OK=1"
)

if "!DOWNLOAD_OK!"=="1" goto :ETAPA_2_OK

echo  -^> Baixando codigo fonte direto do GitHub pacote ZIP...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/JSDavi/Infoboard/archive/refs/heads/master.zip' -OutFile '%TEMP%\infoboard_source.zip' -UseBasicParsing; Expand-Archive -Path '%TEMP%\infoboard_source.zip' -DestinationPath '%TEMP%\infoboard_extracted' -Force; Copy-Item -Path '%TEMP%\infoboard_extracted\Infoboard-master\*' -Destination '!TARGET_DIR!' -Recurse -Force -Verbose; Remove-Item -Path '%TEMP%\infoboard_extracted' -Recurse -Force; Remove-Item -Path '%TEMP%\infoboard_source.zip' -Force"

if not exist "!TARGET_DIR!\server.js" (
    call :ERRO_FATAL "ETAPA 2/6 - Download" "Nao foi possivel obter os arquivos do servidor. Verifique sua conexao."
    exit /b
)

:ETAPA_2_OK
echo  -^> [OK] Arquivos do projeto prontos com sucesso!
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 3/6: Configuracao do Arquivo .env
:: -----------------------------------------------------------------------------
:ETAPA_3
echo -------------------------------------------------------------------------------
echo [ETAPA 3/6] Verificando arquivo de credenciais e configuracao (.env)...
echo -------------------------------------------------------------------------------
if exist "!TARGET_DIR!\.env" (
    echo  -^> [OK] Arquivo .env existente detectado. Mantendo credenciais atuais preservadas.
    goto :ETAPA_3_OK
)

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
if %errorLevel% neq 0 (
    call :ERRO_FATAL "ETAPA 3/6 - Config .env" "Nao foi possivel criar o arquivo .env no diretorio alvo."
    exit /b
)

echo.
echo  -^> [OK] Arquivo .env gerado e configurado com sucesso!

:ETAPA_3_OK
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 4/6: Instalacao das Dependencias do Node.js
:: -----------------------------------------------------------------------------
:ETAPA_4
echo -------------------------------------------------------------------------------
echo [ETAPA 4/6] Instalando dependencias e modulos do Node.js (npm install)...
echo -------------------------------------------------------------------------------
echo  -^> Executando 'npm install --omit=dev' em "!TARGET_DIR!"...
cd /d "!TARGET_DIR!"
call npm install --omit=dev
if %errorLevel% neq 0 (
    call :ERRO_FATAL "ETAPA 4/6 - Dependencias" "Falha ao instalar pacotes NPM."
    exit /b
) else (
    echo  -^> [OK] Todos os modulos instalados com sucesso!
)
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 5/6: Liberacao de Porta no Firewall do Windows
:: -----------------------------------------------------------------------------
:ETAPA_5
echo -------------------------------------------------------------------------------
echo [ETAPA 5/6] Configurando regra de rede e Firewall do Windows...
echo -------------------------------------------------------------------------------
echo  -^> Liberando porta TCP 3000 para acesso de TVs e computadores da rede local...
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue" >nul 2>&1
echo  -^> [OK] Regra de Firewall ativada!
echo.

:: -----------------------------------------------------------------------------
:: ETAPA 6/6: Registro e Inicializacao do Servico Windows (services.msc)
:: -----------------------------------------------------------------------------
:ETAPA_6
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
if %errorLevel% neq 0 (
    call :ERRO_FATAL "ETAPA 6/6 - Servico Windows" "Falha ao registrar ou iniciar o servico do Infoboard."
    exit /b
)

echo  -^> Criando atalhos uteis na Area de Trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d1 = [Environment]::GetFolderPath('Desktop'); $d2 = [Environment]::GetFolderPath('CommonDesktopDirectory'); foreach($d in @($d1, $d2)) { if($d -and (Test-Path $d)) { $s = $ws.CreateShortcut((Join-Path $d 'Abrir Painel Infoboard.url')); $s.TargetPath = 'http://localhost:3000'; $s.Save(); } }" >nul 2>&1

if exist "!TARGET_DIR!\instalador\ATUALIZAR_INFOBOARD.bat" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d1 = [Environment]::GetFolderPath('Desktop'); $d2 = [Environment]::GetFolderPath('CommonDesktopDirectory'); foreach($d in @($d1, $d2)) { if($d -and (Test-Path $d)) { $s = $ws.CreateShortcut((Join-Path $d 'Atualizar Infoboard.lnk')); $s.TargetPath = '!TARGET_DIR!\instalador\ATUALIZAR_INFOBOARD.bat'; $s.WorkingDirectory = '!TARGET_DIR!\instalador'; $s.Save(); } }" >nul 2>&1
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d1 = [Environment]::GetFolderPath('Desktop'); $d2 = [Environment]::GetFolderPath('CommonDesktopDirectory'); foreach($d in @($d1, $d2)) { if($d -and (Test-Path $d)) { $s = $ws.CreateShortcut((Join-Path $d 'Atualizar Infoboard.lnk')); $s.TargetPath = '!TARGET_DIR!\ATUALIZAR_INFOBOARD.bat'; $s.WorkingDirectory = '!TARGET_DIR!'; $s.Save(); } }" >nul 2>&1
)
echo  -^> [OK] Atalhos criados com sucesso!
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
