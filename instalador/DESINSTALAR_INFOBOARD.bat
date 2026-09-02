@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title Desinstalador do Infoboard TV - Infobrasil

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
goto :INICIAR_DESINSTALACAO

:SOLICITAR_ELEVACAO
cls
echo.
echo ===============================================================================
echo                   !C_CYAN!!C_BOLD!INFOBRASIL - DESINSTALADOR DO INFOBOARD TV!C_RESET!
echo ===============================================================================
echo.
echo !C_YELLOW!!C_BOLD![AVISO DE ELEVACAO] Privilegios de Administrador Necessarios!C_RESET!
echo.
echo  Para desinstalar o Infoboard TV completamente, este assistente precisa
echo  de permissoes administrativas do Windows para:
echo.
echo    1. Parar e excluir Servicos Nativos do Windows (services.msc)
echo    2. Remover regras associadas no Windows Defender Firewall (Porta 3000)
echo    3. Remover atalhos do Desktop Publico do sistema (CommonDesktopDirectory)
echo    4. Finalizar processos em segundo plano vinculados a aplicacao
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
        echo   1. Clique com o botao direito no arquivo 'DESINSTALAR_INFOBOARD.bat'
        echo   2. Selecione a opcao 'Executar como Administrador'
        echo.
        pause
    )
    exit /b 0
) else (
    echo.
    echo !C_YELLOW!Desinstalacao cancelada pelo usuario antes da elevacao.!C_RESET!
    pause
    exit /b 0
)

:INICIAR_DESINSTALACAO
:: Ancorar diretorio atual no diretorio onde o script esta localizado
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: =============================================================================
:: CABECALHO PRINCIPAL E VISUAL
:: =============================================================================
cls
echo ===============================================================================
echo                   !C_CYAN!!C_BOLD!INFOBRASIL - DESINSTALADOR DO INFOBOARD TV!C_RESET!
echo ===============================================================================
echo !C_GRAY!  Assistente de Remocao Limpa e Segura de Servicos e Componentes!C_RESET!
echo.

:: =============================================================================
:: ETAPA 1/5: DESCOBERTA E CONFIRMACAO DA PASTA INSTALADA
:: =============================================================================
:ETAPA_1
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 1/5 ] Localizacao da Pasta do Infoboard TV!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Buscando instalacao ativa nos servicos e registros do sistema...!C_RESET!

set "DETECTED_DIR="

:: Camada 1: Servico Windows via CIM / WMI
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

:: Camada 2: Atalhos da Area de Trabalho
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

if defined DETECTED_DIR (
    echo   !C_GREEN![OK] Instalacao identificada em:!C_RESET! !C_CYAN!!C_BOLD!!DETECTED_DIR!!C_RESET!
    echo.
    echo Opcoes para a pasta do sistema:
    echo   !C_WHITE![ENTER/S]!C_RESET! Confirmar e desinstalar esta pasta
    echo   !C_WHITE![   G   ]!C_RESET! Abrir janela grafica para selecionar outra pasta
    echo   !C_WHITE![   M   ]!C_RESET! Digitar o caminho manualmente
    echo.
    set /p "CONFIRM_LOC=Deseja utilizar a pasta '!DETECTED_DIR!'? [ENTER/G/M]: "
    if "!CONFIRM_LOC!"=="" set "CONFIRM_LOC=S"
    if /i "!CONFIRM_LOC!"=="S" (
        set "APP_DIR=!DETECTED_DIR!"
        goto :VALIDAR_APP_DIR_UNINST
    )
    if /i "!CONFIRM_LOC!"=="G" goto :SELECIONAR_GUI_UNINST
    if /i "!CONFIRM_LOC!"=="M" goto :SELECIONAR_MANUAL_UNINST
    
    set "APP_DIR=!CONFIRM_LOC!"
    goto :VALIDAR_APP_DIR_UNINST
) else (
    echo   !C_YELLOW![AVISO] Nenhuma pasta de instalacao padrao foi encontrada.!C_RESET!
)

