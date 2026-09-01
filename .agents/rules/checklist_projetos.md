# Regras de Boas Práticas - 7 Passos para Projetos

Ao atuar nos projetos, sempre considere os seguintes 7 pontos de melhoria contínua, segurança e resiliência:

1. **Rota de debug**: Sempre criar uma rota dedicada (como `/debug` ou `/health`) para checagem de status, mas garantindo rigorosamente que ela não fique acessível em ambiente de produção (proteger com `NODE_ENV !== 'production'`).
2. **Rate limit**: Implementar limitação de taxa em rotas sensíveis (como autenticação ou APIs públicas) para evitar abusos, sobrecargas e ataques de força bruta.
3. **Onboarding**: Planejar e incluir um fluxo de onboarding para facilitar a introdução e o aprendizado de novos usuários na plataforma.
4. **Caçar ENV exposta**: Auditar ativamente o código e logs para garantir que NENHUMA credencial, token ou senha seja fixada no código ("hardcoded") ou impressa em logs. Arquivos sensíveis (`.env`) nunca devem ir para o repositório.
5. **Termos UP**: Garantir que os Termos de Uso e as Políticas de Privacidade (LGPD) estejam sempre atualizados e que os usuários deem aceite (opt-in) nas novas versões.
6. **Downgrade / Graceful Degradation**: Prever cenários de falha para serviços de terceiros e permitir que o sistema degrade amigavelmente sem cair por inteiro, além de permitir o downgrade fluído de planos para usuários.
7. **API's alt (Alternativas)**: Ter provedores e APIs de backup (fallback) para serviços críticos (ex: envios de SMS, e-mails, pagamentos) de modo que o sistema consiga manter a disponibilidade se o principal cair.
