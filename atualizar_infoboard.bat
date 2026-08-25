@echo off
echo =========================================
echo Atualizando o Infoboard pelo GitHub...
echo =========================================
:: Mude este caminho para o local onde o Infoboard ficara no Servidor
cd "C:\Projetos\Infoboard"

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
