# Próximo lote — foco por tarefa, projeto e área

## Base entregue pelo Codex

Branch: `codex/focus-planning-core`. Trabalhe em branch própria derivada dela.

- `startFocus(workspace, {id, now, taskId?, projectId?, activity?, areaId?, subjectId?, targetSeconds?})` em `src/lib/focus.ts` retorna um novo workspace validado. Gere `id` com `crypto.randomUUID()` e `now` com `Date.now()` no clique.
- Recusa foco concorrente, referência inexistente, projeto arquivado e ID de sessão já utilizado. Capture erros em pt-BR sem descartar formulário.
- Com tarefa, herda seu projeto e matéria. Área: escolha explícita, depois tarefa, depois projeto. String vazia explícita significa sem classificação. Não recategorizar a tarefa.
- `activeFocus.context` guarda IDs e títulos originais. `finishFocus` transporta esse contexto para cada sessão diária. Renomear, mover ou remover a origem não reescreve o histórico.
- `focusTotals(workspace, {from?, to?})` soma sessões encerradas, em segundos, com limites de datas YYYY-MM-DD inclusivos. Retorna `seconds`, `byArea`, `byProject`, `byTask`. Chave vazia significa sem classificação. Não somar dimensões entre si: representam o mesmo tempo.
- Tempo ativo não integra esses totais; exibi-lo separadamente com `focusMilliseconds`. Não arredondar ao salvar; formatar apenas na tela.
- Geração atual 6. Backups de planejamento geração 5 permanecem legíveis; novos contextos exigem 6. Não reduzir geração nem publicar cliente antigo depois que dados 6 forem gravados.

## Implementar no Antigravity

1. Usar o cronômetro global existente, sem criar outro armazenamento ou timer concorrente.
2. Substituir sua criação manual de activeFocus pelo helper startFocus, dentro de update(prev => ...). Manter foco livre e presets existentes.
3. Adicionar início de foco na tarefa e no cartão de projeto. Se houver foco ativo, oferecer voltar ao atual; nunca encerrar ou sobrescrever silenciosamente.
4. Mostrar atividade e contexto no timer compacto; preservar pausar, retomar e encerrar. Foco não conclui tarefa, projeto ou meta automaticamente.
5. Mostrar tempo encerrado por projeto e tarefa nos respectivos cartões; resumo por área em Meu dia com período explícito. Usar os helpers, sem recalcular vínculos pelo estado atual das tarefas.
6. Manter acesso ao histórico sem classificação; não inventar uma área para registros antigos.
7. Preservar visual aprovado, quatro atalhos inferiores, navegação mobile, modo demo e autorização existentes.

## Testes obrigatórios

- Tarefa -> iniciar -> recarregar -> pausar -> retomar -> encerrar: contexto e duração preservados; status da tarefa inalterado.
- Projeto sem tarefa e foco livre; tentativa de segundo foco não apaga o primeiro.
- Mover/renomear a tarefa após encerramento não altera atribuição do tempo anterior.
- Totais no período, registros antigos, zero explícito e tempo ainda ativo separados.
- Mobile 320/360/393 e altura 500: abrir formulário, salvar de verdade, pausar/encerrar, teclado e alvos acessíveis; emulação não é aparelho real.
- Executar unitários, TypeScript, build, Playwright e production-gate. Não enfraquecer testes existentes.

## Limites e entrega

Permitido: componentes do foco, integração mínima em workspace-app e planning-panel, CSS específico e testes de interface. Não alterar os helpers/schema, autenticação, APIs, banco ou variáveis sem apontar necessidade ao Codex.

Sem criar projetos, bancos, previews ou serviços pagos. Não semear dados pessoais na produção. Testes locais com dados fictícios.

Abrir PR para `codex/focus-planning-core`, entregar commit, resultados reais e capturas. Não fazer merge na main nem deploy: Codex revisa e publica o lote completo no projeto existente.

Esta entrega é base técnica, ainda sem novos controles na interface. Não anunciar funcionalidade publicada.
