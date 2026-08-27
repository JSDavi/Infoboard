# Guia de Instalação e Atualização do Infoboard (Servidor Windows)

Este guia prático explica como implantar e atualizar o painel do **Infoboard (NPX, PrixChat e PBX)** no Servidor Principal da empresa. O sistema roda como **Serviço Nativo do Windows** em segundo plano e pode ser acessado por qualquer TV ou computador da rede local.

---

## 1. INSTALAÇÃO AUTOMÁTICA (1 CLIQUE)

Tudo foi automatizado através dos scripts na pasta `instalador/`.

### Como Instalar no Servidor:

1. **Acesse a pasta `instalador/`** (ou copie apenas a pasta `instalador/` para o novo computador/servidor).
2. **Execute o `INSTALAR_INFOBOARD.bat`** com dois cliques.
3. O instalador fará todo o processo de forma autônoma:
   - 🔍 **Verificação do Node.js**: Detecta se está instalado (ou baixa e instala para você).
   - 📥 **Sincronização com o GitHub**: Clona ou baixa os arquivos mais recentes do repositório.
   - ⚙️ **Assistente de Credenciais (`.env`)**: Solicita os logins/senhas do NPX e PrixChat para configurar o arquivo de ambiente.
   - 📦 **Instalação das Dependências**: Executa o `npm install` automaticamente.
   - 🛡️ **Firewall do Windows**: Libera a porta `3000` para acesso das TVs na rede local.
   - 🔄 **Serviço Nativo do Windows (`services.msc`)**: Registra o serviço `Infoboard TV` que inicia no boot e recupera em caso de falha.
   - 🖥️ **Atalhos**: Cria atalhos na Área de Trabalho para abrir o painel e atualizar com 1 clique.

---

## 2. COMO ATUALIZAR O SISTEMA

Sempre que houver atualizações ou novas funcionalidades enviadas ao GitHub:

1. No servidor/terminal, dê um duplo clique no atalho **`Atualizar Infoboard`** na Área de Trabalho (ou execute `instalador\ATUALIZAR_INFOBOARD.bat`).
2. O script irá:
   - Pausar o serviço Windows com segurança;
   - Puxar as últimas alterações do GitHub (`git pull` ou download);
   - Atualizar dependências (`npm install`);
   - Reiniciar o serviço automaticamente em menos de 5 segundos.

---

## 3. GERENCIAMENTO E DESINSTALAÇÃO

- **Ver Status do Serviço**: Abra o `services.msc` no Windows e procure por **Infoboard TV**.
- **Desinstalação**: Para remover o serviço e limpar regras de firewall, execute `instalador\DESINSTALAR_INFOBOARD.bat`.
- **Acesso na Rede**: `http://IP_DO_SERVIDOR:3000` (ex: `http://192.168.1.100:3000`).
