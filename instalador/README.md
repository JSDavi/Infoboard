# InfoBoard — instalação, atualização e remoção no Windows

Este é o roteiro do operador. Use os scripts da mesma entrega e confira as etapas e os diagnósticos antes da operação. Os guias antigos, inclusive o HTML, ainda podem descrever outro fluxo.

## Antes de começar

- Identifique a raiz da instalação: a pasta que contém `server.js`, `package.json`, `package-lock.json` e o `.env` local. `C:\Infoboard` é um exemplo, não uma confirmação automática.
- A instalação nova usa **porta 3000** por padrão. A porta **3001** é reservada à homologação neste computador; não confunda os dois ambientes.
- Reserve janela de manutenção e espaço para fontes preparadas, dependências novas, dependências anteriores e backup.
- Tenha acesso administrativo autorizado. UAC, ACL, antivírus e políticas corporativas continuam valendo. Registre recusas e encaminhe ao responsável; não use `ExecutionPolicy Bypass`, não desative controles e não tente contornar bloqueios.
- `.env` e `config\analysts_map.json` são privados: não enviar pelo Telegram, publicar no Git ou anexar a chamados.

## Atualizar com um único arquivo pelo Telegram

1. Envie **somente `ATUALIZAR_INFOBOARD.bat`**, da entrega integrada e conferida, como documento pelo Telegram. Nesse fluxo novo, o destinatário não precisa receber os auxiliares separados nem instalar Git.
2. Salve o arquivo na **raiz do InfoBoard instalado**, por exemplo `C:\Infoboard\ATUALIZAR_INFOBOARD.bat`, ao lado de `server.js` e dos arquivos de pacote. Confira que a extensão continua `.bat`; não execute da prévia do Telegram.
3. Dê **dois cliques** e aceite a solicitação de administrador do Windows (**UAC**) quando autorizado. Se ela for recusada ou cancelada, não houve atualização.
4. Leia a pasta encontrada. ENTER confirma somente se for a instalação correta; caso contrário, informe o caminho absoluto correto. Não prossiga sem identificar a instalação.
5. Acompanhe as **oito etapas** e leia o resultado final, inclusive eventual rollback e local do diagnóstico, antes de fechar a janela.
6. Faça o checklist abaixo. HTTP local aprovado não comprova acesso das TVs pela LAN/VPN nem autenticação das integrações.

O BAT novo incorpora o contrato de runtime de `ensure-node.ps1` e o fluxo de `updater-core.ps1`. **Confira se o arquivo distribuído incorpora as fontes da mesma revisão e se passou na validação antes de distribuir**. Um BAT que ainda mostra seis etapas pertence ao fluxo histórico.

### Oito etapas do novo atualizador

| Etapa | O que acontece |
| --- | --- |
| 1 — Pasta e permissões | Valida pasta/pacote instalado e cria área de trabalho e log privados. |
| 2 — Preparar fontes | Obtém e valida o pacote, compara versões e pede confirmação para downgrade do aplicativo. No modo remoto, resolve `master` do GitHub para um commit e baixa o ZIP daquela revisão fixa. |
| 3 — Runtime e dependências | Confere Node e executa `npm ci --omit=dev` na fonte preparada, **antes de solicitar a parada do serviço**. Se o runtime exigir reinício, interrompe aqui. |
| 4 — Backup e serviço | Identifica exatamente o serviço vinculado à pasta, prepara sua configuração de runtime/porta e backups privados. |
| 5 — Parada | Para somente o serviço identificado para essa instalação. |
| 6 — Aplicação | Guarda dependências anteriores, aplica fontes/dependências preparadas e configuração do serviço, preservando `.env` e mapa local. |
| 7 — Serviço e HTTP | Inicia o serviço e confere listener vinculado ao serviço e HTTP 200 em `127.0.0.1` na porta apurada. |
| 8 — Relatório | Informa versão, resultado e diretório privado de diagnóstico. |

