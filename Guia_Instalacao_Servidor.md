# Guia de Instalação e Atualização do Infoboard (Servidor Windows)

Este guia prático explica como implantar e atualizar o painel do **Infoboard (NPX & PrixChat)** no Servidor Principal da empresa. O sistema roda de forma invisível em segundo plano e pode ser acessado por qualquer TV ou computador da rede local.

---

## 1. INSTALAÇÃO INICIAL NO SERVIDOR

### Passo 1: Preparar o Ambiente
1. Acesse o Servidor Principal.
2. Instale o **Node.js** (baixe a versão LTS em nodejs.org).
3. Crie uma pasta para o sistema, por exemplo: `C:\Sistemas\Infoboard`.

### Passo 2: Copiar os Arquivos
1. No seu computador de desenvolvimento, copie os arquivos do projeto.
   > **Atenção:** **NÃO COPIE** a pasta `node_modules` (ela é muito pesada e será recriada no servidor).
2. Cole os arquivos na pasta criada no Servidor (`C:\Sistemas\Infoboard`).
3. **Importante:** Certifique-se de que o arquivo `.env` (onde ficam as senhas e chaves) foi copiado também. Como ele é um arquivo oculto, as vezes passa despercebido.

### Passo 3: Instalar as Dependências
1. No servidor, abra o **CMD** ou **PowerShell**.
2. Navegue até a pasta do sistema:
   ```cmd
   cd C:\Sistemas\Infoboard
   ```
3. Instale os pacotes necessários:
   ```cmd
   npm install
   ```

### Passo 4: Liberar o Acesso na Rede (Firewall)
Para que as TVs e os computadores da empresa consigam abrir o painel, precisamos avisar o Windows do servidor para não bloquear a porta 3000.
1. Abra o **PowerShell como Administrador**.
2. Cole o comando abaixo e aperte Enter:
   ```powershell
   New-NetFirewallRule -DisplayName "Acesso TV Infoboard" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```

### Passo 5: Ativar o "Cão de Guarda" (PM2)
O PM2 é a ferramenta que manterá o sistema rodando invisível, mesmo que a tela do servidor seja fechada ou ele seja reiniciado.
No **CMD como Administrador**, digite os seguintes comandos um por um:
1. Instale o PM2 globalmente:
   ```cmd
   npm install -g pm2
   ```
2. Instale o módulo que liga o PM2 junto com o Windows:
   ```cmd
   npm install -g pm2-windows-startup
   pm2-startup install
   ```
3. Inicie o Infoboard:
   ```cmd
   cd C:\Sistemas\Infoboard
   pm2 start server.js --name "Infoboard-TV"
   ```
4. Salve essa configuração para o Windows não esquecer:
   ```cmd
   pm2 save
   ```

✅ **Pronto!** A partir de agora, basta acessar o painel de qualquer computador digitando o IP do servidor e a porta 3000 no navegador (Ex: `http://192.168.1.100:3000`).

---

## 2. COMO ATUALIZAR O SISTEMA DEPOIS

Quando você fizer melhorias no código no seu computador e quiser enviar para o servidor, o processo é super simples:

1. **Copie os arquivos modificados:**
   Copie do seu computador apenas os arquivos que você mexeu (ex: `app.js`, `style.css`, `index.html`, `server.js`).
   *(Lembre-se: não copie a pasta `node_modules` novamente).*
2. **Cole no Servidor:**
   Substitua os arquivos antigos na pasta `C:\Sistemas\Infoboard`.
3. **Reinicie o Sistema:**
   Abra um CMD no servidor e aplique o novo código com apenas 1 comando:
   ```cmd
   pm2 restart "Infoboard-TV"
   ```

O sistema piscará nos bastidores em 1 segundo. Nas TVs e Computadores, o painel será atualizado automaticamente assim que a página der seu ciclo normal de atualização.
