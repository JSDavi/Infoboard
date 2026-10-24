# Distribuição de skills — InfoBoard

**Coordenação:** ChatGPT/Codex externo → Codex Maestro no Maestri → terminais Antigravity. Os nomes Davi e India identificam terminais distintos; instalar arquivos sob um papel não atribui o papel a uma sessão aberta.

## Matriz preparada em 23/10/2026

| Terminal | Papel-alvo | Skill interna | Estado local |
| --- | --- | --- | --- |
| Codex | Coordenação e Arquitetura | Capacidades nativas Maestri | Ativo como Maestro; nenhuma skill copiada |
| India | Implementação Técnica | `maestri-implementar-delimitado` | Instalação estática conferida |
| India #2 | Revisão e Qualidade | `maestri-revisar-independente` | Instalação estática conferida |
| India #3 | Pesquisa e Investigação | `maestri-pesquisar-evidencias` | Instalação estática conferida |
| Davi | Documentação Técnica | `maestri-documentar-evidencias` | Instalação estática conferida |
| Davi #2 | Requisitos e Escopo | `maestri-definir-requisitos` | Instalação estática conferida |
| Davi #3 | Infraestrutura e Automação | `maestri-verificar-infraestrutura` | Instalação estática conferida |
| Vigia (Codex) | Segurança e Privacidade | `maestri-auditar-seguranca-privacidade` | Instalação e leitura ao vivo confirmadas |

**Cabeçalhos solicitados para os terminais no Maestri:** `India — maestri-implementar-delimitado`; `India #2 — maestri-revisar-independente`; `India #3 — maestri-pesquisar-evidencias`; `Davi — maestri-documentar-evidencias`; `Davi #2 — maestri-definir-requisitos`; `Davi #3 — maestri-verificar-infraestrutura`. O Codex deve ser identificado como `Codex — Maestro / Coordenação e Arquitetura`. Preservar as identidades e as conexões existentes ao ajustar os títulos da interface. Os nomes acima são o padrão visual desejado, **não** prova de que o título da interface foi alterado.

**Autorização operacional:** ver `MAESTRI-POLITICA-OPERACIONAL.md` (23/10/2026). A autorização expressa do usuário alcança solicitações de nível elevado dentro da operação do projeto, inclusive as do próprio Codex Maestro. Aprovações obrigatórias do aplicativo e do sistema continuam exigindo o fluxo nativo.

**Verificação estática e ao vivo de 23/10/2026:** `node scripts/alinha-perfis-skills-maestri.mjs --check` confirmou os sete perfis (Codex e os seis agentes), com a skill principal destacada em `role.json`, `AGENTS.md` e `CLAUDE.md`. `node scripts/instalar-skills-india.mjs --check` e `node scripts/instalar-skills-davi.mjs --check` confirmaram as seis cópias de `SKILL.md`. Um perfil textual truncado de Davi #3 foi reparado. No Maestri, os sete cabeçalhos foram confirmados, os seis papéis foram reaplicados por `role assign` e o Codex permaneceu como Maestro com o papel Coordenação e Arquitetura. A listagem ao vivo confirmou todos os terminais ativos, preservando nomes, IDs e conexões, e exibiu o `roleName` esperado para cada sessão. Um teste inofensivo, sem ferramentas nem alterações, confirmou que cada agente reconhece seu papel, sua skill principal e uma regra operacional correspondente.

O papel **Segurança e Privacidade** foi atribuído ao terminal Codex **Vigia**, ID `6d48ea71-fa0e-4460-9f0e-d383910fe2ab`, ligado ao Codex Maestro e sem modo Maestro próprio. A skill principal é `maestri-auditar-seguranca-privacidade`, criada no próprio InfoBoard e instalada em `.maestri/roles/1f9092af-9009-47ea-b5f4-4279efbc0192/.agents/skills/`. A validação estrutural oficial passou; a revisão independente exercitou quatro cenários textuais de tratamento de segredos, instruções maliciosas, evidência insuficiente e recusa de sandbox. A fonte e a cópia instalada tiveram SHA-256 idêntico. Em 23/10/2026, o Vigia iniciou com `codex --no-daemon`, exibiu GPT-6 Sol (Web), esforço High, leu integralmente a skill e confirmou papel, compreensão e limites em português brasileiro. A CLI sem essa opção falhava por pacote local incompleto; o modo suportado sem daemon resolveu a inicialização no mesmo terminal. Os sete terminais anteriores foram preservados. O script `alinha-perfis-skills-maestri.mjs --check` agora verifica oito perfis. Nenhuma auditoria do produto foi executada nesta configuração.

## Fonte, comandos e limites

As seis skills são cópias do material interno revisado em `C:\Users\davis\Documents\Codex\Maestri-Teste\agent-skills\<skill>\SKILL.md`. O catálogo Agentic Awesome Skills, em `Maestri-Teste\tools\agentic-awesome-skills\skills_index.json`, reúne 2.737 candidatos; o índice por si só não disponibiliza os arquivos `SKILL.md` externos. Nenhuma skill externa foi instalada.

No diretório do InfoBoard, execute:

```powershell
node scripts/instalar-skills-india.mjs --check
node scripts/instalar-skills-davi.mjs --check
```

Se uma cópia estiver ausente, execute seu instalador sem `--check`. Cópias divergentes causam `CONFLITO`, sem substituição automática. O material-fonte permanece em `agent-skills/`. As skills destinam-se às pastas `.maestri/roles/<role-id>/.agents/skills/<skill>/SKILL.md`.

**Validação em sessões ao vivo concluída em 23/10/2026:** o Codex Maestro reaplicou explicitamente os seis papéis, confirmou os `roleName` na listagem do Maestri e enviou a cada agente uma tarefa inofensiva citando a skill. Todos responderam com o papel, a skill principal e uma regra operacional coerentes. As reatribuições reiniciaram as conversas internas dos seis agentes, preservando os terminais, nomes, IDs e conexões.

O ambiente de homologação do InfoBoard usa `http://localhost:3001/`. A instalação histórica da porta 3000, dados de produção e credenciais ficam fora desse ajuste. Respeitar `AGENTS.md`, `MAESTRI-POLITICA-OPERACIONAL.md` e `MAESTRI-ORQUESTRACAO.md`.
