# Tempo real, relatórios e gravações

[DOCUMENTADO] Fonte: [Postman Beatrix](https://documenter.getpostman.com/view/47894186/2sB3HjLgWE). IDs e campos em `evidence.json` e `02-endpoints.md`.

## Tempo real

[DOCUMENTADO] As introduções prometem visão em tempo real. A collection mostra consultas HTTP para status de chamada E08/E17, estado de agente E19, status de ramais E22 e chamadas em espera E24. E22 está marcado “Pendente de teste”. Não há WebSocket, SSE, registro de webhook, assinatura de eventos ou esquema de evento nos itens capturados.

[INFERIDO] Polling desses endpoints é uma possibilidade de integração, não um mecanismo interno confirmado. [DOCUMENTADO] Frequência recomendada, limites de consulta, latência, timestamp de snapshot, cursor incremental, ordem, reconexão e deduplicação de eventos são desconhecidos. O campo `event` do relatório E12 é classificação do registro; não demonstra transporte em tempo real.

[DOCUMENTADO] E19 descreve `paused`, `status`, `current_call` sem exemplo de payload. E24 não tem exemplo de resposta. [INFERIDO] Não é possível calcular ocupação, SLA da fila ou tempo de espera atual de forma confiável somente com o contrato publicado.

## Relatórios

| Operação | Filtros e retorno |
|---|---|
| E06 registro de agentes | [DOCUMENTADO] GET sem filtros publicados; envelope paginado e sessões em `report_data` |
| E07 pausas | [DOCUMENTADO] GET sem filtros publicados; envelope paginado, motivo, início/fim, duração, limite e aprovação |
| E12 CallCenter | [DOCUMENTADO] POST; seis campos obrigatórios descritos em `05-regras-de-negocio.md`; dois exemplos de objeto, sintético e analítico, sem envelope ou array externo |
| E23 PABX | [DOCUMENTADO] POST com `report_type`, `group_by`, datas e horas; exemplo de agrupamento `cost_center`; resposta HTTP 200 com corpo vazio |
| E25 satisfação | [DOCUMENTADO] GET com query, sem host/caminho; excluído do OpenAPI paths |
| E26 gráfico de satisfação | [DOCUMENTADO] GET `/api/satisfaction_survey_generic_reports/graphic`; mesmos oito filtros de E25; sem resposta |

[DOCUMENTADO] E12 inclui `interval`, `status`, `call_type`, `hangupcause`, `agent_code`, `agent_name`, `src`, `dst`, `call`, `ddd_src`, `ddd_dst`, `operator_id`, `queue`, `group_by`, `billsec`, `wait`, além dos seis obrigatórios. A descrição de `billsec`/`wait` fala em valores acima de X segundos; inclusão de igualdade e múltiplos valores desconhecida. `queues` e `queue` coexistem. O exemplo usa `interval="yes"`, enquanto o comentário fala em “Yes”/“No”; sensibilidade a caixa desconhecida.

[DOCUMENTADO] E25/E26 incluem `report_type`, `queue_name`, `agent_code`, `agent_name`, `date_started_at`, `date_ended_at`, `time_started_at`, `time_ended_at`. Os valores de query misturam valor e explicação após hífen. [INFERIDO] Os sufixos parecem instruções humanas; não devem ser assumidos como valores válidos do servidor. O contrato registra as chaves sem inventar valores finais.

[DOCUMENTADO] Métricas sintéticas E12: `total_answered`, `total_time_answered`, `total_not_answered`, `total_time_not_answered`, `total_not_answered_agent`, `total_time_not_answered_agent`, `total_time_wait`, `total_busy`, `total`, `total_complete_agent`, `total_complete_caller`, `total_transfer`; todas numéricas no exemplo.

[INFERIDO] Média de atendimento poderia ser `total_time_answered / total_answered`, mas a API não publica essa fórmula como métrica. [DOCUMENTADO] SLA, TMA, TME, abandono percentual, NPS e CSAT não têm fórmulas ou schemas publicados. A introdução de satisfação menciona NPS/CSAT sem descrever cálculo, notas, escala ou limiares.

[DOCUMENTADO] `report_type="synthetic"` aparece nos requests. Há exemplo nomeado analítico, mas o valor de request que seleciona esse modo é desconhecido. [INFERIDO] Não inventar `analytic`, `analytical` ou equivalente como enum. `openapi.yaml` usa alternativas de resposta sem afirmar regra de seleção.

[DOCUMENTADO] Período máximo, abrangência das datas, fuso dos filtros, consistência de snapshot, paginação de request, ordenação e exportação CSV/XLSX/PDF são desconhecidos. Só há exemplos textuais JSON e resposta vazia E23. Nenhum job assíncrono de relatório ou URL de exportação está publicado.

## Gravações

[DOCUMENTADO][SENSÍVEL — DADOS] E05: GET `/api/v2/audios/download`, token no header, query `callid` com descrição que diz CallerId. `format` é opcional, aceita os formatos indicados ogg/wav e tem padrão ogg. Não há exemplo de resposta, header de mídia, redirect ou conteúdo binário.

[DOCUMENTADO] A introdução da pasta menciona acesso a gravações para escuta. Não há endpoint de listagem de gravações, reprodução separado, exclusão ou retenção. E12 analítico contém `file` string e `record` string; relação com download é desconhecida.

| Questão | Resultado |
|---|---|
| Identificador para download | [DOCUMENTADO] Parâmetro `callid`; equivalência com CallerId/linkedid/id desconhecida |
| Resposta binária ou URL | [DOCUMENTADO] Desconhecida |
| URL assinada, expiração ou redirect | [DOCUMENTADO] Desconhecidos |
| MIME, codec, canais e taxa de amostragem | [DOCUMENTADO] Desconhecidos; ogg/wav são formatos indicados, sem especificação técnica do áudio |
| Streaming/Range e escuta parcial | [DOCUMENTADO] Desconhecidos |
| Ausência de gravação | [DOCUMENTADO] Status, erro e política de disponibilidade desconhecidos |
| Retenção, exclusão e autorização por gravação | [DOCUMENTADO] Desconhecidas |
| Múltiplos trechos por transferência | [DOCUMENTADO] Desconhecidos |

[INFERIDO] O nome “download” não basta para declarar `audio/ogg`, `audio/wav`, Content-Disposition, suporte a Range ou URL assinada no OpenAPI. O contrato mantém resposta desconhecida e não baixa qualquer gravação.
