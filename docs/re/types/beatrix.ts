/** [DOCUMENTADO] Campos e tipos observados em exemplos Postman.
 * Obrigatoriedade desconhecida => opcional. null isolado => unknown.
 * [INFERIDO] Organização destes tipos; não representa esquema completo do servidor.
 * Ver ../evidence.json para rastreabilidade. Nenhuma credencial ou dado pessoal incluído. */

export type E01Request = {
  "pause_type_code"?: string;
  [field: string]: unknown;
};

export type E01Response0 = {
  "message"?: string;
  "status"?: number;
  [field: string]: unknown;
};

export type E02Response0 = {
  "message"?: string;
  "status"?: number;
  [field: string]: unknown;
};

export type E03Request = {
  "queue_id"?: string;
  "extension"?: string;
  "penalty"?: string;
  [field: string]: unknown;
};

export type E03Response0 = {
  "message"?: string;
  "status"?: number;
  [field: string]: unknown;
};

export type E04Request = {
  "queue_id"?: string;
  [field: string]: unknown;
};

export type E06Response0 = {
  "current_page"?: number;
  "per_page"?: number;
  "total_count"?: number;
  "total_pages"?: number;
  "report_data"?: Array<{
  "ramal"?: string;
  "code"?: string;
  "agent_name"?: string;
  "queue"?: string;
  "logon_date"?: string;
  "logoff_date"?: unknown;
  [field: string]: unknown;
}>;
  [field: string]: unknown;
};

export type E07Response0 = {
  "current_page"?: number;
  "per_page"?: number;
  "total_count"?: number;
  "total_pages"?: number;
  "report_data"?: Array<{
  "ramal"?: string;
  "code"?: string;
  "agent_name"?: string;
  "queue"?: string;
  "pause"?: string;
  "pause_start"?: string;
  "pause_finish"?: string;
  "max_minutes"?: unknown;
  "pause_duration_minutes"?: string;
  "approved_by_supervisor"?: string;
  [field: string]: unknown;
}>;
  [field: string]: unknown;
};

export type E08Response0 = {
  "status"?: number;
  "message"?: string;
  [field: string]: unknown;
};

export type E09Request = {
  "code"?: string;
  "password"?: string;
  "queue"?: string;
  "extension"?: string;
  [field: string]: unknown;
};

export type E09Response0 = {
  "status"?: number;
  "message"?: string;
  [field: string]: unknown;
};

export type E11Response0 = {
  "id"?: number;
  "agent_code"?: string;
  "queue"?: string;
  "linkedid"?: string;
  "call_datetime"?: string;
  "client_name"?: string;
  "client_extra_info"?: string;
  "call_motive"?: string;
  "call_obs"?: string;
  "protocol"?: string;
  "cpf_cnpj"?: string;
  "call_status"?: string;
  [field: string]: unknown;
};

export type E12Request = {
  "interval"?: string;
  "report_type": string;
  "queues": string;
  "date_started_at": string;
  "time_started_at": string;
  "date_ended_at": string;
  "time_ended_at": string;
  "status"?: string;
  "call_type"?: string;
  "hangupcause"?: string;
  "agent_code"?: string;
  "agent_name"?: string;
  "src"?: string;
  "dst"?: string;
  "call"?: string;
  "ddd_src"?: string;
  "ddd_dst"?: string;
  "operator_id"?: string;
  "queue"?: string;
  "group_by"?: string;
  "billsec"?: string;
  "wait"?: string;
  [field: string]: unknown;
};

export type E12Response0 = {
  "queue_name"?: string;
  "agent_code"?: string;
  "agent_name"?: string;
  "total_answered"?: number;
  "total_time_answered"?: number;
  "total_not_answered"?: number;
  "total_time_not_answered"?: number;
  "total_not_answered_agent"?: number;
  "total_time_not_answered_agent"?: number;
  "total_time_wait"?: number;
  "total_busy"?: number;
  "total"?: number;
  "total_complete_agent"?: number;
  "total_complete_caller"?: number;
  "total_transfer"?: number;
  [field: string]: unknown;
};

