# Inventário de endpoints

[DOCUMENTADO] Fonte: [Postman público](https://documenter.getpostman.com/view/47894186/2sB3HjLgWE), captura em 24/10/2026. Evidência local: `raw/postman-collection.json`; IDs abaixo apontam para JSON Pointers neste arquivo. Conteúdo observado na documentação, sem execução.

[INFERIDO] Tipos derivam dos valores dos exemplos, sem garantia de obrigatoriedade ou exaustividade. Campos, exemplos saneados e metadados também estão em `evidence.json`.

[DOCUMENTADO] 26 itens, 24 operações com caminho completo e 2 itens incompletos; nenhuma rota criada para estes últimos.

| ID | Método | Caminho | Classificação | Exemplos de resposta |
|---|---|---|---|---|
| E01 | POST | `/api/v2/agents/{agent_code}/pause` | [DOCUMENTADO] [SENSÍVEL] | 1 |
| E02 | POST | `/api/v2/agents/{agent_code}/unpause` | [DOCUMENTADO] [SENSÍVEL] | 1 |
| E03 | POST | `/api/v2/agents/{agent_code}/add_to_queue` | [DOCUMENTADO] [SENSÍVEL] | 1 |
| E04 | POST | `/api/v2/agents/{agent_code}/remove_to_queue` | [DOCUMENTADO] [SENSÍVEL] | 0 |
| E05 | GET | `/api/v2/audios/download` | [DOCUMENTADO] | 0 |
| E06 | GET | `/api/call_center_reports/report_register_points_details` | [DOCUMENTADO] | 1 |
| E07 | GET | `/api/call_center_reports/report_pause_details` | [DOCUMENTADO] | 1 |
| E08 | GET | `/api/callcenter/{id}` | [DOCUMENTADO] | 1 |
| E09 | POST | `/api/callcenter/logon` | [DOCUMENTADO] [SENSÍVEL] | 1 |
| E10 | POST | `/api/callcenter/{id}/logoff` | [DOCUMENTADO] [SENSÍVEL] | 0 |
| E11 | GET | `/api/callcenter/{id}/info` | [DOCUMENTADO] | 1 |
| E12 | POST | `/api/v2/callcenter/report` | [DOCUMENTADO] | 2 |
| E13 | POST | `/api/campaigns/sms` | [DOCUMENTADO] [SENSÍVEL] | 1 |
| E14 | GET | desconhecido | [DOCUMENTADO] | 0 |
| E15 | GET | `/api/extensions` | [DOCUMENTADO] | 1 |
| E16 | POST | `/api/pabx` | [DOCUMENTADO] [SENSÍVEL] | 1 |
| E17 | GET | `/api/pabx/{id}` | [DOCUMENTADO] | 0 |
| E18 | POST | `/api/pabx/{id}/close` | [DOCUMENTADO] [SENSÍVEL] | 0 |
| E19 | GET | `/api/pabx/{id}/agent_status` | [DOCUMENTADO] | 0 |
| E20 | POST | `/api/pabx/unpause` | [DOCUMENTADO] [SENSÍVEL] | 0 |
| E21 | POST | `/api/pabx/pause` | [DOCUMENTADO] [SENSÍVEL] | 0 |
| E22 | POST | `/api/v2/pabx/extensions` | [DOCUMENTADO] | 1 |
| E23 | POST | `/api/v2/pabx/report` | [DOCUMENTADO] | 1 |
| E24 | GET | `/api/v2/queues/{queue_id}/wait_calls` | [DOCUMENTADO] | 0 |
| E25 | GET | desconhecido | [DOCUMENTADO] | 0 |
| E26 | GET | `/api/satisfaction_survey_generic_reports/graphic` | [DOCUMENTADO] | 0 |

## E01 — Colocar um agente em pausa

[DOCUMENTADO] Evidência: `/item/0/item/0`. **[SENSÍVEL]**. Método `POST`; rota `/api/v2/agents/{agent_code}/pause`.

[DOCUMENTADO] 👤O campo agent_code é código do agente dentro do Beatrix.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`, `Content-Type: application/json`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `agent_code` | path | [DOCUMENTADO] [DOCUMENTADO] Placeholder na rota. Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `pause_type_code` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "pause_type_code": "[MASCARADO]"
}
```

[DOCUMENTADO] Resposta 0: “Retorno de sucesso”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `message` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `status` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |

```json
{
  "message": "Sucesso",
  "status": 1
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E02 — Retira um agente em pausa

[DOCUMENTADO] Evidência: `/item/0/item/1`. **[SENSÍVEL]**. Método `POST`; rota `/api/v2/agents/{agent_code}/unpause`.

[DOCUMENTADO] 👤O campo agent_code é código do agente dentro do Beatrix

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `agent_code` | path | [DOCUMENTADO] [DOCUMENTADO] Placeholder na rota. Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Resposta 0: “Retorno de sucesso”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `message` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `status` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |

```json
{
  "message": "Sucesso",
  "status": 1
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E03 — Inserir agente na fila

[DOCUMENTADO] Evidência: `/item/0/item/2`. **[SENSÍVEL]**. Método `POST`; rota `/api/v2/agents/{agent_code}/add_to_queue`.

[DOCUMENTADO] 👤O campo agent_code é código do agente dentro do Beatrix

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `agent_code` | path | [DOCUMENTADO] [DOCUMENTADO] Placeholder na rota. Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `queue_id` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extension` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `penalty` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "queue_id": "[MASCARADO]",
  "extension": "[MASCARADO]",
  "penalty": "X"
}
```

[DOCUMENTADO] Resposta 0: “Retorno com sucesso”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `message` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `status` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |

```json
{
  "message": "Sucesso",
  "status": 1
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E04 — Remover agente da fila

[DOCUMENTADO] Evidência: `/item/0/item/3`. **[SENSÍVEL]**. Método `POST`; rota `/api/v2/agents/{agent_code}/remove_to_queue`.

[DOCUMENTADO] 👤O campo agent_code é código do agente dentro do Beatrix

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `agent_code` | path | [DOCUMENTADO] [DOCUMENTADO] Placeholder na rota. Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `queue_id` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "queue_id": "[MASCARADO]"
}
```

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E05 — Solicita o download de uma chamada

[DOCUMENTADO] Evidência: `/item/1/item/0`. Método `GET`; rota `/api/v2/audios/download`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `callid` | query | [DOCUMENTADO] Insira o CallerId de uma ligação Obrigatoriedade: desconhecida. |
| `format` | query | [DOCUMENTADO] Opcional, caso não preenchido o formato será ogg Obrigatoriedade: opcional. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E06 — Detalhes de pontos de registro de agentes

[DOCUMENTADO] Evidência: `/item/2/item/0`. Método `GET`; rota `/api/call_center_reports/report_register_points_details`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Resposta 0: “Exemplo de retorno com sucesso”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `current_page` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `per_page` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_count` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_pages` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `report_data` | [DOCUMENTADO] array | [DOCUMENTADO] desconhecida |
| `report_data[].ramal` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].code` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].agent_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].queue` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].logon_date` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].logoff_date` | [DOCUMENTADO] null observado; tipo não nulo desconhecido | [DOCUMENTADO] desconhecida |

