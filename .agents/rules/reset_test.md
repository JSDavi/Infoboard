---
description: Regra para resetar o ambiente de teste para ficar idêntico ao de produção
---

# Regra: Resetar Ambiente de Teste

Sempre que o usuário solicitar para "resetar o teste" (ou "resetar o ambiente de teste"), você DEVE obrigatoriamente tornar o ambiente de teste (`GEMINI_TEST`) idêntico ao ambiente de produção (`GEMINI`).

## Procedimento de Reset:
1. Copiar todos os arquivos da pasta de produção (`c:\Users\Davi.Oliveira\Documents\GEMINI`) para a pasta de teste (`c:\Users\Davi.Oliveira\Documents\GEMINI_TEST`), sobrescrevendo os arquivos antigos.
2. Cuidado com a porta do servidor: No arquivo `GEMINI_TEST\server.js`, a porta deve ser alterada de `3000` (Produção) para `3001` (Teste).
3. Após a cópia e o ajuste da porta, reinicie o daemon do servidor de testes.
4. Notifique o usuário que a "limpeza" foi feita e que o ambiente de testes agora espelha exatamente o que está em produção.