O novo atualizador **não executa `git pull`** e não exige checkout Git. A revisão de `master` é fixada por SHA de commit para aquela execução; não é uma versão de lançamento permanentemente fixada. Um pacote local separado também pode alimentar o núcleo; isso difere do envio isolado pelo Telegram.

### Node.js e reinício

O contrato compartilhado é **Node.js >=22**, com npm funcional junto ao binário escolhido. Reaproveita versão adequada, inclusive mais nova, **sem downgrade para 24** apenas para padronizar. Se ausente, antigo ou sem npm adequado, o helper prepara a linha **LTS 24**. Na versão lida, o MSI é `v24.22.1` para x64 ou ARM64; x86 é recusado.

Antes de executar o MSI, confere **SHA-256** contra `SHASUMS256.txt` oficial e **assinatura Authenticode válida de OpenJS Foundation**. Hash ou assinatura inválidos interrompem a operação. Não execute o MSI rejeitado nem reduza as verificações. O guia distingue implementação inspecionada de instalação real testada.

O retorno **3010** exige reiniciar o Windows em janela autorizada e repetir a operação depois de conferir Node e serviço. Não significa que o InfoBoard já foi atualizado. A preparação ainda pode alterar o Node global do Windows, embora o núcleo não tenha solicitado parar o painel nessa fase.

### Resultado do novo atualizador

| Código | Significado e ação |
| --- | --- |
| `0` | Atualização concluída com serviço e HTTP local verificados pelo núcleo; conferir LAN/VPN e integrações. |
| `1` | Atualização falhou ou foi cancelada; arquivos podem não ter sido aplicados ou pode ter ocorrido rollback. Ler a etapa e o resultado da recuperação. |
| `2` | Atualização e rollback falharam; recuperação não confirmada. Preservar backups e acionar o responsável técnico. |
| `3010` | Reinício necessário por causa do runtime; atualização ainda não concluída. |

Esses códigos são do novo fluxo e precisam ser propagados pelo BAT integrado. Não atribua esse contrato aos scripts históricos de instalação/desinstalação. Uma mensagem final ou retorno zero nesses scripts não comprova todos os efeitos.

Falha após o início da parada/aplicação aciona tentativa de recuperar fontes, dependências e configuração anterior do serviço sem download. **Rollback concluído continua sendo atualização com falha**, sem mensagem de sucesso da atualização. Não desfaz instalação global de Node nem restaura todo dado externo; detalhes no guia.

### Dados e diagnóstico privados