```json
{
  "current_page": 1,
  "per_page": 3,
  "total_count": 3,
  "total_pages": 1,
  "report_data": [
    {
      "ramal": "[MASCARADO]",
      "code": "[MASCARADO]",
      "agent_name": "[MASCARADO]",
      "queue": "[MASCARADO]",
      "logon_date": "2025-09-17T16:00:17.716-03:00",
      "logoff_date": null
    },
    {
      "ramal": "[MASCARADO]",
      "code": "[MASCARADO]",
      "agent_name": "[MASCARADO]",
      "queue": "[MASCARADO]",
      "logon_date": "2025-09-17T16:00:17.716-03:00",
      "logoff_date": null
    },
    {
      "ramal": "[MASCARADO]",
      "code": "[MASCARADO]",
      "agent_name": "[MASCARADO]",
      "queue": "[MASCARADO]",
      "logon_date": "2025-09-17T16:00:17.716-03:00",
      "logoff_date": null
    }
  ]
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E07 — Detalhes de pausas de agentes

[DOCUMENTADO] Evidência: `/item/2/item/1`. Método `GET`; rota `/api/call_center_reports/report_pause_details`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Resposta 0: “Exemplo de retorno com sucesso”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `current_page` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `per_page` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_count` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_pages` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `report_data` | [DOCUMENTADO] array | [DOCUMENTADO] desconhecida |
| `report_data[].ramal` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].code` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].agent_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].queue` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].pause` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].pause_start` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].pause_finish` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].max_minutes` | [DOCUMENTADO] null observado; tipo não nulo desconhecido | [DOCUMENTADO] desconhecida |
| `report_data[].pause_duration_minutes` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_data[].approved_by_supervisor` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "current_page": 1,
  "per_page": 3,
  "total_count": 3,
  "total_pages": 1,
  "report_data": [
    {
      "ramal": "[MASCARADO]",
      "code": "[MASCARADO]",
      "agent_name": "[MASCARADO]",
      "queue": "[MASCARADO]",
      "pause": "[MASCARADO]",
      "pause_start": "2025-09-17T07:59:37.275-03:00",
      "pause_finish": "2025-09-17T08:06:14.998-03:00",
      "max_minutes": null,
      "pause_duration_minutes": "6.6287025166666667",
      "approved_by_supervisor": "NÃO"
    },
    {
      "ramal": "[MASCARADO]",
      "code": "[MASCARADO]",
      "agent_name": "[MASCARADO]",
      "queue": "[MASCARADO]",
      "pause": "[MASCARADO]",
      "pause_start": "2025-09-17T07:59:37.275-03:00",
      "pause_finish": "2025-09-17T08:06:14.998-03:00",
      "max_minutes": null,
      "pause_duration_minutes": "6.6287025166666667",
      "approved_by_supervisor": "NÃO"
    },
    {
      "ramal": "[MASCARADO]",
      "code": "[MASCARADO]",
      "agent_name": "[MASCARADO]",
      "queue": "[MASCARADO]",
      "pause": "[MASCARADO]",
      "pause_start": "2025-09-17T07:59:37.275-03:00",
      "pause_finish": "2025-09-17T08:06:14.998-03:00",
      "max_minutes": null,
      "pause_duration_minutes": "6.6287025166666667",
      "approved_by_supervisor": "NÃO"
    }
  ]
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E08 — Retorna o status de uma chamada

