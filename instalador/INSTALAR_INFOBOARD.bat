@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title Instalador do Infoboard TV - Infobrasil

:: =============================================================================
:: CONFIGURACAO DE AMBIENTE E CORES ANSI
:: =============================================================================
reg add "HKCU\Console" /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
for /f "delims=" %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"

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
goto :INICIAR_INSTALACAO

:SOLICITAR_ELEVACAO
cls
echo.
echo ===============================================================================
echo                    !C_CYAN!!C_BOLD!INFOBRASIL - INSTALADOR DO INFOBOARD TV!C_RESET!
echo ===============================================================================
echo.
echo !C_YELLOW!!C_BOLD![AVISO DE ELEVACAO] Privilegios de Administrador Necessarios!C_RESET!
echo.
echo  Para realizar a instalacao completa do Infoboard TV, este assistente
echo  precisa de permissoes administrativas do Windows para:
echo.
echo    1. Instalar e registrar o Servico Nativo do Windows (services.msc)
echo    2. Criar regras de liberacao de porta (3000) no Windows Defender Firewall
echo    3. Instalar o Node.js LTS (caso ainda nao esteja presente no sistema)
echo    4. Criar atalhos na Area de Trabalho Publica (para todos os usuarios)
echo.
echo -------------------------------------------------------------------------------
echo !C_WHITE!Uma janela de solicitacao do Windows (UAC) sera exibida ao confirmar.!C_RESET!
echo.
set /p "UAC_CONFIRM=Deseja abrir a solicitacao de Administrador agora? (S/N) [S]: "
if "!UAC_CONFIRM!"=="" set "UAC_CONFIRM=S"

if /i "!UAC_CONFIRM!"=="S" (
    echo.
    echo !C_CYAN!Solicitando elevacao ao Windows... Aguarde...!C_RESET!
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs" 2>nul
    if !errorLevel! neq 0 (
        echo.
        echo !C_RED!!C_BOLD![FALHA] A solicitacao de elevacao foi negada ou falhou.!C_RESET!
        echo !C_YELLOW!Para prosseguir manualmente:!C_RESET!
        echo   1. Clique com o botao direito no arquivo 'INSTALAR_INFOBOARD.bat'
        echo   2. Selecione a opcao 'Executar como Administrador'
        echo.
        pause
    )
    exit /b 0
) else (
    echo.
    echo !C_YELLOW!Instalacao cancelada pelo usuario antes da elevacao.!C_RESET!
    pause
    exit /b 0
)

:INICIAR_INSTALACAO
:: Ancorar diretorio atual no diretorio onde o script esta localizado
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: =============================================================================
:: CABECALHO PRINCIPAL E VISUAL DAS ETAPAS
:: =============================================================================
cls
echo ===============================================================================
echo                    !C_CYAN!!C_BOLD!INFOBRASIL - INSTALADOR DO INFOBOARD TV!C_RESET!
echo ===============================================================================
echo !C_GRAY!  Versao: 1.2.6 ^| Pacote local de distribuicao!C_RESET!
echo.
echo !C_BOLD!Etapas do Assistente de Instalacao:!C_RESET!
echo   !C_CYAN![ 1/6 ]!C_RESET! Verificacao e Preparacao do Node.js LTS
echo   !C_CYAN![ 2/6 ]!C_RESET! Selecao de Pasta e Copia de Arquivos do Projeto
echo   !C_CYAN![ 3/6 ]!C_RESET! Assistente de Configuracao de Ambiente e Credenciais (.env)
echo   !C_CYAN![ 4/6 ]!C_RESET! Instalacao de Dependencias de Producao (npm ci)
echo   !C_CYAN![ 5/6 ]!C_RESET! Liberacao de Porta no Windows Defender Firewall (Porta 3000)
echo   !C_CYAN![ 6/6 ]!C_RESET! Registro do Servico Windows (services.msc) e Criacao de Atalhos
echo ===============================================================================
echo.

:: =============================================================================
:: ETAPA 1/6: VERIFICACAO E PREPARACAO DO NODE.JS LTS
:: =============================================================================
:ETAPA_1
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 1/6 ] Verificacao e Preparacao do Node.js LTS!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Checando presenca do Node.js no sistema...!C_RESET!

