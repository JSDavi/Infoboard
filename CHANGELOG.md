# Historico de versoes do InfoBoard

## 1.2.1 - 25/10/2026

- Corrige a verificacao do diretorio temporario nos testes do atualizador para ambientes Windows do GitHub Actions, mantendo o comportamento do instalador e do atualizador.

## 1.2.0 — 25/10/2026

- Atualizador do Windows em arquivo BAT unico: confere a revisao publicada no GitHub, prepara Node/dependencias, compara a versao instalada e valida o servico/HTTP apos aplicar.
- Backup privado e tentativa de rollback em caso de falha da atualizacao, preservando `.env` e mapa de analistas.
- Instalacao e desinstalacao revisadas, com validacao de runtime, identificacao de servico e protecoes para configuracoes locais.
- Aperfeicoamentos de seguranca, acesso ao painel, estados NPX/PBX, interface e testes automatizados.
- Publicacao restrita aos arquivos necessarios ao InfoBoard, com verificacao de fontes, versao e dados privados antes da entrega.

## 1.1.1 — versao anterior

- Identificacao de ramal corrigida no mapa de analistas e ajustes de interface e do atualizador.

O numero oficial da versao fica em `package.json` e `package-lock.json`. Cada versao publicada recebe uma tag Git `vX.Y.Z` apontando para o commit correspondente. O atualizador busca a revisao mais recente de `master` e mostra a versao instalada e a versao do pacote antes de aplicar. A tag e o changelog permitem identificar e recuperar entregas anteriores.
