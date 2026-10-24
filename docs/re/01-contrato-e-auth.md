# Contrato e autenticação

[DOCUMENTADO] Fonte: [Postman Beatrix](https://documenter.getpostman.com/view/47894186/2sB3HjLgWE). Evidências locais: `raw/postman-collection.json#/info`, descrições das pastas e E01–E26 em `evidence.json`. Captura: 24/10/2026. Nenhuma chamada operacional realizada.

| Aspecto | Resultado |
|---|---|
| Host | [DOCUMENTADO] `https://app.npxtech.com.br` nas URLs completas |
| Prefixos | [DOCUMENTADO] `/api/` e `/api/v2/` coexistem |
| Ambiente selecionado na página | [DOCUMENTADO] `BEATRIX - PUBLIC`; a interface também mostra `Public` |
| Homologação/produção | [DOCUMENTADO] Ambiente operacional do host e outros hosts: desconhecidos |
| Variável usada nos headers | [DOCUMENTADO] `{{token-beatrix}}` |
| Variáveis/valores de ambiente exportados | [DOCUMENTADO] Não há seção `variable` na raiz da collection; `raw/postman-metadata.json#/environments` publica `BEATRIX - PUBLIC` com lista `values` vazia |
| Autenticação | [DOCUMENTADO] Header `access-token`; requests usam principalmente `Access-token`, E26 usa `Access-Token` |
| Obtenção do token | [DOCUMENTADO] Fornecido pelo suporte NPX, conforme descrições das pastas |
| Endpoint de emissão, refresh ou revogação | [DOCUMENTADO] Desconhecido; nenhum item correspondente na collection |
| Expiração, formato, JWT, escopos e rotação | [DOCUMENTADO] Desconhecidos |
| Papéis e permissões | [DOCUMENTADO] 403 é citado genericamente por falta de permissão; matriz de papéis e autorização por empresa/fila desconhecidas |
| Sessão do agente | [DOCUMENTADO] E09 recebe `code`, `password`, `queue`, `extension`; não documenta emissão de token de API |
| Sessão HTTP | [DOCUMENTADO] Um exemplo E16 contém `Set-Cookie`; valor omitido. Necessidade do cookie em integrações desconhecida |

[DOCUMENTADO] E01, E25 e E26 registram `auth.type=noauth` no Postman e simultaneamente contêm header de token. [INFERIDO] `noauth` desliga o mecanismo de autenticação do cliente Postman, sem provar acesso público: o token é enviado manualmente.

[DOCUMENTADO] Os metadados indicam tag documental `latest`, data de publicação `2025-09-22T18:26:43.000Z` e campo `collection.info.version` com valor `8.12.10`. [DOCUMENTADO] O significado deste último campo e sua relação com a versão da API são desconhecidos; não foi tratado como versão do servidor. A data de captura é distinta da data de publicação e não comprova atualização recente de todos os exemplos.

[DOCUMENTADO] A pasta Agents menciona 400, 401, 403, 404 e 500, com explicações genéricas. Não oferece schema uniforme de erro ou garantia de que esses códigos se apliquem a todas as operações. E08 e E09 mostram `status: -1` e mensagens de erro, sem código HTTP.

[DOCUMENTADO] 15 exemplos de resposta: 13 sem código HTTP; E16 e E23 registram 200. E23 tem corpo vazio. [INFERIDO] A especificação usa `default` quando o código não é conhecido, evitando atribuir 200 a exemplos apenas intitulados “sucesso”.

[DOCUMENTADO] Há corpos raw marcados como JSON com comentários `//`. Só E01 e os itens de satisfação explicitam `Content-Type: application/json` em seus requests principais. [INFERIDO] O OpenAPI representa os corpos como JSON pela linguagem indicada no Postman; os testes removem comentários e enviam Content-Type JSON ao mock. Aceitação real de mídia pelo servidor é desconhecida.

[DOCUMENTADO] Exemplos de resposta por vezes registram `Access-token` ou a grafia `Acess-token` como header de resposta. [INFERIDO] Podem ser artefatos de edição da documentação; não há evidência de que o servidor devolva o token, nem de que `Acess-token` seja um header de autenticação válido.

[DOCUMENTADO] TLS está presente no esquema das URLs. Rate limit, SLA, timeout, CORS efetivo, allowlist de IPs, limites de payload, idempotência e política de retries são desconhecidos. Um exemplo histórico E16 tem CORS `*`, mas não lista o header de token em `Access-Control-Allow-Headers`. [INFERIDO] Uma integração pelo navegador pode depender de configuração adicional; não foi testada.

[INFERIDO] Antes de integrar, obter token e ambiente isolado com o mantenedor, confirmar escopos e resolver as perguntas de `08-lacunas-riscos-perguntas.md`. Isso é orientação de integração; nenhuma autenticação foi tentada.
