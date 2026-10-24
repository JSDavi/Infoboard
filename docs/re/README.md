# Reconstrução documental da API Beatrix

> Manutenção de 24/10/2026: contratos e análises foram preservados como referência, sem integrar o runtime do painel passivo. As capturas brutas de `raw/` foram arquivadas no backup externo da limpeza; referências a esses arquivos descrevem a aquisição original. Literais de credenciais nos exemplos foram substituídos por placeholders, sem testar sua validade.

[DOCUMENTADO] Fonte única: [documentação pública Postman](https://documenter.getpostman.com/view/47894186/2sB3HjLgWE), capturada em **24/10/2026**. Há 26 itens em 9 pastas, 24 operações com rota completa e 15 exemplos de resposta. Somente 2 exemplos informam HTTP. Nenhuma operação Beatrix foi executada.

[INFERIDO] Este material é um contrato parcial para preparar integração ou reimplementação. Não demonstra o funcionamento interno, a disponibilidade atual dos endpoints nem equivalência funcional com o servidor.

- **[DOCUMENTADO]**: explícito no texto, request ou exemplo; exemplos não garantem obrigatoriedade, exaustividade ou comportamento em produção.
- **[INFERIDO]**: interpretação sustentada por evidência identificada.
- **[HIPÓTESE]**: possibilidade que exige confirmação.
- **[SENSÍVEL]**: operação que altera atendimento, filas, pausas, chamadas ou envio de SMS. Conteúdo de gravações, senhas e dados pessoais também recebe sinalização de sensibilidade, mesmo em leituras.

[DOCUMENTADO] IDs E01–E26 e JSON Pointers de `evidence.json` remetem a `raw/postman-collection.json`. `raw/manifest.json` registra aquisição, hashes e limites. A collection capturada declara schema Postman **v2.0**; a collection de testes gerada usa **v2.1**.

| Arquivo | Conteúdo |
|---|---|
| `01-contrato-e-auth.md` | [DOCUMENTADO]/[INFERIDO] Contrato e autenticação |
| `02-endpoints.md` | [DOCUMENTADO] Todos os itens, campos, headers e exemplos saneados |
| `03-modelo-de-dados.md` | [DOCUMENTADO]/[INFERIDO] Campos, entidades e ER |
| `04-estados-e-fluxos.md` | [DOCUMENTADO]/[INFERIDO]/[HIPÓTESE] Estados e sequências |
| `05-regras-de-negocio.md` | [DOCUMENTADO]/[INFERIDO] Regras, cálculos e convenções |
| `06-tempo-real-relatorios-gravacoes.md` | [DOCUMENTADO]/[INFERIDO] Monitoramento, relatórios e áudio |
| `07-arquitetura-provavel.md` | [INFERIDO]/[HIPÓTESE] Arquitetura e evidências |
| `08-lacunas-riscos-perguntas.md` | [DOCUMENTADO]/[INFERIDO] Lacunas e perguntas prioritárias |
| `openapi.yaml` | [INFERIDO] OpenAPI 3.1 parcial, serializado como JSON compatível com YAML 1.2 |
| `types/beatrix.ts` | [INFERIDO] Tipos derivados dos exemplos, sem cliente que execute requests |
| `contracts/beatrix.postman_collection.json` | [INFERIDO] Testes de contrato restritos a mock local, bloqueados por padrão |
| `contracts/validate.mjs` | [INFERIDO] Verificação estrutural e de exemplos, inteiramente offline |
| `contracts/validation-report.json` | [DOCUMENTADO] Resultado da execução offline |
| `evidence.json` | [DOCUMENTADO] Inventário normalizado e saneado com rastreabilidade |
| `raw/` | [DOCUMENTADO] Captura original, HTML/texto renderizado e metadados |

[DOCUMENTADO] A leitura inicial da rota singular `/api/collection/...` retornou HTTP 404. Playwright renderizou a página e capturou a resposta documental da rota plural `/api/collections/...`, carregada pela própria página. A interface inicialmente mostrou apenas a introdução e parte de Agents; a análise percorreu todos os itens do JSON salvo, incluindo as outras pastas.

[INFERIDO] **Trate `raw/` como restrito**: preserva o conteúdo original solicitado e pode conter dados pessoais, senha de ramal e cookie de exemplo. Os artefatos fora de `raw/` usam valores mascarados ou sintéticos; não distribua o bruto junto deles.

[INFERIDO] Para repetir a validação local: `node docs/re/contracts/validate.mjs`. Os testes Postman só aceitam `http://127.0.0.1:4010/` ou `http://localhost:4010/`, exigem `mock_confirmed=true` e não foram executados por rede. Um mock ainda precisa ser fornecido; nenhum foi iniciado nesta tarefa.
