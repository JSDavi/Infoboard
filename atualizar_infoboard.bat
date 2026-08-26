@echo off
echo =========================================
echo Atualizando o Infoboard pelo GitHub...
echo =========================================
cd /d "%~dp0"

:: Puxa as ultimas modificacoes do GitHub
git pull origin master

:: Instala novos pacotes (caso existam)
call npm install

echo.
echo =========================================
echo Atualizacao Concluida com Sucesso! 
echo =========================================
echo Por favor, reinicie a Tarefa Agendada ou o Script VBS para aplicar.
pause
