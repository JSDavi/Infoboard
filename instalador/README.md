# 📖 Documentação do Instalador e Atualizador — Infoboard TV

Este documento reúne todas as instruções técnicas, funcionamento interno e guia de solução de problemas dos scripts de instalação e manutenção do **Infoboard TV**.

---

## 📁 Estrutura dos Arquivos do Instalador

```text
📁 instalador/
├── 📄 INSTALAR_INFOBOARD.bat     # Instalador automático autônomo
├── 📄 ATUALIZAR_INFOBOARD.bat    # Atualizador sincronizado com GitHub
├── 📄 DESINSTALAR_INFOBOARD.bat  # Removedor de serviços e firewall
├── 📄 install_service.js         # Registrador do serviço nativo Windows
├── 📄 uninstall_service.js       # Removedor do serviço nativo Windows
└── 📄 README.md                  # Este guia de consulta
```

---

## 🚀 1. Como Instalar do Zero (`INSTALAR_INFOBOARD.bat`)

### Formas de uso:

1. **Instalação via Repositório Completo:**
   - Dê dois cliques em `instalador\INSTALAR_INFOBOARD.bat`.
   - O instalador usará os arquivos locais da pasta atual.

2. **Instalação em Máquina Virgem (Apenas copiando o instalador):**
   - Copie apenas a pasta `instalador/` (ou o arquivo `INSTALAR_INFOBOARD.bat`) para a máquina de destino.
   - Execute o `.bat`.
   - Ele baixará automaticamente todo o código mais recente do repositório oficial no GitHub (`https://github.com/JSDavi/Infoboard.git`) para a pasta de destino `C:\Infoboard`.

### Etapas executadas automaticamente pelo instalador:
1. **Elevação de Privilégios**: Pede permissão de Administrador automaticamente.
2. **Checagem do Node.js**: Se não estiver instalado, oferece baixar e instalar silenciosamente a versão LTS (`v20.x`).
3. **Download/Sincronização**: Clona via Git ou baixa pacote ZIP oficial do GitHub.
4. **Assistente de Credenciais (`.env`)**: Caso não encontre o `.env`, solicita os dados de login de forma interativa:
   - Email e Senha do NPX
   - Email e Senha do PrixChat
   - Token da API PBX (opcional)
5. **Instalação de Pacotes**: Executa `npm install --omit=dev`.
6. **Firewall do Windows**: Cria regra liberando a porta `3000` para acesso das TVs.
7. **Serviço Nativo do Windows**: Registra o serviço `Infoboard TV` no `services.msc` com inicialização automática no Boot.
8. **Atalhos na Área de Trabalho**:
   - `Abrir Painel Infoboard.url` (abre `http://localhost:3000`)
   - `Atualizar Infoboard.lnk` (chama o atualizador)

---

## 🔄 2. Como Atualizar o Sistema (`ATUALIZAR_INFOBOARD.bat`)

Sempre que novas funcionalidades ou correções forem enviadas ao repositório GitHub:

1. No servidor/terminal, execute o atalho **Atualizar Infoboard** ou dê dois cliques em `instalador\ATUALIZAR_INFOBOARD.bat`.
2. O script executa o seguinte fluxo seguro:
   - **Para o serviço** `Infoboard TV` para liberar arquivos bloqueados;
   - Puxa as novidades via `git pull` (ou baixa pacote atualizado do GitHub);
   - **Preserva intacto** o arquivo `.env` com todas as senhas;
   - Roda `npm install` caso existam novas dependências;
   - **Reinicia o serviço** do Windows.

---

## 🛑 3. Como Desinstalar (`DESINSTALAR_INFOBOARD.bat`)

Caso precise desativar ou migrar o sistema:
1. Execute `instalador\DESINSTALAR_INFOBOARD.bat`.
2. O script irá:
   - Parar e desinstalar o serviço `Infoboard TV` do Windows (`services.msc`);
   - Excluir a regra de liberação de porta no Firewall do Windows;
   - Remover os atalhos criados na Área de Trabalho.

---

## 🔧 4. Guia de Solução de Problemas (Troubleshooting)

### ❓ O painel não abre nas TVs/outros computadores da rede
1. Verifique se o computador servidor e as TVs estão na mesma rede/roteador.
2. Descubra o IP local do servidor abrindo o Prompt de Comando e digitando `ipconfig` (Ex: `192.168.1.100`).
3. No navegador da TV, acerte o endereço: `http://192.168.1.100:3000`.
4. Se ainda assim não abrir, confirme se o serviço está em execução no `services.msc`.

### ❓ Como reiniciar o painel manualmente
- Abra o menu Iniciar do Windows e digite `services.msc`.
- Procure pelo serviço **Infoboard TV**.
- Clique com o botão direito e escolha **Reiniciar**.

### ❓ Onde ver os logs de execução do servidor
- Os logs de funcionamento e eventuais erros são gravados no arquivo:
  `C:\Infoboard\server.log` (ou na raiz da pasta de instalação do sistema).