O núcleo usa `<raiz>\backups\update_<timestamp>_<guid>\`, com ACL restrita ao usuário executor e SYSTEM. Pode conter `atualizacao.log`, `npm.log`, `configuracao.env`, `fontes-anteriores.zip`, `servico-anterior.xml`, fontes preparadas e `previous-node_modules`. A área inteira é privada; não publicar, servir por HTTP ou compartilhar.

O ZIP é de fontes filtradas, **não um backup completo dos dados**: exclui `.env`, mapa e outros itens privados. O `.env` existente tem cópia separada; o mapa é preservado no lugar e precisa de cópia privada separada antes de migração/remoção. ACL restrita não equivale a criptografia nem garante a proteção dos arquivos privados preexistentes: confira suas permissões e a conta do serviço.

Para suporte, compartilhe **somente uma cópia revisada e redigida do log necessário**, removendo senhas, tokens, cookies, dados pessoais, caminhos e endereços internos desnecessários. Nunca envie `.env`, mapa, `npm.log` bruto, ZIP ou diretório de backups. Não confie apenas no filtro automático.

## Instalar do zero

Para instalar do zero, extraia o `InfoBoard-source.zip` da entrega conferida e execute `InfoBoard\instalador\INSTALAR_INFOBOARD.bat`. Autorize o UAC e confirme uma pasta de destino sem instalação existente. O instalador recusa serviço InfoBoard já registrado e não usa fallback para a branch `master` do GitHub; para instalações existentes, utilize o atualizador. O assistente prepara fontes, configuração privada, dependências, firewall e serviço/atalhos. A instalação de pacotes usa `npm ci --omit=dev` a partir do lockfile. Configure credenciais apenas no servidor e confira que a conta do serviço consegue ler os arquivos privados sem conceder acesso geral.

O instalador agora reutiliza a verificação do atualizador: aceita Node.js **22 ou superior** com npm funcional e, se necessário, baixa e valida a versão LTS homologada antes da instalação. Exige `instalador/ensure-node.ps1` junto ao BAT. Usa a **porta 3000** para instalação nova; 3001 permanece exclusiva da homologação local. Na instalação a partir de fontes locais, `scripts/copy-local-install.cjs` copia apenas os arquivos publicáveis definidos em `scripts/publication-files.cjs`, evitando enviar `.agents`, `.maestri`, credenciais, backups e documentos internos para a instalação. Execute o BAT a partir da distribuição completa, incluindo `protect-env.ps1` e os demais auxiliares; não há garantia de funcionamento ao enviar somente o BAT de instalação. Não use uma instalação nova para substituir uma atualização sem planejar preservação dos dados.

Se a política PowerShell da máquina bloquear scripts `.ps1`, o instalador não conseguirá carregar o auxiliar de Node. Registre a recusa e peça ao responsável pela política do Windows que autorize o procedimento adequado; o instalador não deve alterar nem contornar a política.

## Desinstalar

Execute `DESINSTALAR_INFOBOARD.bat` da instalação conferida, autorize o UAC e revise caminho, modo e confirmação final.

- **Padrão:** remove os componentes de operação previstos no script (serviço, regras e atalhos) e **preserva a pasta e os arquivos**, inclusive `.env` e mapa.
- **Completo:** remove os componentes e tenta excluir **toda a pasta selecionada**, incluindo mapa, dados locais e backups de atualização guardados ali. Se existir `.env`, antes de excluir gera cópia protegida em `%LOCALAPPDATA%\Infoboard\backups\Infoboard_env_backup.env`, sob o perfil da conta executora. Falha de backup/proteção deve abortar a exclusão dos arquivos.

O backup automático cobre somente o `.env` existente, não o mapa nem todos os dados, e seu nome fixo pode substituir cópia anterior. Antes da remoção completa, verifique cópias privadas legíveis **fora da pasta que será removida**. Se não houver `.env`, não haverá cópia dele. Quando o backup falha, serviço/regras/atalhos podem já ter sido removidos: isso não desfaz a desinstalação inteira.

O script histórico tem ações amplas por nomes/porta e exclusão agendada; confira o escopo de cada operação. Mensagem de exclusão agendada não comprova remoção concluída. Não execute esse roteiro no workspace de homologação sem tarefa específica de manutenção.

## Checklist do operador

- [ ] Pasta e versão correspondem à instalação pretendida; resultado e eventual rollback foram lidos.
- [ ] `.env` e `config\analysts_map.json` locais íntegros, privados e acessíveis à conta correta, sem divulgar conteúdo.
- [ ] Node >=22 efetivamente utilizado, npm correspondente e nenhum reinício 3010 pendente.
- [ ] Serviço correto vinculado à pasta, com estado e configuração esperados.
- [ ] HTTP local e painel funcionam na porta efetiva; **3001 nesta homologação**.
- [ ] Dispositivo autorizado abre o painel na **LAN** e, quando aplicável, na **VPN**, conferindo IP/DNS, porta e política de acesso.
- [ ] Integrações e mapa mostram dados esperados; HTTP 200 sozinho não valida credenciais.
- [ ] Diagnóstico e backups privados; suporte recebe somente log redigido.

Este roteiro não constitui evidência de execução em produção. Consulte as mensagens de etapa e os registros privados redigidos para diagnóstico.