[DOCUMENTADO] Evidência: `/item/3/item/0`. Método `GET`; rota `/api/callcenter/{id}`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `id` | path | [DOCUMENTADO] Colocar o ID da chamada Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Resposta 0: “Retorna o status de uma chamada”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `status` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `message` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "status": -1,
  "message": "[MASCARADO]"
}
```

[DOCUMENTADO] Erros por operação: há payload de erro com `status: -1`, mas HTTP desconhecido. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E09 — Faz o login do agente na fila

[DOCUMENTADO] Evidência: `/item/3/item/1`. **[SENSÍVEL]**. Método `POST`; rota `/api/callcenter/logon`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `code` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `password` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `queue` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extension` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "code": "[MASCARADO]",
  "password": "<definir-localmente>",
  "queue": "[MASCARADO]",
  "extension": "[MASCARADO]"
}
```

[DOCUMENTADO] Resposta 0: “Faz o login do agente na fila”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `status` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `message` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "status": -1,
  "message": "[MASCARADO]"
}
```

[DOCUMENTADO] Erros por operação: há payload de erro com `status: -1`, mas HTTP desconhecido. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E10 — Faz o logoff do agente na fila

[DOCUMENTADO] Evidência: `/item/3/item/2`. **[SENSÍVEL]**. Método `POST`; rota `/api/callcenter/{id}/logoff`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `id` | path | [DOCUMENTADO] Insira o valor do agente na fila Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E11 — Retorna os dados da chamada (Atendimento)

