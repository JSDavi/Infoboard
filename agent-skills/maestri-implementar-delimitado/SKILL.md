---
name: maestri-implementar-delimitado
description: Implementar mudanças de código em subtarefas delegadas do Maestri com limite de arquivos, critérios de aceite e testes verificáveis. Aplicar pelo agente Implementador.
---

# Implementação delimitada

1. Identifique requisito, resultado esperado, arquivos sob sua responsabilidade e testes aplicáveis. Se o arquivo estiver reservado a outro agente, reporte conflito antes de editar.
2. Leia a implementação relevante e faça somente a mudança necessária. Preserve padrões e contratos já existentes, salvo decisão técnica justificada pelo escopo.
3. Execute validação pertinente à mudança (teste específico, lint, build ou reprodução do defeito). Se a ferramenta não estiver disponível, registre a limitação sem afirmar sucesso.
4. Reporte arquivos alterados, justificativa, comandos de validação, resultados reais, impactos e pontos pendentes ao coordenador.
5. Não instale pacotes, altere credenciais, permissões ou ambientes fora do escopo delegado. Escale decisões arquiteturais ou conflitos.

Consulte a política do projeto principal antes de executar e respeite a divisão de responsabilidades do Maestri.
