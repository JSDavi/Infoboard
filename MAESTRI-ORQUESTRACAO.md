# Orquestração — InfoBoard

1. **ChatGPT/Codex externo → Codex Maestro do Maestri → Antigravity.** O Maestro define, delega, acompanha e valida. Não enviar subtarefas diretamente aos Antigravity sem instrução expressa do usuário.
2. O Codex verifica `maestri list`, seleciona os agentes estritamente necessários e delimita alterações para evitar concorrência de escrita.
3. Para cada solicitação de privilégio, o Antigravity manda mensagem ao Codex (`maestri ask "Codex"`) informando operação, alvo e motivo. O Codex autoriza automaticamente ações cobertas pelas instruções do usuário e informa o resultado ao agente; não volta a pedir consentimento para essas ações.
4. Os sete terminais Antigravity do InfoBoard usam o preset `Antigravity Gerenciado InfoBoard`, com `--dangerously-skip-permissions`, para evitar popups de autorização da CLI. Essa opção não concede acesso além do permitido pelo sistema operacional ou plataforma; a decisão sobre o escopo da tarefa permanece com o Codex.
5. Ao concluir, o Codex integra evidências, testa o comportamento e informa claramente tarefas realizadas, pendências e limitações.

O painel de homologação local está em `http://localhost:3001/`; os arquivos `daemon/infoboardservice.xml` e `daemon/infoboardtv.xml` são registros históricos de outro caminho de instalação.
