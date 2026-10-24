# Política operacional de autorizações — Maestri / InfoBoard

## Autorização expressa do usuário — 23/10/2026

O usuário autorizou o **Codex Maestro** a decidir e aprovar as solicitações operacionais dos agentes do InfoBoard, inclusive as classificadas como de nível elevado, bem como suas próprias solicitações necessárias para administrar e configurar os terminais do projeto. O Maestro deve tratar essa autorização como já concedida no fluxo de delegação, evitando pedir novamente a mesma confirmação humana para ações dentro desse escopo.

Cada agente deve informar ao Maestro a operação, o alvo e a finalidade, quando o fluxo exigir autorização. A decisão do Maestro não substitui aprovações nativas obrigatórias, permissões do Windows, sandbox ou outros controles da plataforma. Uma recusa explícita deve ser registrada com sua causa, sem uso de caminhos alternativos para contorná-la. A autorização operacional não autoriza divulgar credenciais, alterar produção ou realizar ações externas irreversíveis sem instrução específica sobre esses recursos.

## Fluxo obrigatório

1. O Codex coordenador define tarefas, responsáveis, arquivos e critérios de aceite. Antigravity recebe trabalho por delegação do Codex.
2. Para uma operação nova que exija privilégio, acesso ou expansão de escopo, o Antigravity envia ao Codex uma solicitação com ação exata, alvo, justificativa e consequência. Aguarda autorização do Codex antes de executar.
3. O Codex atua como gerente: autoriza imediatamente todas as solicitações amparadas pelo escopo aprovado pelo usuário, fornece a resposta ao terminal solicitante e registra qualquer impedimento real.
4. A opção `--dangerously-skip-permissions` dos terminais Antigravity remove perguntas interativas repetitivas da **própria CLI**. A autorização do fluxo de trabalho continua centralizada no Codex e deve ocorrer antes das tarefas especiais.
5. O Codex pode delegar e aprovar sem envolver o usuário novamente quando a permissão já decorre da instrução original. Demandas efetivamente fora do escopo, imposições de aprovação nativa/Windows e recusas técnicas não são automaticamente superadas.

## Limite técnico

O Maestri conecta terminais e permite ao Codex inspecionar/interagir com agentes, mas o encaminhamento automático de *cada popup nativo* de permissão ao Codex não foi comprovado nesta versão. O fluxo implantado usa delegação/solicitação via Maestri e supressão local de prompts recorrentes quando configurada. Nunca afirmar que um popup foi aprovado pelo Codex sem evidência da operação.

## Validação

Conferir que o terminal Codex está iniciado como Maestro, que os sete Antigravity preservam seus nomes, papéis e conexões, que a CLI Antigravity tem seu modo de aprovação configurado e que uma tarefa inofensiva delegada pelo Codex termina sem diálogo de permissão manual.