:: Mesmo contrato seguro do atualizador: Node >=22 com npm funcional.
:: Reaproveita um runtime compativel; caso contrario usa o MSI LTS verificado,
:: confere SHA256 e assinatura digital antes de instalar.
set "NODE_RUNTIME_FILE=%TEMP%\infoboard-node-%RANDOM%%RANDOM%.txt"
powershell.exe -NoLogo -NoProfile -Command ^
    "$ErrorActionPreference='Stop'; try { "^
    "  $helper=Join-Path $env:SCRIPT_DIR 'ensure-node.ps1'; "^
    "  if(-not (Test-Path -LiteralPath $helper -PathType Leaf)){throw 'Arquivo ensure-node.ps1 ausente'}; "^
    "  . $helper; "^
    "  $runtime=Invoke-IBEnsureNode -LogDirectory (Join-Path $env:LOCALAPPDATA 'Infoboard\installer-logs'); "^
    "  if($runtime.RebootRequired){Write-Host '[Node] Reinicie o Windows e execute o instalador novamente.'; exit 10}; "^
    "  Write-Output ('IB_NODE_DIR=' + [IO.Path]::GetDirectoryName($runtime.NodePath)); exit 0 "^
    "} catch {Write-Host '[Node] Falha na validacao/instalacao. Confira o diagnostico exibido acima.'; exit 1}" > "!NODE_RUNTIME_FILE!" 2>&1
set "NODE_RESULT=!errorlevel!"
if exist "!NODE_RUNTIME_FILE!" type "!NODE_RUNTIME_FILE!"
set "NODE_DIR="
if "!NODE_RESULT!"=="0" (
    for /f "usebackq tokens=1,* delims==" %%a in ("!NODE_RUNTIME_FILE!") do (
        if "%%a"=="IB_NODE_DIR" set "NODE_DIR=%%b"
    )
)
if exist "!NODE_RUNTIME_FILE!" del /q "!NODE_RUNTIME_FILE!" >nul 2>&1
if "!NODE_RESULT!"=="10" (
    call :ERRO_FATAL "ETAPA 1/6 - Reinicio Node.js" "105" "O Node.js requer reinicio do Windows para concluir a instalacao." "Reinicie o computador e execute o instalador novamente."
    exit /b 1
)
if not "!NODE_RESULT!"=="0" (
    call :ERRO_FATAL "ETAPA 1/6 - Node.js" "101" "Nao foi possivel validar ou instalar o Node.js." "Confira o arquivo ensure-node.ps1, internet, permissoes e logs privados do instalador."
    exit /b 1
)
if not defined NODE_DIR (
    call :ERRO_FATAL "ETAPA 1/6 - Node.js" "104" "O runtime validado nao informou a pasta do Node.js." "Confira os logs privados do instalador."
    exit /b 1
)
set "PATH=!NODE_DIR!;!PATH!"
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
if not defined NODE_VER (
    call :ERRO_FATAL "ETAPA 1/6 - Node.js" "104" "Node.js validado mas indisponivel nesta sessao." "Confira o runtime e os logs privados do instalador."
    exit /b 1
)
echo   !C_GREEN![OK] Node.js e npm compativeis: !NODE_VER!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 2/6: SELECAO DE PASTA E COPIA DE ARQUIVOS DO PROJETO
:: =============================================================================
:ETAPA_2
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 2/6 ] Selecao de Pasta e Preparacao dos Arquivos!C_RESET!
echo -------------------------------------------------------------------------------

:: Definir pasta padrao sugerida
set "DEFAULT_TARGET=C:\Infoboard"
set "TARGET_DIR=!DEFAULT_TARGET!"

echo Escolha como deseja definir a pasta de instalacao:
echo   !C_WHITE![ENTER]!C_RESET! Usar o diretorio padrao recomendado: !C_CYAN!!DEFAULT_TARGET!!C_RESET!
echo   !C_WHITE![  G  ]!C_RESET! Abrir janela grafica do Windows para procurar pasta
echo   !C_WHITE![  M  ]!C_RESET! Digitar um caminho personalizado no console
echo.
set /p "CHOICE_DIR=Opcao desejada [ENTER/G/M]: "

