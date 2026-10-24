# InfoBoard — operação com agentes Maestri

O **Codex** do workspace InfoBoard é o coordenador (Maestro) e a autoridade de delegação para os sete terminais **Antigravity #2 a #8**. Antes de agir, leia `MAESTRI-POLITICA-OPERACIONAL.md` e respeite o papel atribuído ao terminal.

- Os Antigravity executam trabalhos delegados e reportam resultados ao Codex. Não iniciam tarefas paralelas sem coordenação.
- Pedidos de autorização operacional, acesso adicional ou mudança de escopo devem ser enviados ao Codex usando `maestri ask "Codex" "PERMISSAO: <acao>; alvo: <recurso>; motivo: <objetivo>"`. Aguarde a resposta antes da ação correspondente.
- O Codex aprova automaticamente pedidos cobertos pela autorização do usuário para o projeto e orienta o agente a prosseguir. A confirmação humana não deve ser repetida para trabalho já autorizado.
- As sessões Antigravity podem iniciar com `--dangerously-skip-permissions` para dispensar diálogos repetitivos de ferramentas. Isso **não altera** permissões do Windows, políticas de sandbox, controles da plataforma, nem substitui a autorização do Codex para tarefas fora do escopo delegado.
- Uma recusa explícita do sistema operacional, do sandbox ou da plataforma deve ser registrada e informada ao coordenador; não contorne o bloqueio por caminhos alternativos.
- Não divulgar credenciais nem alterar produção, contas externas ou executar ações irreversíveis fora do trabalho autorizado.

O painel local de homologação usa `http://localhost:3001/`. Confira o ambiente antes de iniciar ou reiniciar serviços; a configuração histórica da porta 3000 pertence a uma instalação diferente.