[DOCUMENTADO] Evidência: `/item/3/item/3`. Método `GET`; rota `/api/callcenter/{id}/info`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `id` | path | [DOCUMENTADO] Coloque o id da chamada Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Resposta 0: “Como deve retornar com sucesso”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `id` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `agent_code` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `queue` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `linkedid` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `call_datetime` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `client_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `client_extra_info` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `call_motive` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `call_obs` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `protocol` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `cpf_cnpj` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `call_status` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "id": 1,
  "agent_code": "[MASCARADO]",
  "queue": "[MASCARADO]",
  "linkedid": "[MASCARADO]",
  "call_datetime": "2000-01-01T00:00:00-03:00",
  "client_name": "[MASCARADO]",
  "client_extra_info": "[MASCARADO]",
  "call_motive": "[MASCARADO]",
  "call_obs": "[MASCARADO]",
  "protocol": "[MASCARADO]",
  "cpf_cnpj": "[MASCARADO]",
  "call_status": "[MASCARADO]"
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E12 — Retorna os dados do relatório de chamada do CallCenter

[DOCUMENTADO] Evidência: `/item/3/item/4`. Método `POST`; rota `/api/v2/callcenter/report`.

[DOCUMENTADO] Como a ligação foi finalizada: -1 Abandono 0 Fila 1 Cliente 2 Transferido. ⚠️Campos obrigratórios: report_type, queues, date_started_at, time_started_at, date_ended_at, time_ended_at

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `interval` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `report_type` | [DOCUMENTADO] string | [DOCUMENTADO] obrigatório |
| `queues` | [DOCUMENTADO] string | [DOCUMENTADO] obrigatório |
| `date_started_at` | [DOCUMENTADO] string | [DOCUMENTADO] obrigatório |
| `time_started_at` | [DOCUMENTADO] string | [DOCUMENTADO] obrigatório |
| `date_ended_at` | [DOCUMENTADO] string | [DOCUMENTADO] obrigatório |
| `time_ended_at` | [DOCUMENTADO] string | [DOCUMENTADO] obrigatório |
| `status` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `call_type` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `hangupcause` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `agent_code` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `agent_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `src` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `dst` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `call` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `ddd_src` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `ddd_dst` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `operator_id` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `queue` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `group_by` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `billsec` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `wait` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "interval": "yes",
  "report_type": "synthetic",
  "queues": "[MASCARADO]",
  "date_started_at": "2019-01-01",
  "time_started_at": "00:00:00",
  "date_ended_at": "2019-06-06",
  "time_ended_at": "23:59:59",
  "status": "ANSWERED",
  "call_type": "OUTBOUND",
  "hangupcause": "NORMAL_CLEARING",
  "agent_code": "[MASCARADO]",
  "agent_name": "[MASCARADO]",
  "src": "[MASCARADO]",
  "dst": "[MASCARADO]",
  "call": "voice",
  "ddd_src": "85",
  "ddd_dst": "85",
  "operator_id": "[MASCARADO]",
  "queue": "[MASCARADO]",
  "group_by": "npx_sup",
  "billsec": "30",
  "wait": "10"
}
```

[DOCUMENTADO] Resposta 0: “Dados Sinteticos”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `queue_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `agent_code` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `agent_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `total_answered` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_time_answered` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_not_answered` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_time_not_answered` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_not_answered_agent` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_time_not_answered_agent` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_time_wait` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_busy` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_complete_agent` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_complete_caller` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_transfer` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |

```json
{
  "queue_name": "[MASCARADO]",
  "agent_code": "[MASCARADO]",
  "agent_name": "[MASCARADO]",
  "total_answered": 69,
  "total_time_answered": 7197,
  "total_not_answered": 54,
  "total_time_not_answered": 448,
  "total_not_answered_agent": 0,
  "total_time_not_answered_agent": 0,
  "total_time_wait": 1330,
  "total_busy": 0,
  "total": 123,
  "total_complete_agent": 60,
  "total_complete_caller": 63,
  "total_transfer": 0
}
```

[DOCUMENTADO] Resposta 1: “Dados Analíticos”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `calldatetime` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `billsec` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `wait` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `agent_code` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `src` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `dst` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `queue_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `operator_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `trunk` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `bound` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `call_type_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `status` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `linkedid` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `file` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `record` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `hangupcause` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `event` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `campaign_name` | [DOCUMENTADO] null observado; tipo não nulo desconhecido | [DOCUMENTADO] desconhecida |
| `protocol` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "calldatetime": "2000-01-01T00:00:00-03:00",
  "billsec": 20,
  "wait": 20,
  "agent_code": "[MASCARADO]",
  "src": "[MASCARADO]",
  "dst": "[MASCARADO]",
  "queue_name": "[MASCARADO]",
  "operator_name": "[MASCARADO]",
  "trunk": 1,
  "bound": 4,
  "call_type_name": "Celular Local",
  "status": "NOT ANSWERED",
  "linkedid": "[MASCARADO]",
  "file": "[MASCARADO]",
  "record": "1",
  "hangupcause": 1,
  "event": "CDR",
  "campaign_name": null,
  "protocol": "[MASCARADO]"
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E13 — Envio de SMS