if /i "!CHOICE_DIR!"=="G" goto :SELECIONAR_GUI
if /i "!CHOICE_DIR!"=="M" goto :SELECIONAR_MANUAL
if "!CHOICE_DIR!"=="" goto :PASTA_DEFINIDA

:: Se o usuario colou ou digitou um caminho diretamente:
set "TARGET_DIR=!CHOICE_DIR!"
goto :PASTA_DEFINIDA

:SELECIONAR_GUI
echo.
echo   !C_CYAN!* Abrindo seletor grafico de pastas do Windows...!C_RESET!
set "SELECTED_GUI="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command ^
    "Add-Type -AssemblyName System.Windows.Forms; "^
    "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "^
    "$f.Description = 'Selecione a pasta de instalacao para o Infoboard TV:'; "^
    "$f.ShowNewFolderButton = $true; "^
    "if (Test-Path '!DEFAULT_TARGET!') { $f.SelectedPath = '!DEFAULT_TARGET!' }; "^
    "$top = New-Object System.Windows.Forms.Form; "^
    "$top.TopMost = $true; $top.MinimizeBox = $false; $top.MaximizeBox = $false; $top.ShowInTaskbar = $false; "^
    "if ($f.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"`) do (
    set "SELECTED_GUI=%%I"
)

if defined SELECTED_GUI (
    set "TARGET_DIR=!SELECTED_GUI!"
    goto :PASTA_DEFINIDA
) else (
    echo   !C_YELLOW![AVISO] Nenhuma pasta selecionada na janela grafica. Usando fallback manual.!C_RESET!
)

:SELECIONAR_MANUAL
echo.
set /p "TARGET_DIR=Digite o caminho completo da pasta [Padrao: !DEFAULT_TARGET!]: "
if "!TARGET_DIR!"=="" set "TARGET_DIR=!DEFAULT_TARGET!"

:PASTA_DEFINIDA
:: Sanitizacao rigorosa do caminho: remover aspas duplas e barras invertidas no final
set "TARGET_DIR=!TARGET_DIR:"=!"
if "!TARGET_DIR:~-1!"=="\" set "TARGET_DIR=!TARGET_DIR:~0,-1!"
if "!TARGET_DIR:~-1!"=="/" set "TARGET_DIR=!TARGET_DIR:~0,-1!"
if "!TARGET_DIR:~-1!"==":" set "TARGET_DIR=!TARGET_DIR!\"

echo.
echo   !C_WHITE!Diretorio de Instalacao Definido:!C_RESET! !C_CYAN!!C_BOLD!!TARGET_DIR!!C_RESET!

:: Instalacao nova: nunca assumir propriedade de outro servico do InfoBoard.
if exist "!TARGET_DIR!\server.js" (
    call :ERRO_FATAL "ETAPA 2/6 - Instalacao existente" "205" "Ja ha fontes do InfoBoard na pasta selecionada." "Use o ATUALIZAR_INFOBOARD.bat para uma instalacao existente."
    exit /b 1
)
powershell.exe -NoLogo -NoProfile -Command ^
    "$ErrorActionPreference='Stop'; try { "^
    "  $existing=@(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { $_.Name -match '(?i)infoboard' -or $_.DisplayName -match '(?i)infoboard' }); "^
    "  if($existing.Count -gt 0){exit 2}; exit 0 "^
    "} catch {exit 3}"
if errorlevel 1 (
    call :ERRO_FATAL "ETAPA 2/6 - Servico existente" "206" "Ja existe um servico InfoBoard ou a consulta de servicos falhou." "Confira services.msc e use o atualizador para uma instalacao existente."
    exit /b 1
)

:: Criar diretorio se nao existir
if not exist "!TARGET_DIR!" (
    echo   !C_GRAY!* Criando pasta de destino...!C_RESET!
    mkdir "!TARGET_DIR!" >nul 2>&1
    if not exist "!TARGET_DIR!" (
        call :ERRO_FATAL "ETAPA 2/6 - Criacao de Pasta" "201" "Nao foi possivel criar a pasta de destino '!TARGET_DIR!'." "Verifique se possui permissoes no disco ou se o caminho contem caracteres invalidos."
        exit /b 1
    )
)

:: -----------------------------------------------------------------------------
:: MATRIZ HIERARQUICA DE OBTENCAO DOS ARQUIVOS (LOCAL vs REMOTO)
:: -----------------------------------------------------------------------------
echo   !C_GRAY!* Identificando fonte dos arquivos do projeto...!C_RESET!

:: Localizar possivel raiz local do projeto (diretorio pai do script)
set "LOCAL_SOURCE="
if exist "%SCRIPT_DIR%\..\server.js" (
    pushd "%SCRIPT_DIR%\.."
    set "LOCAL_SOURCE=!CD!"
    popd
) else if exist "%SCRIPT_DIR%\server.js" (
    set "LOCAL_SOURCE=%SCRIPT_DIR%"
)

set "COPIA_REALIZADA=0"

:: Caso 1: A instalacao e no proprio diretorio da fonte local
if defined LOCAL_SOURCE (
    if /i "!LOCAL_SOURCE!"=="!TARGET_DIR!" (
        echo   !C_GREEN![OK] Instalacao in-place detectada. Arquivos ja presentes na raiz.!C_RESET!
        set "COPIA_REALIZADA=1"
        goto :VALIDAR_ARQUIVOS_DESTINO
    )
)

:: Caso 2: copia somente arquivos publicaveis, sem estado local de agentes,
:: credenciais, backups, artefatos de homologacao ou diretorio .git.
if defined LOCAL_SOURCE (
    if exist "!LOCAL_SOURCE!\server.js" (
        echo   !C_CYAN!* Copiando somente arquivos de distribuicao do projeto...!C_RESET!
        if not exist "!LOCAL_SOURCE!\scripts\copy-local-install.cjs" (
            call :ERRO_FATAL "ETAPA 2/6 - Fonte local" "203" "Pacote local sem script de copia segura." "Use a distribuicao completa e atualizada do InfoBoard."
            exit /b 1
        )
        node "!LOCAL_SOURCE!\scripts\copy-local-install.cjs" "!LOCAL_SOURCE!" "!TARGET_DIR!"
        if !errorlevel! equ 0 (
            echo   !C_GREEN![OK] Arquivos permitidos copiados com sucesso.!C_RESET!
            set "COPIA_REALIZADA=1"
            goto :VALIDAR_ARQUIVOS_DESTINO
        ) else (
            call :ERRO_FATAL "ETAPA 2/6 - Copia local" "204" "A copia dos arquivos publicaveis falhou." "Confira as permissoes, espaco em disco e arquivos da distribuicao."
            exit /b 1
        )
    )
)

:: Nao consumir a master remota para instalacao nova; o ZIP homologado inclui
:: todas as fontes publicaveis, enquanto o GitHub pode estar em outra revisao.
call :ERRO_FATAL "ETAPA 2/6 - Fonte local ausente" "207" "O Instalador precisa ser executado a partir do pacote completo do InfoBoard." "Extraia InfoBoard-source.zip e execute o BAT da pasta InfoBoard\instalador."
exit /b 1

:VALIDAR_ARQUIVOS_DESTINO
if not exist "!TARGET_DIR!\server.js" (
    call :ERRO_FATAL "ETAPA 2/6 - Preparacao de Arquivos" "202" "Arquivo principal 'server.js' nao encontrado em '!TARGET_DIR!'." "Verifique o acesso a internet ou se a pasta de origem possui os arquivos completos do projeto."
    exit /b 1
)

echo   !C_GREEN![OK] Estrutura de arquivos do Infoboard TV validada com sucesso!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 3/6: ASSISTENTE DE CONFIGURACAO E CREDENCIAIS (.ENV)
:: =============================================================================
:ETAPA_3
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 3/6 ] Assistente de Configuracao (.env)!C_RESET!
echo -------------------------------------------------------------------------------

if exist "!TARGET_DIR!\.env" (
    echo   !C_GREEN![OK] Arquivo .env existente detectado em '!TARGET_DIR!\.env'.!C_RESET!
    echo.
    set /p "RECONF_ENV=Deseja manter as configuracoes atuais do .env? [S/N] [S]: "
    if "!RECONF_ENV!"=="" set "RECONF_ENV=S"
    if /i "!RECONF_ENV!"=="S" (
        echo   !C_GREEN![OK] Credenciais e configuracoes atuais preservadas.!C_RESET!
        echo.
        goto :ETAPA_4
    )
)

echo.
echo ===============================================================================
echo                    !C_CYAN!!C_BOLD!ASSISTENTE DE CONFIGURACAO DE CREDENCIAIS!C_RESET!
echo ===============================================================================
echo !C_GRAY!Os dados informados serao gravados com seguranca no arquivo .env local.!C_RESET!
echo.

echo !C_WHITE!!C_BOLD!--- 1. Credenciais do NPXManager ---!C_RESET!
set /p "NPX_EM=Email de acesso ao NPX: "
set /p "NPX_PW=Senha de acesso ao NPX: "
echo.

echo !C_WHITE!!C_BOLD!--- 2. Credenciais do PrixChat ---!C_RESET!
set /p "PRIX_EM=Email de acesso ao PrixChat: "
set /p "PRIX_PW=Senha de acesso ao PrixChat: "
echo.

echo !C_WHITE!!C_BOLD!--- 3. Credenciais da API PBX (Nossa Telecom) ---!C_RESET!
set /p "PBX_URL=URL Base da API PBX [Padrao: https://sip33.tsinfo.net.br]: "
if "!PBX_URL!"=="" set "PBX_URL=https://sip33.tsinfo.net.br"
set /p "PBX_TK=Token da API PBX: "
set /p "PBX_KEY=Chave API Key PBX: "
echo.

echo !C_WHITE!!C_BOLD!--- 4. Alertas no Telegram (Opcional) ---!C_RESET!
set /p "ATIVAR_TG=Deseja habilitar alertas de SLA critico no Telegram? (S/N) [N]: "
if "!ATIVAR_TG!"=="" set "ATIVAR_TG=N"
set "TG_ENABLE=false"
set "TG_TOKEN="
set "TG_CHAT="
if /i "!ATIVAR_TG!"=="S" (
    set "TG_ENABLE=true"
    set /p "TG_TOKEN=Token do Bot do Telegram: "
    set /p "TG_CHAT=ID do Chat do Telegram (ex: -100...): "
)

echo.
echo   !C_CYAN!* Restringindo permissoes de acesso (ACL: Usuario Atual + SYSTEM) antes de gravar segredos...!C_RESET!
set "ENV_ACL_HELPER=%~dp0protect-env.ps1"
if not exist "!ENV_ACL_HELPER!" set "ENV_ACL_HELPER=!TARGET_DIR!\instalador\protect-env.ps1"
powershell -NoProfile -File "!ENV_ACL_HELPER!" -Path "!TARGET_DIR!\.env"
if errorlevel 1 (
    call :ERRO_FATAL "ETAPA 3/6 - Permissoes .env" "302" "Falha ao definir permissoes restritas (ACL) para o arquivo .env." "Verifique se a pasta de destino permite aplicar permissoes de seguranca."
    exit /b 1
)

echo   !C_CYAN!* Gravando arquivo .env de forma protegida contra caracteres especiais...!C_RESET!

:: Gravacao protegida via PowerShell nativo para preservar caracteres como !, %, ^, &, <, >
powershell -NoProfile -Command ^
    "$envPath = Join-Path -Path '!TARGET_DIR!' -ChildPath '.env'; "^
    "$content = @( "^
    "    '# =============================================================================', "^
    "    '# Configuracoes Gerais do Servidor Infoboard TV', "^
    "    '# =============================================================================', "^
    "    'PORT=3000', "^
    "    'UPDATE_INTERVAL_SECONDS=10', "^
    "    'NODE_ENV=production', "^
    "    'LOG_LEVEL=info', "^
    "    '', "^
    "    '# =============================================================================', "^
    "    '# Credenciais NPXManager', "^
    "    '# =============================================================================', "^
    "    ('NPX_EMAIL=' + [System.Environment]::GetEnvironmentVariable('NPX_EM')), "^
    "    ('NPX_PASSWORD=' + [System.Environment]::GetEnvironmentVariable('NPX_PW')), "^
    "    '', "^
    "    '# =============================================================================', "^
    "    '# Credenciais PrixChat', "^
    "    '# =============================================================================', "^
    "    ('PRIXCHAT_EMAIL=' + [System.Environment]::GetEnvironmentVariable('PRIX_EM')), "^
    "    ('PRIXCHAT_PASSWORD=' + [System.Environment]::GetEnvironmentVariable('PRIX_PW')), "^
    "    'PRIXCHAT_BACKEND=https://backapp.prixchat.com.br', "^
    "    '', "^
    "    '# =============================================================================', "^
    "    '# Credenciais API PBX (Nossa Telecom)', "^
    "    '# =============================================================================', "^
    "    ('PBX_BASE_URL=' + [System.Environment]::GetEnvironmentVariable('PBX_URL')), "^
    "    ('PBX_API_TOKEN=' + [System.Environment]::GetEnvironmentVariable('PBX_TK')), "^
    "    ('PBX_API_KEY=' + [System.Environment]::GetEnvironmentVariable('PBX_KEY')), "^
    "    'PBX_TLS_REJECT_UNAUTHORIZED=true', "^
    "    '', "^
    "    '# =============================================================================', "^
    "    '# Limites de Alerta de Fila e Espera (SLA)', "^
    "    '# =============================================================================', "^
    "    'ALERT_QUEUE_WARNING=2', "^
    "    'ALERT_QUEUE_CRITICAL=4', "^
    "    'ALERT_WAIT_WARNING=180', "^
    "    'ALERT_WAIT_CRITICAL=300', "^
    "    '', "^
    "    '# =============================================================================', "^
    "    '# Alertas no Telegram', "^
    "    '# =============================================================================', "^
    "    ('ENABLE_TELEGRAM_ALERTS=' + [System.Environment]::GetEnvironmentVariable('TG_ENABLE')), "^
    "    ('TELEGRAM_BOT_TOKEN=' + [System.Environment]::GetEnvironmentVariable('TG_TOKEN')), "^
    "    ('TELEGRAM_CHAT_ID=' + [System.Environment]::GetEnvironmentVariable('TG_CHAT')), "^
    "    'TELEGRAM_SLA_LIMIT_SEC=420' "^
    "); "^
    "[System.IO.File]::WriteAllLines($envPath, $content, [System.Text.Encoding]::UTF8)"

if not exist "!TARGET_DIR!\.env" (
    call :ERRO_FATAL "ETAPA 3/6 - Gravacao .env" "301" "Nao foi possivel gerar o arquivo .env no diretorio alvo." "Verifique se a pasta de destino esta bloqueada contra gravacao."
    exit /b 1
)

echo   !C_GREEN![OK] Arquivo .env gerado com sucesso em UTF-8!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 4/6: INSTALACAO DE DEPENDENCIAS (NPM CI)
:: =============================================================================
:ETAPA_4
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; try { . ([scriptblock]::Create([IO.File]::ReadAllText((Join-Path $env:TARGET_DIR 'instalador/pbx-config.ps1')))); Invoke-IBPbxInstallMigration $env:TARGET_DIR } catch { Write-Host 'Falha na migracao PBX; configuracao exige verificacao.'; exit 1 }"
if errorlevel 1 (
    call :ERRO_FATAL "ETAPA 4/6 - PBX" "406" "Migracao PBX nao confirmada." "Confira permissoes e o backup privado do .env."
    exit /b 1
)
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 4/6 ] Instalacao de Dependencias de Producao (npm ci)!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Executando 'npm ci --omit=dev' em '!TARGET_DIR!'...!C_RESET!

if not exist "!TARGET_DIR!\package-lock.json" (
    call :ERRO_FATAL "ETAPA 4/6 - Lockfile" "402" "package-lock.json ausente." "Utilize o pacote homologado completo."
    exit /b 1
)
cd /d "!TARGET_DIR!"
call npm ci --omit=dev
if %errorLevel% neq 0 (
    call :ERRO_FATAL "ETAPA 4/6 - Dependencias NPM" "401" "Falha na instalacao dos pacotes Node.js." "Verifique sua conexao de internet ou bloqueio de firewall corporativo para o registro npmjs.org."
    exit /b 1
)

echo   !C_GREEN![OK] Todas as dependencias foram instaladas com sucesso!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 5/6: CONFIGURACAO DE REDE E FIREWALL (PORTA 3000)
:: =============================================================================
:ETAPA_5
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 5/6 ] Liberacao de Porta no Firewall do Windows (Porta 3000)!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Configurando regra de entrada para comunicacao na porta TCP 3000...!C_RESET!

:: Remover regras duplicadas/antigas de forma idempotente
powershell -NoProfile -Command ^
    "Remove-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -ErrorAction SilentlyContinue; "^
    "New-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -Description 'Permite acesso ao Painel Infoboard TV em rede local' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction Stop" >nul 2>&1

if %errorLevel% neq 0 (
    echo   !C_YELLOW![AVISO] Modulo NetSecurity indisponivel. Aplicando regra via netsh advfirewall...!C_RESET!
    netsh advfirewall firewall delete rule name="Infoboard TV (Porta 3000)" >nul 2>&1
    netsh advfirewall firewall add rule name="Infoboard TV (Porta 3000)" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
)

echo   !C_GREEN![OK] Regra de Firewall configurada com sucesso para a porta 3000!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 6/6: REGISTRO DO SERVICO WINDOWS E CRIACAO DE ATALHOS
:: =============================================================================
:ETAPA_6
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 6/6 ] Registro do Servico Windows e Atalhos!C_RESET!
echo -------------------------------------------------------------------------------

echo   !C_GRAY!* Registrando servico nativo 'Infoboard TV' (inicializacao automatica no boot)...!C_RESET!
cd /d "!TARGET_DIR!"

if exist "!TARGET_DIR!\instalador\install_service.js" (
    node "!TARGET_DIR!\instalador\install_service.js"
) else if exist "!TARGET_DIR!\install_service.js" (
    node "!TARGET_DIR!\install_service.js"
) else (
    call :ERRO_FATAL "ETAPA 6/6 - Script de Servico" "601" "O script 'install_service.js' nao foi encontrado." "Verifique se a pasta instalador contem todos os arquivos de instalacao."
    exit /b 1
)

if %errorLevel% neq 0 (
    call :ERRO_FATAL "ETAPA 6/6 - Registro de Servico" "602" "Falha ao registrar o servico nativo no Windows." "Verifique se o modulo 'node-windows' esta instalado ou consulte os logs do Visualizador de Eventos."
    exit /b 1
)

echo.
echo   !C_GRAY!* Criando atalhos na Area de Trabalho (Usuario e Publico)...!C_RESET!
powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; "^
    "$desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory')); "^
    "foreach ($d in $desktops) { "^
    "    if ($d -and (Test-Path $d)) { "^
    "        $url = $ws.CreateShortcut((Join-Path $d 'Abrir Painel Infoboard.url')); "^
    "        $url.TargetPath = 'http://localhost:3000'; "^
    "        $url.Save(); "^
    "        $lnk = $ws.CreateShortcut((Join-Path $d 'Atualizar Infoboard.lnk')); "^
    "        if (Test-Path '!TARGET_DIR!\instalador\ATUALIZAR_INFOBOARD.bat') { "^
    "            $lnk.TargetPath = '!TARGET_DIR!\instalador\ATUALIZAR_INFOBOARD.bat'; "^
    "            $lnk.WorkingDirectory = '!TARGET_DIR!\instalador'; "^
    "        } else { "^
    "            $lnk.TargetPath = '!TARGET_DIR!\ATUALIZAR_INFOBOARD.bat'; "^
    "            $lnk.WorkingDirectory = '!TARGET_DIR!'; "^
    "        }; "^
    "        $lnk.Save(); "^
    "    } "^
    "}" >nul 2>&1

echo   !C_GREEN![OK] Atalhos 'Abrir Painel Infoboard' e 'Atualizar Infoboard' criados com sucesso!!C_RESET!
echo.

:: Registrar a versao e a data somente apos concluir a instalacao.
node "!TARGET_DIR!\scripts\record-installation.cjs" "!TARGET_DIR!"
if !errorlevel! neq 0 (
    call :ERRO_FATAL "ETAPA 6/6 - Registro da Versao" "603" "Falha ao gravar versao e data da instalacao." "Confira as permissoes da pasta do InfoBoard e execute novamente o instalador."
    exit /b 1
)
echo   !C_GREEN![OK] Versao instalada e data registradas!!C_RESET!
echo.

:: Obter IP local da maquina para exibir no sumario
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4" 2^>nul') do (
    set "LOCAL_IP=%%i"
    set "LOCAL_IP=!LOCAL_IP: =!"
    goto :IP_ENCONTRADO
)
set "LOCAL_IP=127.0.0.1"
:IP_ENCONTRADO

:: =============================================================================
:: FINALIZACAO E SUMARIO ANALITICO DE SUCESSO
:: =============================================================================
cls
echo ===============================================================================
echo            !C_GREEN!!C_BOLD!INSTALACAO DO INFOBOARD TV CONCLUIDA COM SUCESSO!!C_RESET!
echo ===============================================================================
echo.
echo !C_WHITE!!C_BOLD!Resumo da Configuracao Implantada:!C_RESET!
echo   !C_CYAN!* Servico Windows:!C_RESET!   'Infoboard TV' (Status: Automatico / Em Execucao)
echo   !C_CYAN!* Pasta do Sistema:!C_RESET!  !TARGET_DIR!
echo   !C_CYAN!* Porta TCP:!C_RESET!         3000 (Regra no Firewall ativada)
echo.
echo !C_WHITE!!C_BOLD!Links de Acesso ao Painel:!C_RESET!
echo   !C_GREEN!* Acesso Local (nesta maquina):!C_RESET!    http://localhost:3000
echo   !C_GREEN!* Acesso em Rede (Smart TVs/PCs):!C_RESET! http://!LOCAL_IP!:3000
echo.
echo !C_WHITE!!C_BOLD!Atalhos Gerados na Area de Trabalho:!C_RESET!
echo   !C_WHITE!1.!C_RESET! !C_CYAN!Abrir Painel Infoboard!C_RESET! - Abre o dashboard no navegador padrao
echo   !C_WHITE!2.!C_RESET! !C_CYAN!Atualizar Infoboard!C_RESET!   - Executa atualizacoes com 1 clique e backup
echo.
echo ===============================================================================
echo !C_GRAY!O servidor ja esta operando em segundo plano. Pressione qualquer tecla para sair.!C_RESET!
echo ===============================================================================
echo.
pause
exit /b 0

:: =============================================================================
:: PAINEL ANALITICO DE DIAGNOSTICO DE ERRO
:: =============================================================================
:ERRO_FATAL
set "ERR_STEP=%~1"
set "ERR_CODE=%~2"
set "ERR_MSG=%~3"
set "ERR_FIX=%~4"

cls
echo.
echo ===============================================================================
echo                !C_RED!!C_BOLD![FALHA CRITICA NA INSTALACAO DO INFOBOARD TV]!C_RESET!
echo ===============================================================================
echo.
echo   !C_WHITE!!C_BOLD!Etapa da Falha:!C_RESET!    !C_CYAN!!ERR_STEP!!C_RESET!
echo   !C_WHITE!!C_BOLD!Codigo de Erro:!C_RESET!    !C_RED!ERR_!ERR_CODE!!C_RESET!
echo   !C_WHITE!!C_BOLD!Diagnostico:!C_RESET!       !ERR_MSG!
echo.
echo -------------------------------------------------------------------------------
echo   !C_YELLOW!!C_BOLD!Como Resolver (Acao Recomendada):!C_RESET!
echo   !ERR_FIX!
echo -------------------------------------------------------------------------------
echo.

:: Gravar registro de erro em arquivo de log
(
    echo [!DATE! !TIME!] FALHA NA INSTALACAO
    echo Etapa: !ERR_STEP!
    echo Codigo: ERR_!ERR_CODE!
    echo Mensagem: !ERR_MSG!
    echo Acao Recomendada: !ERR_FIX!
    echo -------------------------------------------------------------------------------
) >> "%~dp0instalacao_erro.log" 2>nul

echo !C_GRAY!Um arquivo de diagnostico detalhado foi salvo em: '%~dp0instalacao_erro.log'!C_RESET!
echo.
echo Pressione qualquer tecla para encerrar...
pause >nul
exit /b 1
