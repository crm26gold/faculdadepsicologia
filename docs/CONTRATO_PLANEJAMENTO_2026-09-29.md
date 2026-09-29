# Contrato de implementação — Metas → Projetos → Tarefas

## Entrega do Codex

Base técnica implementada em `src/lib/workspace.ts`, `src/lib/planning.ts` e `src/components/use-workspace.ts`. Não há tela de planejamento nesta entrega. Não afirmar que o módulo já está disponível ao usuário.

### Modelo obrigatório

- `Workspace.goals?: Goal[]` (até 200) e `Workspace.projects?: Project[]` (até 500). Ausência é válida em backups antigos. Não preencher automaticamente o espaço privado.
- Goal: `id`, `title`, `status`; opcionais `description`, `areaId`, `deadline`, `metric`.
- Project: `id`, `title`, `status`; opcionais `description`, `areaId`, `deadline`, `goalId`.
- Task: campo opcional `projectId`. Não adicionar `goalId` à tarefa neste lote.
- `status`: `active | paused | completed | archived`. Conclusão é decisão explícita, não efeito de uma barra chegar a 100%.
- `deadline`: data válida YYYY-MM-DD; campo vazio deve ser convertido para ausência, não string vazia.
- IDs de vínculo vazios devem virar ausência. Gerar IDs com `crypto.randomUUID()` ao criar; conservar ao editar.
- Áreas são as do workspace. Vínculos entre áreas diferentes são permitidos e não devem mover nem recategorizar tarefas silenciosamente.
- Uma tarefa pode ficar sem projeto, um projeto sem meta e uma meta sem projeto.

### Medição

- `projectProgress(workspace, projectId)` retorna `{done,total,percent}`. Sem tarefas, `percent=null`; mostrar “Sem tarefas”, não “0% de sucesso”.
- `goalProgress(goal)` usa a medição manual `{unit,baseline,target,current}`. Permite evolução crescente ou decrescente; percentual limitado a 0–100. Sem métrica retorna null; mostrar “Sem medição”.
- Progresso de tarefas NÃO é resultado da meta. Usar rótulos diferentes: “Tarefas concluídas” e “Medição da meta”. Não inferir peso, saúde, saldo ou desempenho acadêmico.
- `linkTaskToProject` vincula/desvincula sem mutar o original, recusa novos vínculos com projeto arquivado e não apaga tarefas.

### Persistência e compatibilidade

- Usar SOMENTE o `update` de `useWorkspace`, preservando os campos do objeto anterior. Não criar outra chave local, cliente de banco ou endpoint.
- `CURRENT_EDITOR_GENERATION=5`; o hook grava a geração atual. Campos de planejamento exigem geração 5 no schema.
- O banco foi consultado em leitura: o trigger de geração está habilitado e rejeita downgrade com 40001. Não alterar nem desabilitar esse trigger.
- O formato raiz continua `version:1`. Campos novos são opcionais, mas um backup contendo planejamento em geração antiga é recusado.
- Não republicar um cliente geração 4 após dados geração 5 serem gravados. Rollback exige build que preserve o contrato 5.
- Conflitos 409 não podem ser resolvidos com sobrescrita silenciosa; manter a experiência existente de exportar e recarregar.
- Arquivar mantém relações e dados. Não implementar exclusão definitiva neste lote.

## Escopo exato do Antigravity

1. Criar `src/components/planning-panel.tsx`, com listagem separada de metas e projetos, filtros por área e status, estados vazios úteis e formulários de criação/edição.
2. Adicionar a entrada “Metas e projetos” à navegação existente. Preservar os atalhos inferiores; colocar a nova área em “Mais”. Não redesenhar o restante do app.
3. Formulário de meta: título, descrição opcional, área, prazo opcional, status e medição opcional. Não obrigar o usuário a medir todos os sonhos numericamente.
4. Formulário de projeto: título, descrição opcional, área, prazo opcional, status e meta opcional. Não oferecer metas arquivadas para novos vínculos; conservar vínculo existente ao editar.
5. Acrescentar projeto opcional ao formulário de tarefa/compromisso existente. Permitir desvincular. Exibir o nome do projeto sem remover informações de matéria ou área.
6. Ações explícitas pausar, concluir, reabrir e arquivar. Pedir confirmação ao arquivar; informar que nada vinculado será apagado. Permitir restaurar para ativo.
7. Usar os helpers e tipos entregues. Não duplicar cálculos de progresso na interface.
8. Validar entradas sem perder o formulário em caso de erro; mensagens em pt-BR e estados de salvamento reais.

## Arquivos e fronteiras

Permitido: componente novo, integração mínima em `workspace-app.tsx`, CSS específico e testes de interface.

Não modificar sem revisão do Codex: `workspace.ts`, `planning.ts`, `use-workspace.ts`, autenticação, proxy, APIs privadas, políticas, migrações, variáveis e integrações de IA/mensageria. Se o contrato precisar mudar, registrar o motivo antes de alterar.

Não editar outra cópia de trabalho enquanto um agente estiver usando-a. Trabalhar em branch própria derivada da base técnica fornecida; preservar alterações locais de documentação. Não usar reset destrutivo.

## Critérios de aceite

- Criar meta → criar projeto ligado → criar duas tarefas → concluir uma → exibir 50% operacional, sem mudar o resultado/status da meta.
- Métrica crescente e decrescente, ausência de métrica, projeto sem tarefas, títulos longos e áreas pessoais.
- Editar, arquivar, restaurar e desvincular; tarefas e notas preservadas após recarga.
- Mobile 320/360/393/768 e paisagem; abrir/fechar modais, navegar com teclado, testar filtros e listas preenchidas. Capturas legíveis, não só medição de overflow.
- Não repetir a alegação de que todos os botões existentes têm 44px: `.chip-organize-btn` ainda declara mínimo de 38px. Corrigir esse alvo pontualmente em um commit separado de interface e acrescentar medição no teste; não redesenhar a tela inteira.
- Testar com dados sintéticos. Não usar anotações privadas em fixtures ou screenshots públicas.
- Demo sem armazenamento pessoal ou APIs privadas. Manter `Abrir navegação` e os seletores acessíveis existentes.
- Executar unitários, Playwright, gate e build; registrar resultados reais. Não afrouxar testes.

## Entrega para revisão

Abrir PR, NÃO integrar nem publicar em produção antes da revisão do Codex. Entregar URL do PR, commit, arquivos alterados, screenshots desktop/mobile, comandos/resultados e limitações. Não chamar captura em emulação de teste em aparelho real.

## Verificações de segurança e pendências

O código atual usa `getUser` no servidor e valida UUID, e-mail e identidade Google verificada. Consulta de metadados remotos confirmou políticas de leitura do workspace e acesso a anexos restritas ao proprietário, além do trigger de geração. Nenhum conteúdo pessoal foi lido e nenhuma política foi alterada.

Isso não substitui teste com outra conta real, expiração/revogação de sessão e leitura de anexos entre dispositivos. Esses cenários permanecem pendentes e não podem ser marcados como aprovados pelo Antigravity sem execução. O teclado e gestos do Android real também dependem do proprietário.
