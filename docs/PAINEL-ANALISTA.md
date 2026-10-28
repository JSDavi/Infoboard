# InfoBoard — Monitoramento passivo

Atualizado em 24/10/2026.

O InfoBoard é um painel de **consulta e acompanhamento**, sem autenticação própria dos analistas e sem controles operacionais. O analista entra, sai e altera suas pausas exclusivamente no aplicativo oficial NPX, conforme suas permissões.

O botão **Login** é um atalho para abrir `https://agente.npx.app.br/agent_users/sign_in` em uma janela compacta do navegador. Na primeira tela, o analista informa seu código e senha; após autenticar, o próprio Beatrix apresenta a seleção de **ramal** e **fila**. A conexão acontece apenas após **Logar em Fila** na página oficial. O InfoBoard não recebe a senha nem altera os acessos definidos pelo NPX.

O Beatrix retorna `X-Frame-Options: SAMEORIGIN`. Por isso, as telas oficiais não podem ser embutidas ou recortadas visualmente dentro de um modal do domínio InfoBoard. O atalho abre uma janela estreita solicitando o mínimo de barras do navegador; a barra de endereço/identificação pode continuar visível conforme as proteções do Chrome. Nenhuma extensão ou instalação adicional é necessária nas estações para abrir o login oficial. A janela preserva a navegação real entre as duas etapas e pode ser fechada após a entrada na fila.

## Atualização dos cards

O integrador consulta as cinco filas do monitor oficial NPX e os estados do PBX. Quando o analista se conecta ao aplicativo NPX, a próxima coleta atualiza automaticamente o card no InfoBoard. Os setores Suporte, Comercial, Financeiro, SPED Fiscal e Ponto utilizam as mesmas regras de classificação e as mesmas cores. A fila exibida vem da observação do NPX; não existe seleção de fila no InfoBoard.

- **Livre / em chamada / chamando / pausado:** estados observados; métricas e durações são somente informativas.
- **Sem conexão NPX/PBX:** ambos os sistemas confirmaram desconexão.
- **Falha geral de coleta NPX:** o aviso aparece no cabeçalho; os cartões sem estado confirmado permanecem neutros, enquanto os estados atuais confirmados pelo PBX continuam exibidos.
- **NPX PARCIAL:** os estados dos analistas foram coletados, mas algumas métricas auxiliares de fila estão indisponíveis e aparecem como “—”.
- **Status NPX não confirmado:** não há uma leitura operacional válida e recente.

Quando o NPX indica desconexão e a leitura atual do PBX ainda não está disponível, o cartão permanece em estado visual neutro, sem a etiqueta repetitiva "PBX não confirmado". A incerteza do registro SIP continua preservada internamente; o painel não apresenta um ramal como desconectado dos dois serviços até que ambos confirmem. A confirmação do PBX é uma consulta automática à API sobre o registro do ramal, não uma ação manual ao trocar de ramal no MicroSIP. Falhas na comunicação com o PBX continuam visíveis no alerta geral do cabeçalho, identificado como NOSSATEL PBX, sem atribuir a falha ao NPX.

Se a coleta do PBX retornar `ERR_TLS_CERT_ALTNAME_INVALID`, o banner informa que o certificado TLS apresentado não corresponde ao endereço utilizado na API. A solução é revisar o endereço configurado ou o certificado do provedor, mantendo a validação TLS habilitada.

A autenticação técnica que o servidor usa para ler NPX e PrixChat permanece configurada em `.env` e é independente do login que o analista faz no aplicativo principal.

## API e acesso

`GET /api/data` é a única rota da API. Ela disponibiliza dados de leitura do NPX, PBX, PrixChat, horários, hospedagens e SEFAZ para a TV e a rede interna autorizada. Uma origem não autorizada recebe HTTP 401. Não existem rotas de sessão de analista, login, logout, pausa, despausa, troca de fila nem administração.

A autorização preserva o acesso pela LAN e VPN com origem IPv4 privada: `INFOBOARD_ALLOW_PRIVATE_NETWORK=true`, ou variável ausente nas instalações anteriores. Para restringir a equipamentos específicos, configure `INFOBOARD_ALLOW_PRIVATE_NETWORK=false` e cadastre os IPs diretos em `INFOBOARD_TV_ALLOWED_IPS` ou `INFOBOARD_VIEWER_ALLOWED_IPS`; o próprio servidor continua liberado via loopback. Os IPs devem ser fixos ou reservados no DHCP. VPN com origem fora das faixas privadas requer cadastro explícito. Nenhum login no NPX concede acesso adicional ao InfoBoard.

O painel estático não contém formulários de login nem modais operacionais. O atalho do Beatrix abre um endereço externo oficial, sem passar por rotas do InfoBoard. Clicar no ícone de informações de um card exibe somente suas métricas. Controles de apresentação, como pausar o carrossel de chat, alteram apenas a visualização local.

## Homologação

Utilize `http://127.0.0.1:3001/`; confira a porta antes de iniciar ou reiniciar processos. A porta 3000 pertence a outro ambiente. Execute `node --test --test-reporter=tap tests/*.test.js` e `node tests/browser-smoke.cjs http://127.0.0.1:3001/ 1366 768`. O smoke verifica estados e cores com dados em memória no navegador, sem enviar comandos ao NPX.
