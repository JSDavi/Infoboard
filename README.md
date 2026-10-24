# InfoBoard

Painel local de acompanhamento de filas, telefonia, chat, escalas e disponibilidade fiscal. O servidor consulta NPX, PrixChat, PBX e fontes auxiliares; o navegador apenas exibe os dados. O login do analista abre o aplicativo oficial NPX em outra janela.

## Executar

Requer Node.js 22 ou superior e npm. Os serviços nativos do instalador requerem Windows; o servidor web utiliza Node.js.

```powershell
npm ci --ignore-scripts
Copy-Item .env.example .env
Copy-Item config/analysts_map.example.json config/analysts_map.json
# Preencha as configuracoes locais antes de iniciar.
npm run dev
```

Não sobrescreva arquivos locais já configurados. A homologação usa [localhost:3001](http://localhost:3001/). Confira a porta antes de iniciar outra instância. `npm run dev` usa as integrações configuradas no `.env`; os testes automatizados usam mocks. `npm start` inicia o servidor respeitando `PORT`.

O `.env` e o mapa real de analistas são locais e ignorados pelo Git. O servidor funciona sem mapa, mas perde as associações complementares de ramais. A instalação de dependências não registra serviço: isso ocorre separadamente por `instalador/install_service.js`. Os scripts históricos do instalador usam a porta 3000 e exigem revisão administrativa antes de execução; não os execute na homologação 3001.

## Estrutura

| Caminho | Responsabilidade |
|---|---|
| `server.js`, `server-security.js` | Coletores, API, limites de rede e tratamento de erros |
| Módulos `*-state.js`, `reconcile-agent-queues.js`, `infoboard-access.js` | Estados e acesso ao painel |
| `sefaz-public.js` | Coleta fiscal atual |
| `sefaz-status.js` | Parser legado mantido com seus testes |
| `public/` | HTML, estilos e JavaScript do navegador |
| `config/*.example.json`, `.env.example` | Exemplos sem dados reais |
| `scripts/`, `tests/` | Desenvolvimento, auditoria e regressão |
| `instalador/` | Implantação Windows, não executada pelos testes |
| `docs/` | Operação, segurança e relatório da limpeza |

## Verificar

```powershell
npm test
npm run check
npm run audit:publication
npm audit
npm run audit:history
```

Execute a auditoria de histórico em uma cópia que contenha `.git`; o pacote de fontes não contém histórico. O comando retorna falha quando encontra indícios. A triagem procura valores conhecidos do `.env` e alguns padrões de tokens; não garante ausência de todo segredo e não descompacta binários. Não execute scripts de teste manual contra credenciais reais.

O teste que consulta a fonte real de horários fica desativado por padrão; `INFOBOARD_RUN_LIVE_TESTS=true` é um opt-in de rede explícito. Para verificar o navegador com dados isolados, use `npm run test:browser` (requer Chrome; por padrão procura a instalação Windows). Ele verifica três resoluções e grava evidências em `artifacts/browser-smoke/`, pasta ignorada pelo Git. `INFOBOARD_SMOKE_OUTPUT_DIR` permite guardar essas evidências fora do projeto.

Para produzir uma cópia das fontes sem histórico, dados locais ou dependências instaladas, informe um destino novo fora do projeto:

```powershell
npm run release:local -- C:\Entregas\InfoBoard-fontes
```

O comando gera pasta de fontes, ZIP, manifesto e SHA-256. Não faz commit ou push. Revise a distribuição e execute `npm ci --ignore-scripts`, `npm test` e `npm run check` na cópia extraída.

## Segurança

A API é de leitura e restringe acesso por IP de origem e Host/Origin. Redes privadas são autorizadas conforme a política atual; pertencer à LAN não equivale a autenticação individual. Não exponha o serviço diretamente à internet.

O conector PBX valida certificados por padrão. Para CA interna, configure `NODE_EXTRA_CA_CERTS`. Existe uma opção explícita de compatibilidade TLS para legado; suas consequências estão descritas em [Segurança](docs/SEGURANCA.md).

**Versões antigas podem conter segredos já expostos.** A reescrita do histórico não substitui a revogação das credenciais nem elimina cópias antigas e caches. O pacote de fontes exclui histórico e relatórios detalhados da auditoria local. Consulte a política em [Segurança](docs/SEGURANCA.md); o relatório completo de diagnóstico é entregue separadamente ao responsável pelo projeto.
