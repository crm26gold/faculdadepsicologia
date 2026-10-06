---
name: quatro-perguntas
description: Filtro do proprietário antes de criar ou aprovar código, arquivo, função, dependência, tabela, rota, tela ou recurso na Jornada Plena. As perguntas são "Precisa existir? Já tem no sistema? A linguagem resolve? Cabe em uma linha?". Use ao planejar uma mudança, antes de escrever algo novo e ao revisar um diff.
---

# As quatro perguntas

Perguntas do proprietário, avaliadas **de baixo para cima**: eliminar custa menos que reaproveitar, e reaproveitar custa menos que escrever.

1. **Precisa existir?** Nomeie o que exige a peça: um pedido do proprietário, uma regra do `AGENTS.md`, um teste que falha ou um defeito reproduzido. Sem exigência nomeada, a peça não é escrita; a ideia vai para a fila (`docs/` ou o relatório). Termina quando a exigência estiver escrita numa frase.
2. **Já tem no sistema?** Antes de criar, procure com `rg` no código, em `package.json`, nas funções do Supabase (`supabase/migrations`), em `docs/` e em `.claude/skills/`. Estenda o que existe em vez de abrir um caminho paralelo. Exemplo: as chaves pessoais já existem; outra versão delas, não. Termina quando os termos buscados e o achado estiverem anotados.
3. **A linguagem resolve?** Prefira o que a plataforma já oferece a uma biblioteca nova ou código próprio:
   - TypeScript e Web APIs: `Intl`, `URL`, `crypto`, `AbortSignal.any`, `structuredClone`, `fetch`, Web Speech;
   - Postgres: `check`, colunas geradas, RLS, funções e transações;
   - Next e React: o que o guia em `node_modules/next/dist/docs/` documenta;
   - CSS com os tokens do tema.

   Termina quando o recurso nativo estiver nomeado ou houver um motivo concreto para não servir.
4. **Cabe em uma linha?** Escreva a menor forma **legível** no estilo do código vizinho: uma expressão, uma condição, uma linha de configuração. Se não couber, use a menor função. Uma linha clara vale; uma linha espremida e enigmática não. Termina quando nenhuma versão menor passar nos mesmos testes.

## Simplicidade corta código, nunca proteção

Estas peças sempre **precisam existir**, por isso passam direto na pergunta 1:

- validação e autorização no servidor;
- RLS e isolamento entre contas;
- auditoria de ações administrativas;
- confirmação de exclusões e substituições;
- idempotência e recibos;
- privacidade por padrão e cofre de chaves;
- acessibilidade e mensagens claras para o proprietário;
- testes que provam o comportamento.

Uma versão "mais curta" que tire uma delas é defeito, não simplificação.

Toda skill serve para fortalecer o trabalho: mais verificação, menos desperdício. Atalhos que pulem teste, leitura do código ou confirmação ficam fora da aplicação desta skill e de qualquer outra.

## Saída ao revisar

Para cada peça nova do diff, uma linha: **peça → pergunta que decidiu → resultado**. O resultado é um destes: remover, reaproveitar `arquivo:linha`, usar o recurso nativo, reduzir a uma linha ou manter, com a exigência que a justifica. Termina quando toda peça nova tiver uma linha.