[DOCUMENTADO] Evidência: `/item/4/item/0`. **[SENSÍVEL]**. Método `POST`; rota `/api/campaigns/sms`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `campaign_id` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `messages` | [DOCUMENTADO] array | [DOCUMENTADO] desconhecida |
| `messages[].number` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `messages[].message` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "campaign_id": 1,
  "messages": [
    {
      "number": "[MASCARADO]",
      "message": "[MASCARADO]"
    },
    {
      "number": "[MASCARADO]",
      "message": "[MASCARADO]"
    }
  ]
}
```

[DOCUMENTADO] Resposta 0: “Envio de SMS”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `status` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `messages_returns` | [DOCUMENTADO] array | [DOCUMENTADO] desconhecida |
| `messages_returns[].number` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `messages_returns[].message_id` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `messages_returns[].send` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "status": 1,
  "messages_returns": [
    {
      "number": "[MASCARADO]",
      "message_id": "[MASCARADO]"
    },
    {
      "number": "[MASCARADO]",
      "message_id": "[MASCARADO]",
      "send": "false"
    }
  ]
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E14 — Envio para URA (Desenvol.)

[DOCUMENTADO] Evidência: `/item/4/item/1`. Método `GET`; rota **desconhecida**.

[DOCUMENTADO] Headers do request: nenhum registrado neste item; isso não prova ausência de autenticação.

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E15 — Listar ramais

[DOCUMENTADO] Evidência: `/item/5/item/0`. Método `GET`; rota `/api/extensions`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Resposta 0: “Retorno com sucesso”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `current_page` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `per_page` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_count` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `total_pages` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |
| `extensions` | [DOCUMENTADO] array | [DOCUMENTADO] desconhecida |
| `extensions[].category` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extensions[].callerid` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extensions[].ddr` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extensions[].secret` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extensions[].context_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extensions[].cost_center_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extensions[].company_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extensions[].operator_name` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "current_page": 1,
  "per_page": 3,
  "total_count": 125,
  "total_pages": 3,
  "extensions": [
    {
      "category": "[MASCARADO]",
      "callerid": "[MASCARADO]",
      "ddr": "[MASCARADO]",
      "secret": "<definir-localmente>",
      "context_name": "[MASCARADO]",
      "cost_center_name": "[MASCARADO]",
      "company_name": "[MASCARADO]",
      "operator_name": "[MASCARADO]"
    },
    {
      "category": "[MASCARADO]",
      "callerid": "[MASCARADO]",
      "ddr": "[MASCARADO]",
      "secret": "<definir-localmente>",
      "context_name": "[MASCARADO]",
      "cost_center_name": "[MASCARADO]",
      "company_name": "[MASCARADO]",
      "operator_name": "[MASCARADO]"
    },
    {
      "category": "[MASCARADO]",
      "callerid": "[MASCARADO]",
      "ddr": "[MASCARADO]",
      "secret": "<definir-localmente>",
      "context_name": "[MASCARADO]",
      "cost_center_name": "[MASCARADO]",
      "company_name": "[MASCARADO]",
      "operator_name": "[MASCARADO]"
    }
  ]
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E16 — Iniciar uma chamada

[DOCUMENTADO] Evidência: `/item/6/item/0`. **[SENSÍVEL]**. Método `POST`; rota `/api/pabx`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `extension` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `number` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "extension": "[MASCARADO]",
  "number": "[MASCARADO]"
}
```

[DOCUMENTADO] Resposta 0: “Iniciar uma chamada (Desabilitado)”; HTTP 200. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `callid` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `status` | [DOCUMENTADO] number | [DOCUMENTADO] desconhecida |

```json
{
  "callid": "[MASCARADO]",
  "status": 5
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E17 — Retorna o status de uma chamada

[DOCUMENTADO] Evidência: `/item/6/item/1`. Método `GET`; rota `/api/pabx/{id}`.

[DOCUMENTADO] no Header da chamada. Substituir o :id pelo “callid” que foi retornado. Status: 2 - Chamada em andamento 5 - Chamando 7 - Atendida (Chamada já finalizada) 8 - Não atendida (Chamada já finalizada) 9 - Ocupado (Chamada já finalizada)

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `id` | path | [DOCUMENTADO] Coloque o ID da chamada Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E18 — Encerra uma chamada

[DOCUMENTADO] Evidência: `/item/6/item/2`. **[SENSÍVEL]**. Método `POST`; rota `/api/pabx/{id}/close`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `id` | path | [DOCUMENTADO] Coloque o ID da chamada Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E19 — Retorna o status do agente

[DOCUMENTADO] Evidência: `/item/6/item/3`. Método `GET`; rota `/api/pabx/{id}/agent_status`.

[DOCUMENTADO] Substituir o :id pelo código do agente na NPX Principais campos: paused -> indica se o agente está em pausa (0 - não / 1 - sim) status -> indica o status o agente * 0 - Offline * 1 - Livre * 2 - Ocupado * 5 - Ramal chamando * -1 - Em pausa current_call -> Chamada atual com as informações enviada para o discador.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `id` | path | [DOCUMENTADO] Coloque o ID do agente Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E20 — Remove o agente da pause

[DOCUMENTADO] Evidência: `/item/6/item/4`. **[SENSÍVEL]**. Método `POST`; rota `/api/pabx/unpause`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `id` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `campaign_id` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "id": "[MASCARADO]",
  "campaign_id": "[MASCARADO]"
}
```

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E21 — Coloca o agente da pause

[DOCUMENTADO] Evidência: `/item/6/item/5`. **[SENSÍVEL]**. Método `POST`; rota `/api/pabx/pause`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `id` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `campaign_id` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "id": "[MASCARADO]",
  "campaign_id": "[MASCARADO]"
}
```

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E22 — Retorna os status dos extensions (Pendente de teste)

