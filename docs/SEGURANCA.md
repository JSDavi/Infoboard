# Segurança do InfoBoard

## Tratamento de exposições em versões anteriores

A auditoria local identificou credenciais e identificadores de contas no histórico. O relatório detalhado foi entregue separadamente ao responsável pelo projeto e não integra a distribuição de fontes. Nenhum valor de credencial deve constar da documentação pública.

O arquivo `.env` não precisa ter sido versionado para ocorrer vazamento: uma chave copiada para um teste já permanece no histórico. O `.gitignore` não remove conteúdo de commits nem impede inclusão forçada com `git add -f`.

Antes de publicar ou compartilhar o histórico existente:

1. Revogar e substituir as credenciais PBX no provedor; revisar acessos e detentores de clones. As contas externas não foram alteradas nesta entrega.
2. Planejar saneamento do histórico e coordenação dos clones, ou usar uma entrega de fontes sem histórico. Reescrita e force push não foram executados.
3. Repetir a revisão de segredos e obter autorização explícita para push. Uma cópia limpa não revoga credenciais expostas em cópias antigas.

## Controles locais

- `.env`, mapas reais, logs, backups, agentes e wrappers de serviço não integram o pacote de fontes. Os exemplos têm campos de credenciais vazios e um analista fictício.
- O `.env` local e o snapshot de recuperação receberam ACL restrita ao usuário atual e SYSTEM no Windows. Se o serviço usar outra conta, conceda apenas o acesso necessário antes de iniciar.
- Cookies, tokens, senhas, mensagens brutas de erro e identificação de contas não devem aparecer em logs nem nos erros da API. Use categorias saneadas.
- Requisições autenticadas têm limite de tempo e não seguem redirecionamentos automáticos. O redirecionamento de login NPX deve permanecer na origem aprovada.
- A verificação TLS do PBX é habilitada por padrão. Prefira certificado válido ou CA privada via `NODE_EXTRA_CA_CERTS`. `PBX_TLS_REJECT_UNAUTHORIZED=false` desabilita essa verificação e deixa a conexão vulnerável à interceptação; use apenas para compatibilidade temporária sob decisão do administrador.
- Antes de reiniciar uma instalação legada, confira se o certificado corresponde ao nome configurado em `PBX_BASE_URL`. Uma CA adicional não corrige incompatibilidade de hostname. Corrija o certificado ou configure a URL HTTPS oficial do provedor.
- A leitura da API usa o IP da conexão, rejeita cabeçalhos de encaminhamento e verifica Host/Origin. Configure `INFOBOARD_ALLOWED_HOSTS` para nomes DNS adicionais. A política permite redes privadas; não há autenticação individual nem perfis com dados diferentes entre TV e visualizador.

## Verificação e limites

`npm test` testa regras e HTTP com rede de provedores substituída por mocks. `npm run check` verifica sintaxe. `npm audit` consulta vulnerabilidades conhecidas; o resultado pode mudar quando surgirem novos avisos.

`npm run audit:publication` examina as fontes selecionadas para distribuição. `npm run audit:history` examina blobs alcançáveis nas refs locais. A triagem combina padrões conhecidos e valores do `.env` disponível; sem esse arquivo, a comparação desses valores não ocorre. Não há garantia de ausência universal de segredos, inspeção de arquivos comprimidos ou verificação de todo remoto e clone.

`npm run release:local -- <destino-externo-novo>` copia fontes com hashes, excluindo `.git` e configurações locais. O comando não publica. Revise os arquivos incluídos e valide a instalação na cópia antes da entrega.

## Riscos e decisões preservadas

- O painel exibe dados operacionais e pessoais para a rede autorizada. A necessidade de cada campo e a segregação por usuário precisam de definição de produto antes de alterar a visualização.
- Fontes auxiliares usam HTTP interno, e endereços de integração ainda aparecem no código. A rede precisa proteger esse tráfego; migrar para HTTPS/configuração central exige homologação da infraestrutura.
- Há scripts e estilos inline, recursos de CDN e CSP desativada no estado anterior da aplicação. Uma CSP estrita exige migração e teste de handlers, onboarding e animações; consulte o relatório final para o controle efetivamente entregue.
- Instaladores históricos podem reiniciar serviços, configurar firewall e atualizar código. Não foram executados ou homologados em produção por esta auditoria. Backups produzidos por eles podem conter `.env` e precisam de armazenamento restrito.
- O backup externo desta limpeza contém dados restritos e histórico antigo. Ele é material de recuperação local, nunca um pacote publicável.
