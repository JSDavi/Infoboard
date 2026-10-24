# Lacunas, riscos e perguntas ao mantenedor

[DOCUMENTADO] Fonte: [Postman Beatrix](https://documenter.getpostman.com/view/47894186/2sB3HjLgWE), captura local em 24/10/2026. Evidência indexada em `evidence.json`. As lacunas abaixo delimitam esta collection; não afirmam ausência de recursos no produto inteiro.

| Prioridade | Lacuna / risco | Evidência e implicação |
|---|---|---|
| 1 | Credenciais e dados nos exemplos | [DOCUMENTADO] E15 inclui campo de senha de ramal e E16 contém cookie de sessão; valores omitidos dos derivados. E11 e relatórios contêm identificadores pessoais e conteúdo de atendimento. [INFERIDO] Distribuir o bruto pode propagar conteúdo sensível; validade das credenciais desconhecida |
| 1 | Autorização e ciclo do token | [DOCUMENTADO] Token do suporte, sem expiração/refresh/escopos publicados. [INFERIDO] Não é possível implementar gestão segura de credenciais ou isolamento por empresa apenas com a collection |
| 1 | Identificadores ambíguos | [DOCUMENTADO] callid, linkedid, id, CallerId, protocol e múltiplos códigos de agente/fila coexistem sem mapa. [INFERIDO] Substituição incorreta pode consultar ou afetar recurso diferente |
| 1 | Estados e efeitos de comandos | [DOCUMENTADO] Enum parcial e nenhuma matriz de transições ou concorrência. [INFERIDO] Repetir pausa/logoff/originação pode ter efeitos desconhecidos |
| 1 | Erro de implementação exposto | [DOCUMENTADO] E08/E09 exemplificam erros de método sobre NilClass, sem HTTP. [INFERIDO] Pode revelar detalhe interno e dificulta distinguir erro do cliente de falha do servidor; comportamento atual desconhecido |
| 2 | Endpoints incompletos | [DOCUMENTADO] E14 sem URL, E25 apenas query. [INFERIDO] Não podem ser integrados sem completar o contrato |
| 2 | Disponibilidade incerta | [DOCUMENTADO] Exemplo E16 chamado Desabilitado; E22 Pendente de teste. [INFERIDO] Presença na documentação não comprova disponibilidade |
| 2 | HTTP e respostas incompletos | [DOCUMENTADO] 13 dos 15 exemplos não têm HTTP; 12 itens não têm exemplo de resposta; E23 tem corpo vazio. [INFERIDO] Cliente não pode se apoiar em status de sucesso presumido |
| 2 | JSON de apresentação inválido | [DOCUMENTADO] Vários corpos contêm comentários `//`. [INFERIDO] Copiá-los literalmente como JSON pode falhar; artefatos derivados removem comentários |
| 2 | Comentários inconsistentes | [DOCUMENTADO] pause_type_code/queue_id descritos como código de agente; campaign_id descrito como empresa; src descrito como nome em um analítico, mas origem no filtro |
| 2 | Header inconsistente | [DOCUMENTADO] `Acess-token` em respostas; requests usam `Access-token`/`Access-Token`; `noauth` junto de header de token. [INFERIDO] Não concluir API sem autenticação |
| 2 | Paginação inconsistente | [DOCUMENTADO] E15 total 125, três por página e três páginas. Request de paginação não publicado |
| 2 | Exemplos divergentes | [DOCUMENTADO] E16 originalRequest tem corpo vazio, request principal tem extension/number; E22 originalRequest tem corpo semelhante à resposta, mas request principal não tem corpo |
| 2 | Enums e seleção de relatório | [DOCUMENTADO] Modo analítico sem valor de request; mapa de finalização sem campo correspondente; status textual e numérico não unificados |
| 2 | Gravações | [DOCUMENTADO] Sem resposta de download, streaming, URL, expiração, retenção e sem relação de IDs comprovada |
| 3 | Transporte em tempo real | [DOCUMENTADO] Sem eventos, protocolo push, frequência ou limites publicados |
| 3 | SMS e campanhas | [DOCUMENTADO] Sem limites, taxa, deduplicação, status de entrega ou catálogo; send é string e opcional no exemplo |
| 3 | Datas, métricas e exportação | [DOCUMENTADO] Fuso dos filtros, intervalo máximo, fórmulas de agregação, paginação de relatórios v2 e exportação desconhecidos |

[INFERIDO] Prioridades são avaliação desta análise, não classificação publicada pela NPX. Nenhuma vulnerabilidade ou credencial foi testada. O tratamento de dados pessoais segue a restrição do pedido; este relatório não estabelece conformidade jurídica da plataforma.

## Perguntas para quem mantém a API

1. [DOCUMENTADO — lacuna] Qual host é homologação? Há versão completa e atualizada do contrato, changelog e lista de rotas ativas, especialmente E14/E16/E22/E25?
2. [DOCUMENTADO — lacuna] Como emitir, renovar, revogar e limitar o token por empresa, fila, agente e operação? Qual prazo e política de rotação? O cookie é necessário?
3. [DOCUMENTADO — lacuna] Qual o mapa entre `callid`, `linkedid`, `id`, CallerId e `protocol`? Qual deles E05 recebe e qual retorno o fornece?
4. [DOCUMENTADO — lacuna] `agent_code`, `code` e `id` são equivalentes? O ID do logoff é de agente, vínculo ou sessão? Como descobri-lo?
5. [DOCUMENTADO — lacuna] Como obter filas, agentes e motivos de pausa? Como mapear queue_id, queue_name, queue e queues?
6. [DOCUMENTADO — lacuna] Login e add_to_queue são alternativos ou complementares? Qual a ordem, o alcance por fila e o comportamento em múltiplas filas/ramais?
7. [DOCUMENTADO — lacuna] Quais transições são permitidas? Pausar durante chamada é possível? Unpause retorna a qual estado? Logoff encerra chamada? Qual precedência de paused e status?
8. [DOCUMENTADO — lacuna] Quais campos/corpos são obrigatórios em cada operação? Quais códigos HTTP, schemas de sucesso/erro e erros de domínio devem ser tratados?
9. [DOCUMENTADO — lacuna] Os exemplos NilClass representam comportamento atual? Há formato de erro estável que substitua mensagens internas?
10. [DOCUMENTADO — lacuna] Qual é o campo do mapa de finalização -1/0/1/2? Como reconciliar hangupcause numérico no retorno e string no filtro? Quais enums são completos?
11. [DOCUMENTADO — lacuna] Como requisitar relatório analítico? Qual diferença entre queue e queues? Como enviar filtros múltiplos e interval? Qual o limite do período?
12. [DOCUMENTADO — lacuna] Quais fórmulas, unidades e denominadores das métricas? Qual fuso dos filtros, inclusão dos limites e tratamento de chamadas transferidas/multiperna?
13. [DOCUMENTADO — lacuna] Quais parâmetros de paginação/ordenação, limites e garantias de consistência? Quais formatos de exportação existem?
14. [DOCUMENTADO — lacuna] Como E05 responde: binário, redirect ou URL? Há Range/streaming, expiração, codecs, múltiplos trechos e prazo de retenção? Qual erro quando não há gravação?
15. [DOCUMENTADO — lacuna] Existe push por webhook/WebSocket/SSE? Se polling for o caminho, qual frequência, rate limit e esquema de estado/evento recomendado?
16. [DOCUMENTADO — lacuna] Há idempotência, deduplicação, timeout e retry seguro por comando? Como resolver concorrência entre supervisores, agentes e central?
17. [DOCUMENTADO — lacuna] O endpoint de ramais deve devolver `secret`? Como obter uma projeção sem credencial? Os exemplos públicos serão saneados?
18. [DOCUMENTADO — lacuna] campaign_id em pausa significa empresa ou campanha? Quais limites, custo, status de entrega e semântica parcial do envio de SMS?
19. [DOCUMENTADO — lacuna] Qual a estrutura e o cálculo de NPS/CSAT? Qual rota completa de E25 e o payload de E26?
20. [DOCUMENTADO — lacuna] A central é Asterisk/FreePBX ou outra? Há adaptador AMI/ARI? Quais garantias de persistência e reconciliação entre central e API?

## Cobertura dos objetivos

| Objetivo do pedido | Resultado |
|---|---|
| Contrato e auth | [DOCUMENTADO] Parcial; `01`, token externo e lacunas explícitas |
| Inventário | [DOCUMENTADO] Todos os 26 itens cobertos em `02`; duas rotas desconhecidas |
| Modelo e ER | [INFERIDO] `03`; campos observados, relações/cardinalidades candidatas |
| Máquinas de estado | [DOCUMENTADO]/[HIPÓTESE] `04`; estados descritos e transições não confirmadas |
| Regras e padrões | [DOCUMENTADO]/[INFERIDO] `05`; exemplos não promovidos a invariantes |
| Tempo real / relatórios / gravações | [DOCUMENTADO] Parcial em `06`; transportes e download sem contrato completo |
| Arquitetura | [INFERIDO]/[HIPÓTESE] `07`; sem acesso a implementação |
| Dependências / fluxos | [DOCUMENTADO]/[INFERIDO] `04`; única dependência explícita de retorno identificada |
| OpenAPI / tipos / testes | [INFERIDO] Gerados a partir de evidência; validação offline; sem certificação contra servidor |

[INFERIDO] As cinco maiores incertezas são: **autorização/ciclo do token; equivalência de identificadores; transições e efeitos dos comandos; contratos HTTP/payloads e disponibilidade; transporte de monitoramento e ciclo das gravações**. Responder a essas questões é necessário para afirmar compatibilidade de uma integração ou reimplementação.