[DOCUMENTADO] Evidência: `/item/6/item/6`. Método `POST`; rota `/api/v2/pabx/extensions`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Resposta 0: “Como deve retornar”; HTTP **desconhecido**. 

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `extensions` | [DOCUMENTADO] array | [DOCUMENTADO] desconhecida |
| `extensions[].extension` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `extensions[].status` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "extensions": [
    {
      "extension": "[MASCARADO]",
      "status": "OFFLINE"
    },
    {
      "extension": "[MASCARADO]",
      "status": "ONLINE"
    }
  ]
}
```

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E23 — Retorna os dados do relatório de chamadas do PABX IP

[DOCUMENTADO] Evidência: `/item/6/item/7`. Método `POST`; rota `/api/v2/pabx/report`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

[DOCUMENTADO] Corpo raw marcado como JSON; exemplos originais contêm comentários `//`, removidos no exemplo abaixo.

| Campo | Tipo observado | Obrigatoriedade |
|---|---|---|
| `report_type` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `group_by` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `date_started_at` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `time_started_at` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `date_ended_at` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |
| `time_ended_at` | [DOCUMENTADO] string | [DOCUMENTADO] desconhecida |

```json
{
  "report_type": "synthetic",
  "group_by": "cost_center",
  "date_started_at": "2019-01-01",
  "time_started_at": "00:00:00",
  "date_ended_at": "2019-06-06",
  "time_ended_at": "23:59:59"
}
```

[DOCUMENTADO] Resposta 0: “Retorno Dados Analítico”; HTTP 200. Corpo do exemplo vazio; conteúdo real desconhecido.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E24 — Retorna as chamadas em espera de uma fila

[DOCUMENTADO] Evidência: `/item/7/item/0`. Método `GET`; rota `/api/v2/queues/{queue_id}/wait_calls`.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `queue_id` | path | [DOCUMENTADO] [DOCUMENTADO] Placeholder na rota. Obrigatoriedade: placeholder de caminho. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E25 — Listar relatório de pesquisa de satisfação

[DOCUMENTADO] Evidência: `/item/8/item/0`. Método `GET`; rota **desconhecida**.

[DOCUMENTADO] Headers do request: `Access-token: {{token-beatrix}}`, `Content-Type: application/json`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `report_type` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `queue_name` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `agent_code` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `agent_name` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `date_started_at` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `date_ended_at` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `time_started_at` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `time_ended_at` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.

## E26 — Dados para gráfico de pesquisa de satisfação

[DOCUMENTADO] Evidência: `/item/8/item/1`. Método `GET`; rota `/api/satisfaction_survey_generic_reports/graphic`.

[DOCUMENTADO] Headers do request: `Access-Token: {{token-beatrix}}`, `Content-Type: application/json`.

| Parâmetro | Local | Descrição / obrigatoriedade |
|---|---|---|
| `report_type` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `queue_name` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `agent_code` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `agent_name` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `date_started_at` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `date_ended_at` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `time_started_at` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |
| `time_ended_at` | query | [DOCUMENTADO] [DOCUMENTADO] Presente na URL; sem descrição separada. Obrigatoriedade: desconhecida. |

[DOCUMENTADO] Nenhum corpo no request principal; isso não especifica se um corpo seria aceito.

[DOCUMENTADO] Sem exemplo de sucesso ou erro; status HTTP, mídia e payload desconhecidos.

[DOCUMENTADO] Erros por operação: nenhum exemplo específico de erro. Referência geral da pasta Agents cita 400, 401, 403, 404 e 500; aplicabilidade a este endpoint desconhecida.
