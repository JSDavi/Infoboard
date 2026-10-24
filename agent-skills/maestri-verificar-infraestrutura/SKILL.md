---
name: maestri-verificar-infraestrutura
description: Analisar infraestrutura, scripts, pipelines e integrações do Maestri, planejar alterações com validação e reversão. Aplicar pelo agente de Infraestrutura e Automação.
---

# Diagnóstico e plano de infraestrutura

1. Identifique o ambiente exato (local, teste, homologação ou produção), recurso, sintoma e configuração esperada.
2. Faça primeiro inspeção de leitura: arquivos de configuração, versões, dependências, estados e logs já disponíveis.
3. Separe causa comprovada de hipótese. Para uma mudança necessária, informe arquivos/serviços afetados, pré-requisitos, janela de impacto e plano de reversão.
4. Execute alteração somente quando a tarefa delegada autorizar esse ambiente e o recurso específico. Produção, credenciais, contas e permissões requerem escopo expresso.
5. Valide o resultado com evidências, comandos realmente executados e critérios de sucesso. Registre riscos residuais e retorno ao coordenador.
6. Preserve arquivos de implementação reservados a outro agente e evite tarefas concorrentes sobre o mesmo recurso.