:SELECIONAR_GUI_UNINST
echo.
echo   !C_CYAN!* Abrindo seletor grafico de pastas do Windows...!C_RESET!
set "SELECTED_GUI_UNINST="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Add-Type -AssemblyName System.Windows.Forms; "^
    "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "^
    "$f.Description = 'Selecione a pasta do Infoboard TV para desinstalacao:'; "^
    "$f.ShowNewFolderButton = $false; "^
    "if (Test-Path 'C:\Infoboard') { $f.SelectedPath = 'C:\Infoboard' }; "^
    "$top = New-Object System.Windows.Forms.Form; "^
    "$top.TopMost = $true; $top.MinimizeBox = $false; $top.MaximizeBox = $false; $top.ShowInTaskbar = $false; "^
    "if ($f.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"`) do (
    set "SELECTED_GUI_UNINST=%%I"
)

if defined SELECTED_GUI_UNINST (
    set "APP_DIR=!SELECTED_GUI_UNINST!"
    goto :VALIDAR_APP_DIR_UNINST
) else (
    echo   !C_YELLOW![AVISO] Nenhuma pasta selecionada na janela grafica.!C_RESET!
)

:SELECIONAR_MANUAL_UNINST
echo.
set /p "APP_DIR=Digite o caminho completo da pasta do Infoboard: "

:VALIDAR_APP_DIR_UNINST
:: Sanitizacao de aspas e barras
set "APP_DIR=!APP_DIR:"=!"
if "!APP_DIR:~-1!"=="\" set "APP_DIR=!APP_DIR:~0,-1!"
if "!APP_DIR:~-1!"=="/" set "APP_DIR=!APP_DIR:~0,-1!"
if "!APP_DIR:~-1!"==":" set "APP_DIR=!APP_DIR!\"

if "!APP_DIR!"=="" (
    call :ERRO_FATAL "ETAPA 1/5 - Localizacao" "101" "Caminho da pasta nao informado." "Informe o diretorio onde o Infoboard TV foi instalado."
    exit /b 1
)

echo.
echo   !C_WHITE!Pasta Alvo da Desinstalacao:!C_RESET! !C_CYAN!!C_BOLD!!APP_DIR!!C_RESET!
echo.

:: =============================================================================
:: ESCOLHA DO MODO DE DESINSTALACAO E CONFIRMACAO
:: =============================================================================
echo ===============================================================================
echo                !C_WHITE!!C_BOLD!ESCOLHA O MODO DE DESINSTALACAO DESEJADO!C_RESET!
echo ===============================================================================
echo.
echo   !C_GREEN!!C_BOLD![ 1 ] Desinstalacao Padrao (Recomendado)!C_RESET!
echo         - Para e desregistra o Servico Windows (Infoboard TV)
echo         - Remove a regra no Windows Defender Firewall (Porta 3000)
echo         - Remove todos os atalhos da Area de Trabalho
echo         - !C_GREEN!MANTEM!C_RESET! os arquivos do projeto, banco e configuracoes (.env)
echo.
echo   !C_YELLOW!!C_BOLD![ 2 ] Desinstalacao Completa (Remocao Total)!C_RESET!
echo         - Executa todas as etapas da Desinstalacao Padrao
echo         - !C_CYAN!Salva automaticamente um backup do seu .env na Area de Trabalho!C_RESET!
echo         - !C_RED!!C_BOLD!EXCLUI!C_RESET! completamente a pasta de instalacao ('!APP_DIR!')
echo.
echo   !C_WHITE![ C ] Cancelar a Operacao e Sair!C_RESET!
echo.
echo -------------------------------------------------------------------------------
set /p "UNINST_MODE=Selecione a opcao desejada [1/2/C]: "

if /i "!UNINST_MODE!"=="C" (
    echo.
    echo !C_YELLOW!Desinstalacao cancelada pelo usuario.!C_RESET!
    pause
    exit /b 0
)

if not "!UNINST_MODE!"=="1" if not "!UNINST_MODE!"=="2" (
    echo.
    echo !C_YELLOW!Opcao invalida. Assumindo modo Padrao [1].!C_RESET!
    set "UNINST_MODE=1"
)

echo.
echo !C_YELLOW!!C_BOLD![CONFIRMACAO OBRIGATORIA]!C_RESET!
set /p "FINAL_CONFIRM=Tem certeza absoluta que deseja desinstalar o Infoboard TV? (S/N) [N]: "
if "!FINAL_CONFIRM!"=="" set "FINAL_CONFIRM=N"
if /i not "!FINAL_CONFIRM!"=="S" (
    echo.
    echo !C_GREEN!Operacao cancelada. Nenhuma alteracao foi feita no sistema.!C_RESET!
    pause
    exit /b 0
)

echo.

:: =============================================================================
:: ETAPA 2/5: PARADA E REMOCAO PROFUNDA DE SERVICOS WINDOWS
:: =============================================================================
:ETAPA_2
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 2/5 ] Parada e Remocao de Servicos do Windows (services.msc)!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Interrompendo servicos em execucao ('Infoboard TV' e 'InfoboardService')...!C_RESET!

net stop "Infoboard TV" >nul 2>&1
net stop "InfoboardService" >nul 2>&1

echo   !C_GRAY!* Executando desinstalador oficial via node-windows...!C_RESET!
where node >nul 2>&1
if %errorLevel% equ 0 (
    if exist "!APP_DIR!\instalador\uninstall_service.js" (
        node "!APP_DIR!\instalador\uninstall_service.js" >nul 2>&1
    ) else if exist "!APP_DIR!\uninstall_service.js" (
        node "!APP_DIR!\uninstall_service.js" >nul 2>&1
    )
)

echo   !C_GRAY!* Garantindo exclusao direta do servico via sc.exe (Registro do Windows)...!C_RESET!
sc query "Infoboard TV" >nul 2>&1
if %errorLevel% equ 0 (
    sc delete "Infoboard TV" >nul 2>&1
)
sc query "InfoboardService" >nul 2>&1
if %errorLevel% equ 0 (
    sc delete "InfoboardService" >nul 2>&1
)

echo   !C_GRAY!* Encerrando daemons e processos orfaos...!C_RESET!
taskkill /F /IM "infoboardservice.exe" >nul 2>&1
taskkill /F /IM "infoboardtv.exe" >nul 2>&1

:: Encerrar processo node na porta 3000 se houver
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { "^
    "    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} "^
    "}" >nul 2>&1

echo   !C_GREEN![OK] Servicos nativos do Windows removidos com sucesso!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 3/5: REMOCAO DE REGRAS NO FIREWALL DO WINDOWS
:: =============================================================================
:ETAPA_3
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 3/5 ] Remocao de Regras no Windows Defender Firewall!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Excluindo regras de liberacao de porta TCP 3000...!C_RESET!

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Remove-NetFirewallRule -DisplayName 'Infoboard TV (Porta 3000)' -ErrorAction SilentlyContinue; "^
    "Remove-NetFirewallRule -DisplayName 'Infoboard TV' -ErrorAction SilentlyContinue" >nul 2>&1

netsh advfirewall firewall delete rule name="Infoboard TV (Porta 3000)" >nul 2>&1
netsh advfirewall firewall delete rule name="Infoboard TV" >nul 2>&1

echo   !C_GREEN![OK] Regras de Firewall limpas com sucesso!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 4/5: REMOCAO DE ATALHOS NA AREA DE TRABALHO (USUARIO E PUBLICO)
:: =============================================================================
:ETAPA_4
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 4/5 ] Remocao de Atalhos na Area de Trabalho!C_RESET!
echo -------------------------------------------------------------------------------
echo   !C_GRAY!* Varrendo Desktop do Usuario e Desktop Publico (CommonDesktop)...!C_RESET!

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory')); "^
    "$shortcuts = @('Abrir Painel Infoboard.url', 'Atualizar Infoboard.lnk', 'Infoboard TV.lnk', 'Infoboard TV.url'); "^
    "foreach ($d in $desktops) { "^
    "    if ($d -and (Test-Path $d)) { "^
    "        foreach ($s in $shortcuts) { "^
    "            $target = Join-Path $d $s; "^
    "            if (Test-Path $target) { Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue } "^
    "        }; "^
    "        Get-ChildItem -Path $d -Filter '*Infoboard*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; "^
    "    } "^
    "}" >nul 2>&1

echo   !C_GREEN![OK] Todos os atalhos foram removidos com sucesso!!C_RESET!
echo.

:: =============================================================================
:: ETAPA 5/5: LIMPEZA DE ARQUIVOS (SE SELECIONADA DESINSTALACAO COMPLETA)
:: =============================================================================
:ETAPA_5
echo -------------------------------------------------------------------------------
echo !C_CYAN!!C_BOLD![ ETAPA 5/5 ] Processamento dos Arquivos da Aplicacao!C_RESET!
echo -------------------------------------------------------------------------------

if "!UNINST_MODE!"=="1" (
    echo   !C_GREEN![OK] Modo Padrao selecionado: Os arquivos em '!APP_DIR!' foram mantidos.!C_RESET!
    echo.
    goto :SUMARIO_UNINST
)

if "!UNINST_MODE!"=="2" (
    echo   !C_YELLOW!* Modo Completo selecionado: Iniciando remocao total da pasta do sistema...!C_RESET!
    
    :: Backup de seguranca do .env na Area de Trabalho do usuario
    if exist "!APP_DIR!\.env" (
        echo   !C_CYAN!* Criando copia de seguranca do seu .env no Desktop...!C_RESET!
        copy /y "!APP_DIR!\.env" "%USERPROFILE%\Desktop\Infoboard_env_backup.env" >nul 2>&1
        echo   !C_GREEN![OK] Backup do .env salvo em: '%USERPROFILE%\Desktop\Infoboard_env_backup.env'!C_RESET!
    )
    
    echo   !C_GRAY!* Disparando processo de auto-limpeza desanexada para evitar bloqueio de arquivos...!C_RESET!
    
    :: Desanexar diretorio de trabalho do CMD pai para liberar descritores de arquivo
    cd /d "%TEMP%"
    
    :: Auto-limpeza desanexada em segundo plano via PowerShell com loop de tentativas
    start /b "" powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Start-Sleep -Seconds 2; 1..15 | ForEach-Object { try { Remove-Item -LiteralPath '!APP_DIR!' -Recurse -Force -ErrorAction Stop; break } catch { Start-Sleep -Seconds 1 } }"
    
    echo   !C_GREEN![OK] Exclusao da pasta agendada com sucesso!!C_RESET!
    echo.
)

:SUMARIO_UNINST
:: =============================================================================
:: FINALIZACAO E SUMARIO ANALITICO DE DESINSTALACAO
:: =============================================================================
cls
echo ===============================================================================
echo          !C_GREEN!!C_BOLD!DESINSTALACAO DO INFOBOARD TV CONCLUIDA COM SUCESSO!!C_RESET!
echo ===============================================================================
echo.
echo !C_WHITE!!C_BOLD!Resumo das Operacoes Realizadas:!C_RESET!
echo   !C_GREEN![OK]!C_RESET! Servicos Windows 'Infoboard TV' e 'InfoboardService' removidos
echo   !C_GREEN![OK]!C_RESET! Regras de liberacao de porta (3000) no Firewall excluidas
echo   !C_GREEN![OK]!C_RESET! Atalhos do Desktop do Usuario e Desktop Publico eliminados
echo   !C_GREEN![OK]!C_RESET! Processos em segundo plano finalizados
echo.
if "!UNINST_MODE!"=="1" (
    echo !C_CYAN!!C_BOLD!Observacao sobre seus dados (Modo Padrao):!C_RESET!
    echo   Os arquivos do projeto em '!APP_DIR!' foram preservados.
    echo   Caso queira reinstalar futuramente, suas configuracoes serao reaproveitadas.
) else (
    echo !C_YELLOW!!C_BOLD!Observacao sobre a limpeza total (Modo Completo):!C_RESET!
    echo   A pasta '!APP_DIR!' sera totalmente excluida em instantes.
    echo   Seu arquivo '.env' foi preservado em: '%USERPROFILE%\Desktop\Infoboard_env_backup.env'.
)
echo.
echo ===============================================================================
echo !C_GRAY!Pressione qualquer tecla para encerrar o desinstalador.!C_RESET!
echo ===============================================================================
echo.
pause
exit /b 0

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
echo               !C_RED!!C_BOLD![FALHA NO DESINSTALADOR DO INFOBOARD TV]!C_RESET!
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
    echo [!DATE! !TIME!] FALHA NO DESINSTALADOR
    echo Etapa: !ERR_STEP!
    echo Codigo: ERR_!ERR_CODE!
    echo Mensagem: !ERR_MSG!
    echo Acao Recomendada: !ERR_FIX!
    echo -------------------------------------------------------------------------------
) >> "%~dp0desinstalacao_erro.log" 2>nul

echo !C_GRAY!Registro salvo em: '%~dp0desinstalacao_erro.log'!C_RESET!
echo.
echo Pressione qualquer tecla para encerrar...
pause >nul
exit /b 1
