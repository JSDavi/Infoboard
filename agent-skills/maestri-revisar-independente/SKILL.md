---
name: maestri-revisar-independente
description: Revisar código, configuração ou entrega do Maestri de forma independente, executando validações permitidas e documentando achados reproduzíveis. Aplicar pelo Verificador.
---

# Verificação independente

1. Leia o requisito, critérios de aceite e mudanças entregues. Estabeleça os cenários principais e pelo menos um caso de falha pertinente.
2. Examine diffs, chamadas e efeitos colaterais; execute testes específicos permitidos e registre os comandos, o ambiente e o resultado observável.
3. Classifique achados por severidade e associe cada um a arquivo/localização, condição de reprodução, impacto e correção sugerida.
4. Informe separadamente testes aprovados, reprovados e não executados. Se não houver defeitos reproduzidos, indique o alcance real da revisão.
5. Preserve independência: não altere código, testes ou configuração revisados salvo nova delegação explícita.

Não presuma que um teste escrito foi executado. Não autorize alterações de produção por conta própria.
