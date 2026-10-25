# Segurança do InfoBoard

## Segredos e publicacao

O repositório deve conter apenas exemplos sem dados reais. Arquivos `.env`, mapas de analistas reais, backups, logs e relatórios de auditoria internos ficam exclusivamente na instalação ou no ambiente de manutenção autorizado.

O `.gitignore` não remove arquivos já versionados e não impede inclusão forçada com `git add -f`. Antes de publicar, confira também o índice e o histórico Git. Não copie credenciais para testes, documentação ou mensagens de erro.

Quando houver suspeita de exposição de credenciais, revogue e substitua os valores junto ao provedor, avalie os acessos envolvidos e revise as cópias do repositório. A limpeza do histórico não substitui a revogação.

## Controles locais

- `.env`, mapas reais, logs, backups, agentes e wrappers de serviço não integram o pacote de fontes. Os exemplos têm campos de credenciais vazios e um analista fictício.
- Restrinja o acesso ao `.env` e aos backups no Windows à conta executora, SYSTEM e contas de serviço estritamente necessárias.
- Cookies, tokens, senhas, mensagens brutas de erro e identificação de contas não devem aparecer em logs nem nos erros da API. Use categorias saneadas.
- Requisições autenticadas têm limite de tempo e não seguem redirecionamentos automáticos. O redirecionamento de login NPX deve permanecer na origem aprovada.
- A verificação TLS do PBX é habilitada por padrão. Prefira certificado válido ou CA privada via `NODE_EXTRA_CA_CERTS`. `PBX_TLS_REJECT_UNAUTHORIZED=false` desabilita essa verificação e deixa a conexão vulnerável à interceptação; use apenas para compatibilidade temporária sob decisão do administrador.
- Antes de reiniciar uma instalação legada, confira se o certificado corresponde ao nome configurado em `PBX_BASE_URL`. Uma CA adicional não corrige incompatibilidade de hostname. Corrija o certificado ou configure a URL HTTPS oficial do provedor.
- A leitura da API usa o IP da conexão, rejeita cabeçalhos de encaminhamento (inclusive vazios) e verifica Host/Origin. Configure `INFOBOARD_ALLOWED_HOSTS` para nomes DNS adicionais. O acesso da LAN/VPN IPv4 privada é preservado por padrão e com `INFOBOARD_ALLOW_PRIVATE_NETWORK=true`, conforme o funcionamento definido pelo responsável. Para permitir somente loopback e os IPs de `INFOBOARD_TV_ALLOWED_IPS`/`INFOBOARD_VIEWER_ALLOWED_IPS`, configure `INFOBOARD_ALLOW_PRIVATE_NETWORK=false`. As listas aceitam IPs individuais IPv4/IPv6, sem CIDR; reserve os endereços no DHCP. VPN com origem fora das faixas privadas precisa de IP explícito. Não há autenticação individual nem perfis com dados diferentes entre TV e visualizador. A proteção da rede/VPN é parte dessa política; não publicar a API na internet.

## Verificação e limites

`npm test` testa regras e HTTP com rede de provedores substituída por mocks. `npm run check` verifica sintaxe. `npm audit` consulta vulnerabilidades conhecidas; o resultado pode mudar quando surgirem novos avisos.

`npm run audit:publication` examina as fontes selecionadas para distribuição. `npm run audit:history` examina blobs alcançáveis nas refs locais. A triagem combina padrões conhecidos e valores do `.env` disponível; sem esse arquivo, a comparação desses valores não ocorre. Não há garantia de ausência universal de segredos, inspeção de arquivos comprimidos ou verificação de todo remoto e clone.

`npm run release:local -- <destino-externo-novo>` copia fontes com hashes, excluindo `.git` e configurações locais. O comando não publica. Revise os arquivos incluídos e valide a instalação na cópia antes da entrega.

## Limites operacionais

- O painel apresenta dados operacionais para a rede autorizada; mantenha a proteção da LAN/VPN e revise a necessidade de cada campo exibido.
- Proteja o tráfego entre serviços, confira certificados e endereços de integração antes de colocar o painel em produção.
- Scripts de instalação e atualização podem alterar serviços e configuração do Windows; valide-os em homologação antes de usar em produção.
- Mantenha cópias de recuperação privadas, fora da distribuição. Uma atualização de branch não elimina automaticamente dados de caches, forks e clones externos.
