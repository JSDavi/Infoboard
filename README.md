# InfoBoard

**Versao de publicacao: 1.2.3** — veja as alteracoes em [CHANGELOG.md](CHANGELOG.md).

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
| `docs/PAINEL-ANALISTA.md`, `docs/SEGURANCA.md` | Guias públicos de operação e segurança |

Arquivos de coordenação (`.agents/`, `.maestri/`, `agent-skills/`, `AGENTS.md`, `MAESTRI-*.md` e scripts exclusivos dos agentes), pesquisas internas (`docs/re/`), relatórios de auditoria (`docs/auditoria/`), evidências e configurações reais ficam somente no workspace. A publicação inclui backend, frontend, instaladores, exemplos de configuração, testes e ferramentas necessárias para validar a aplicação. Os filtros de distribuição ficam em `scripts/publication-files.cjs`.

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

## Versoes e atualizacao do servidor

Use `X.Y.Z`: `X` para mudancas incompativeis, `Y` para funcionalidades novas e `Z` para correcoes. Em cada entrega, atualize `package.json`, a versao raiz de `package-lock.json`, o identificador do instalador e `CHANGELOG.md`. O comando `npm run release:verify` confere essas versoes, os arquivos incluidos no Git e a auditoria de fontes. A entrega e identificada no GitHub por uma tag anotada `vX.Y.Z` no mesmo commit da branch `master`.

Para atualizar uma instalacao existente, envie o arquivo [ATUALIZAR_INFOBOARD.bat](instalador/ATUALIZAR_INFOBOARD.bat) da entrega validada ao responsavel pelo servidor. Ele deve salvar o BAT na pasta instalada e executa-lo com autorizacao de administrador. O atualizador baixa o estado publicado de `master` fixado por SHA, compara as versoes, prepara as dependencias antes da parada do servico e valida o resultado. `.env` e o mapa reais permanecem no servidor. O servidor precisa alcancar o GitHub e o registro npm; confirme a janela de manutencao e consulte o roteiro [do instalador](instalador/README.md). A validacao em laboratorio nao substitui a homologacao de producao.

## Segurança

A API é de leitura e restringe acesso por IP de origem e Host/Origin. O modo de operação da empresa permite a rede local e a VPN com origem IPv4 privada. `INFOBOARD_ALLOW_PRIVATE_NETWORK=true` mantém esse acesso; instalações antigas sem a variável também preservam esse comportamento, inclusive após atualização pelo GitHub. O serviço deve permanecer protegido pela rede e VPN da empresa.

Para restringir a equipamentos específicos, configure `INFOBOARD_ALLOW_PRIVATE_NETWORK=false` e informe os IPs diretos das TVs em `INFOBOARD_TV_ALLOWED_IPS` e das estações em `INFOBOARD_VIEWER_ALLOWED_IPS`, separados por vírgula. Reserve esses IPs no DHCP. As listas aceitam IPs individuais IPv4 e IPv6, sem CIDR; também permitem VPN com origem fora das faixas privadas. O próprio servidor permanece liberado via loopback. Valores configurados diferentes de `true` desabilitam a liberação geral da LAN. Cabeçalhos de proxy são rejeitados mesmo quando vazios; proxies reversos exigem desenho próprio e não são habilitados automaticamente. TV e visualizador recebem os mesmos dados de leitura, sem sessões individuais. Não exponha o serviço diretamente à internet.

O conector PBX valida certificados por padrão. Para CA interna, configure `NODE_EXTRA_CA_CERTS`. Existe uma opção explícita de compatibilidade TLS para legado; suas consequências estão descritas em [Segurança](docs/SEGURANCA.md).

Nunca inclua configurações reais, backups nem relatórios de auditoria interna no repositório. Em caso de exposição de uma credencial, a limpeza do histórico Git não substitui sua revogação. Consulte as orientações em [Segurança](docs/SEGURANCA.md).