export type E12Response1 = {
  "calldatetime"?: string;
  "billsec"?: number;
  "wait"?: number;
  "agent_code"?: string;
  "src"?: string;
  "dst"?: string;
  "queue_name"?: string;
  "operator_name"?: string;
  "trunk"?: number;
  "bound"?: number;
  "call_type_name"?: string;
  "status"?: string;
  "linkedid"?: string;
  "file"?: string;
  "record"?: string;
  "hangupcause"?: number;
  "event"?: string;
  "campaign_name"?: unknown;
  "protocol"?: string;
  [field: string]: unknown;
};

export type E13Request = {
  "campaign_id"?: number;
  "messages"?: Array<{
  "number"?: string;
  "message"?: string;
  [field: string]: unknown;
}>;
  [field: string]: unknown;
};

export type E13Response0 = {
  "status"?: number;
  "messages_returns"?: Array<{
  "number"?: string;
  "message_id"?: string;
  "send"?: string;
  [field: string]: unknown;
}>;
  [field: string]: unknown;
};

export type E15Response0 = {
  "current_page"?: number;
  "per_page"?: number;
  "total_count"?: number;
  "total_pages"?: number;
  "extensions"?: Array<{
  "category"?: string;
  "callerid"?: string;
  "ddr"?: string;
  "secret"?: string;
  "context_name"?: string;
  "cost_center_name"?: string;
  "company_name"?: string;
  "operator_name"?: string;
  [field: string]: unknown;
}>;
  [field: string]: unknown;
};

export type E16Request = {
  "extension"?: string;
  "number"?: string;
  [field: string]: unknown;
};

export type E16Response0 = {
  "callid"?: string;
  "status"?: number;
  [field: string]: unknown;
};

export type E20Request = {
  "id"?: string;
  "campaign_id"?: string;
  [field: string]: unknown;
};

export type E21Request = {
  "id"?: string;
  "campaign_id"?: string;
  [field: string]: unknown;
};

export type E22Response0 = {
  "extensions"?: Array<{
  "extension"?: string;
  "status"?: string;
  [field: string]: unknown;
}>;
  [field: string]: unknown;
};

export type E23Request = {
  "report_type"?: string;
  "group_by"?: string;
  "date_started_at"?: string;
  "time_started_at"?: string;
  "date_ended_at"?: string;
  "time_ended_at"?: string;
  [field: string]: unknown;
};

/** [DOCUMENTADO] Valores descritos; exaustividade desconhecida. */
export type KnownAgentStatus = -1 | 0 | 1 | 2 | 5;
export type KnownPabxCallStatus = 2 | 5 | 7 | 8 | 9;
/** [DOCUMENTADO] Campos descritos em E19; current_call sem estrutura conhecida. */
export interface AgentStatusDescription { paused?: 0 | 1; status?: KnownAgentStatus | (number & {}); current_call?: unknown; [field: string]: unknown; }
/** [DOCUMENTADO] Formatos indicados em E05. */
export type AudioFormat = "ogg" | "wav";
/** [INFERIDO] Ligação de operações aos exemplos; unknown preserva respostas ausentes. */
export interface OperationEvidence {
  E01: { request: E01Request; response: E01Response0 };
  E02: { request: unknown; response: E02Response0 };
  E03: { request: E03Request; response: E03Response0 };
  E04: { request: E04Request; response: unknown };
  E05: { request: unknown; response: unknown };
  E06: { request: unknown; response: E06Response0 };
  E07: { request: unknown; response: E07Response0 };
  E08: { request: unknown; response: E08Response0 };
  E09: { request: E09Request; response: E09Response0 };
  E10: { request: unknown; response: unknown };
  E11: { request: unknown; response: E11Response0 };
  E12: { request: E12Request; response: E12Response0 | E12Response1 };
  E13: { request: E13Request; response: E13Response0 };
  E14: { request: unknown; response: unknown };
  E15: { request: unknown; response: E15Response0 };
  E16: { request: E16Request; response: E16Response0 };
  E17: { request: unknown; response: unknown };
  E18: { request: unknown; response: unknown };
  E19: { request: unknown; response: unknown };
  E20: { request: E20Request; response: unknown };
  E21: { request: E21Request; response: unknown };
  E22: { request: unknown; response: E22Response0 };
  E23: { request: E23Request; response: unknown };
  E24: { request: unknown; response: unknown };
  E25: { request: unknown; response: unknown };
  E26: { request: unknown; response: unknown };
}
