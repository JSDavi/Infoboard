@echo off
chcp 65001 >nul 2>&1
title Reiniciar Servidor Infoboard (Porta 3000)

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permissao de Administrador...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

echo.
echo ===============================================================================
echo                REINICIANDO O SERVIDOR INFOBOARD (PORTA 3000)
echo ===============================================================================
echo.
echo * Parando o servico do Windows (infoboardservice.exe)...
net stop "infoboardservice.exe" >nul 2>&1
net stop "InfoboardService" >nul 2>&1
net stop "Infoboard TV" >nul 2>&1

echo * Encerrando processos node orfaos na porta 3000...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo * Iniciando o servico do Windows (infoboardservice.exe)...
net start "infoboardservice.exe" >nul 2>&1
if %errorLevel% neq 0 (
    net start "InfoboardService" >nul 2>&1
)

echo.
echo ===============================================================================
echo  [SUCESSO] Servidor reiniciado com o novo codigo na porta 3000!
echo ===============================================================================
echo.
timeout /t 3
