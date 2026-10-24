# Regras de negócio e convenções

[DOCUMENTADO] Fonte única: [Postman Beatrix](https://documenter.getpostman.com/view/47894186/2sB3HjLgWE). Referências E01–E26 em `evidence.json`. Não houve execução para validar regras implícitas.

| Regra / convenção | Evidência e limite |
|---|---|
| Pausa com motivo | [DOCUMENTADO] E01 recebe `pause_type_code`; comentário do request principal fala incorretamente em código de agente, enquanto o exemplo fala no motivo. [INFERIDO] Nome do campo e exemplo sustentam código de motivo; catálogo e validação desconhecidos |
| Adicionar à fila | [DOCUMENTADO] E03 recebe `queue_id`, `extension`, `penalty`; penalty é descrito como prioridade. [DOCUMENTADO] Tipo observado string; sentido maior/menor, faixa válida e valor padrão desconhecidos |
| Remover da fila | [DOCUMENTADO] E04 recebe `queue_id` e usa a grafia exata `remove_to_queue`. [INFERIDO] Não corrigir o caminho para outra grafia em clientes |
| Login do agente | [DOCUMENTADO] E09 recebe código, senha, fila e ramal. [DOCUMENTADO] Validações de senha, vínculo, ramal ocupado e simultaneidade desconhecidas; único exemplo de retorno é erro |
| Logoff | [DOCUMENTADO] E10 diz ID de agente na fila. [DOCUMENTADO] Origem desse ID, término de chamada em andamento e alcance por fila desconhecidos |
| Pausa legada PABX | [DOCUMENTADO] E20/E21 recebem `id` e `campaign_id`, cujo comentário diz ID da empresa. [DOCUMENTADO] Equivalência com E01/E02 e escopo de pausa por empresa/fila desconhecidos |
| Campos obrigatórios do relatório CallCenter | [DOCUMENTADO] E12 explicita `report_type`, `queues`, `date_started_at`, `time_started_at`, `date_ended_at`, `time_ended_at` |
| Outros campos obrigatórios | [DOCUMENTADO] Não declarados expressamente. [INFERIDO] Exemplos sozinhos não estabelecem obrigatoriedade; OpenAPI e tipos preservam essa lacuna |
| Unicidade | [DOCUMENTADO] E11 descreve `id` como único no banco e protocolo como automático; E16 descreve callid único. [DOCUMENTADO] Constraints, escopo por empresa, algoritmo de protocolo e retenção dos IDs desconhecidos |
| Ações que mudam operação | [DOCUMENTADO][SENSÍVEL] E01–E04, E09/E10, E13, E16/E18, E20/E21. [DOCUMENTADO] Retry, deduplicação, idempotência e atomicidade desconhecidos |
| Consultas com POST | [DOCUMENTADO] E12/E23 são relatórios; E22 consulta status de ramais apesar de POST. [INFERIDO] Método POST isoladamente não indica mutação |
| Transferir/apagar gravação | [DOCUMENTADO] Nenhuma rota correspondente nos 26 itens capturados; capacidade fora desta collection desconhecida |

[INFERIDO] Adicionar membro à fila, fazer login e ficar disponível são conceitos potencialmente distintos, sustentados pela existência de endpoints separados. Não é possível provar a ordem obrigatória entre eles, a persistência do vínculo ou se logoff remove o membro. Não há evidência para implementar essas operações como sinônimos.

[INFERIDO] Pausa pode produzir evento histórico no relatório E07, e login/logoff pode produzir registros E06: nomes e campos temporais sustentam a relação. O momento de persistência, consistência eventual, transação com a central e reaproveitamento de sessão são desconhecidos.

[DOCUMENTADO] Cálculos visíveis nos exemplos saneados, sem dados de identificação:

- [DOCUMENTADO] E12 sintético mostra 69 atendidas, 54 não atendidas e total 123. [INFERIDO] `69 + 54 = 123` é compatível com soma nesse exemplo; não prova fórmula geral ou se ocupadas entram nas não atendidas.
- [DOCUMENTADO] E12 mostra 60 encerradas pelo agente, 63 pelo cliente e 0 transferências. [INFERIDO] `60 + 63 + 0 = 123`; isso não comprova partição mutuamente exclusiva em todos os cenários.
- [DOCUMENTADO] E07 tem início/fim separados por 397,723 segundos e duração decimal string próxima de 6,6287 minutos. [INFERIDO] A duração é compatível com `(fim - início) / 60`; arredondamento e precisão não especificados.
- [DOCUMENTADO] E15 mostra `per_page=3`, `total_count=125`, `total_pages=3`. [INFERIDO] Não satisfaz o cálculo usual `ceil(125/3)=42`; tratar como inconsistência de exemplo, sem impor fórmula ao servidor.

[DOCUMENTADO] E12 descreve códigos de finalização `-1 Abandono`, `0 Fila`, `1 Cliente`, `2 Transferido`, sem associá-los a um nome de campo. O analítico exemplifica `hangupcause` numérico, enquanto o filtro de request usa string como `NORMAL_CLEARING`. [INFERIDO] Não associar o mapa automaticamente a `status`, `hangupcause` ou `bound`.

| Convenção | Resultado |
|---|---|
| Paginação de resposta | [DOCUMENTADO] E06/E07/E15 têm `current_page`, `per_page`, `total_count`, `total_pages` numéricos e lista em `report_data` ou `extensions` |
| Paginação de request | [DOCUMENTADO] Nomes de parâmetros, limites e valores padrão desconhecidos; nenhum `page` foi inventado no contrato |
| Ordenação | [DOCUMENTADO] Parâmetros e ordem padrão desconhecidos |
| Filtros multivalorados | [DOCUMENTADO] Comentários E12 dizem listas, mas valores são strings; delimitador, array ou repetição de chave desconhecidos |
| Datas de filtro | [DOCUMENTADO] Exemplos `YYYY-MM-DD` e horas `HH:MM:SS` em campos separados; validação real e fuso dos filtros desconhecidos |
| Datas de resposta | [DOCUMENTADO] E06/E07/E11 usam timestamps com milissegundos e offset `-03:00`; isso não prova um fuso universal |
| Datas analíticas | [DOCUMENTADO] E12 tem `calldatetime` string; E11 usa a grafia distinta `call_datetime` |
| Durações | [DOCUMENTADO] `billsec`, `wait` e tempos de atendidas/não atendidas são descritos em segundos; E07 duração em minutos como string. Unidade de `total_time_wait` não é explicitada no comentário |
| Nomes e versões | [DOCUMENTADO] snake_case, `/api/` e `/api/v2/`; `queue`, `queues`, `queue_id`, `queue_name`, `code`, `agent_code` e `id` coexistem |
| Booleanos | [DOCUMENTADO] `paused` descrito como 0/1; SMS `send` string; aprovação de pausa string. Não normalizar silenciosamente |
| Formato de resposta | [DOCUMENTADO] Mistura envelopes paginados, objetos soltos, status numérico e resposta vazia; formato global desconhecido |
| Versionamento | [DOCUMENTADO] Prefixo v2 em parte das rotas; depreciação, equivalência e compatibilidade entre versões desconhecidas |
| Idempotência | [DOCUMENTADO] Sem chave ou semântica documentada; comportamento em repetição desconhecido |

[INFERIDO] Para uma reimplementação compatível, preservar tipos e nomes observados na borda, separando eventual normalização interna. Regras de validação, permissões, concorrência e transições precisam ser contratadas com o mantenedor antes de serem codificadas como invariantes.
