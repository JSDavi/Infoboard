@echo off
setlocal EnableDelayedExpansion
title Instalador e Configurador Automatico - Infoboard

:: Verifica privilegios de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ================================================================
    echo [AVISO] Solicitando permissoes de Administrador...
    echo ================================================================
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
set "APP_DIR=%~dp0"
:: Remove barra invertida final se houver
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

cls
echo ===============================================================================
echo            INFOBRASIL - INSTALADOR AUTOMATICO DO INFOBOARD
echo ===============================================================================
echo.
echo Diretorio de Instalacao Detectado:
echo "%APP_DIR%"
echo.
echo ===============================================================================
echo.

:: 1. Verifica se o Node.js esta instalado
echo [1/5] Verificando instalacao do Node.js...
node -v >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema!
    echo Por favor, baixe e instale o Node.js em: https://nodejs.org
    echo Apos instalar, execute este instalador novamente.
    echo.
    pause
    exit /b
)
for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo       - Node.js detectado com sucesso: %NODE_VER%
echo.

:: 2. Instala dependencias do projeto
echo [2/5] Instalando dependencias necessarias (npm install)...
call npm install
if %errorLevel% neq 0 (
    echo [AVISO] Ocorreu uma advertencia no npm install, continuando...
)
echo.

:: 3. Verifica arquivo de credenciais .env
echo [3/5] Verificando arquivo de configuracao (.env)...
if not exist "%APP_DIR%\.env" (
    echo.
    echo [ATENCAO] O arquivo .env nao foi encontrado nesta pasta!
    echo Deseja criar o arquivo .env agora com suas credenciais? (S/N)
    set /p CRIAR_ENV="> "
    if /i "!CRIAR_ENV!"=="S" (
        echo.
        echo --- CONFIGURACAO DE CREDENCIAIS ---
        set /p NPX_EM="Email NPX (ex: supervisor@infobrasilsistemas.com.br): "
        set /p NPX_PW="Senha NPX: "
        set /p PRIX_EM="Email PrixChat (ex: painel@infobrasil.com.br): "
        set /p PRIX_PW="Senha PrixChat: "
        set /p PBX_TK="Token PBX Nossatel (se houver, ou deixe em branco): "
        
        (
            echo PORT=3000
            echo UPDATE_INTERVAL_SECONDS=6
            echo NPX_EMAIL=!NPX_EM!
            echo NPX_PASSWORD=!NPX_PW!
            echo PRIXCHAT_EMAIL=!PRIX_EM!
            echo PRIXCHAT_PASSWORD=!PRIX_PW!
            echo PRIXCHAT_BACKEND=https://backapp.prixchat.com.br
            echo PBX_API_URL=https://nossatelecom.pabxonline.net.br/api/v2
            echo PBX_API_TOKEN=!PBX_TK!
        ) > "%APP_DIR%\.env"
        echo       - Arquivo .env criado com sucesso!
    ) else (
        echo       - Nao esqueca de copiar o seu arquivo .env para esta pasta!
    )
) else (
    echo       - Arquivo .env encontrado com sucesso!
)
echo.

:: 4. Configuracao do Firewall do Windows
echo [4/5] Liberando porta 3000 no Firewall do Windows...
powershell -Command "New-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue" >nul 2>&1
echo       - Regra de Firewall criada/atualizada com sucesso!
echo.

:: 5. Criando Servico no Windows (Inicializacao no Boot + Auto-Recuperacao)
echo [5/5] Configurando Servico do Windows (Inicializacao no Boot e Auto-Recuperacao)...
set "VBS_SCRIPT=%APP_DIR%\start_infoboard_silent.vbs"

:: Cria tarefa agendada como SYSTEM que roda no Boot da maquina (sem precisar de login)
schtasks /delete /tn "Infoboard_Server_AutoStart" /f >nul 2>&1
schtasks /create /tn "Infoboard_Server_AutoStart" /tr "wscript.exe \"%VBS_SCRIPT%\"" /sc onstart /ru "SYSTEM" /rl highest /f >nul 2>&1

if %errorLevel% neq 0 (
    :: Fallback para onlogon se onstart falhar por permissao de maquina
    schtasks /create /tn "Infoboard_Server_AutoStart" /tr "wscript.exe \"%VBS_SCRIPT%\"" /sc onlogon /rl highest /f >nul 2>&1
)

if %errorLevel% equ 0 (
    echo       - Servico 'Infoboard_Server_AutoStart' configurado com sucesso!
    echo       - [OK] Inicializa sozinho ao ligar o computador (sem precisar de login).
    echo       - [OK] Watchdog Ativo: Se o servidor cair, se recupera sozinho em 2s.
) else (
    echo       - [AVISO] Nao foi possivel criar o servico automaticamente.
)
echo.

echo ===============================================================================
echo                      INSTALACAO CONCLUIDA COM SUCESSO!
echo ===============================================================================
echo.
echo O Infoboard esta pronto para rodar neste servidor.
echo.
echo Deseja INICIAR o servidor do Infoboard agora mesmo? (S/N)
set /p INICIAR="> "
if /i "!INICIAR!"=="S" (
    schtasks /run /tn "Infoboard_Server_AutoStart" >nul 2>&1 || (
        start "" wscript.exe "%VBS_SCRIPT%"
    )
    echo.
    echo [OK] Servidor iniciado com sucesso em segundo plano na porta 3000!
    echo Voce pode acessar na rede local pelo IP deste servidor na porta 3000.
)

echo.
echo Pressione qualquer tecla para sair...
pause >nul
