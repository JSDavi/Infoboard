# Skills dos terminais India — InfoBoard

## Origem e escopo

- Banco consultado: `C:\Users\davis\Documents\Codex\Maestri-Teste\tools\agentic-awesome-skills\skills_index.json` (2.737 entradas). É um **índice**, não uma instalação: o checkout esparso consultado não continha `SKILL.md` das candidatas. Nenhuma skill externa AAS foi ativada.
- Origem das três skills internas: `C:\Users\davis\Documents\Codex\Maestri-Teste\agent-skills\`. Os arquivos `SKILL.md` foram copiados para `agent-skills/` deste InfoBoard, sem scripts executáveis ou dependências adicionais.
- Coordenação obrigatória: `ChatGPT/Codex externo → Codex Maestro no Maestri → terminais India`. Os terminais recebem delegações e devolvem resultados ao Maestro.

## Matriz de distribuição preparada

| Terminal | Papel-alvo existente | Skill | Atividade principal |
| --- | --- | --- | --- |
| India | Implementação Técnica | `maestri-implementar-delimitado` | Alterações restritas a arquivos delegados; validação específica e evidências. |
| India #2 | Revisão e Qualidade | `maestri-revisar-independente` | Revisar diffs e testar cenários com independência; não editar o código revisado sem delegação. |
| India #3 | Pesquisa e Investigação | `maestri-pesquisar-evidencias` | Investigar causas e documentação técnica, distinguindo confirmação, hipótese e pendência. |

**Atenção:** a instalação em diretórios de papel não atribui automaticamente esses papéis aos terminais já abertos. O Maestro precisa conferir o vínculo real dos três India, fazer a atribuição por meio do Maestri quando disponível e testar o carregamento de cada skill. Não declarar essa atribuição apenas porque os arquivos existem.

## Instalação e verificação local

No diretório do InfoBoard:

```powershell
node scripts/instalar-skills-india.mjs
node scripts/instalar-skills-india.mjs --check
```

O instalador só cria arquivos sob `.maestri/roles/<papel>/.agents/skills/` quando ausentes; uma cópia divergente gera `CONFLITO`, sem sobrescrita. A opção `--check` não altera nada. Para desfazer, remova somente as cópias destas três skills nos três diretórios de papel e preserve os arquivos-fonte em `agent-skills/`.

## Critérios operacionais para validar nos terminais

1. O Maestro confirma no Maestri nome, perfil vinculado, modelo e conectividade dos três India. Não renomear os terminais Davi nem recrutar outros.
2. Cada India recebe, **pelo Maestro**, um pedido inofensivo que nomeie sua skill e peça para ler as instruções, citar uma regra concreta e aplicá-la a um cenário de leitura do InfoBoard.
3. Verificar separadamente resposta, localização do `SKILL.md`, ausência de mudanças no produto e eventuais prompts de permissão.
4. Somente depois da observação registrar o resultado como `VALIDADO`. Prompts nativos de aprovação devem ser tratados pelo fluxo da plataforma e não contornados.

**Limites do projeto:** homologação local em `http://localhost:3001/`, produção na porta `3000` fora do escopo, credenciais preservadas e alterações de código somente quando a tarefa específica for delegada. O catálogo AAS deve ser filtrado por necessidade; inspecionar origem, risco, dependências e arquivo real antes de habilitar qualquer skill externa.
