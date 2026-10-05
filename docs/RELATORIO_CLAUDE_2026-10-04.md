# Relatório da sessão Claude — 4 de outubro de 2026

Escopo: repositório `crm26gold/faculdadepsicologia`, Supabase `uccoaebzmvocqwqljmul`, Vercel `faculdadepsicologia` (equipe `faculpsi`). Este documento é um registro histórico: confira o código antes de confiar nele.

## 1. Resumo

| Item | Situação |
| --- | --- |
| Skills de agentes (27 de mattpocock/skills + `animacao-web`) | No [PR #37](https://github.com/crm26gold/faculdadepsicologia/pull/37), CI verde, aguardando merge |
| Endurecimento do banco (RLS + 15 índices) | **Aplicado em produção** e no PR #37 |
| 5 migrações renomeadas para a versão remota | No PR #37 |
| Documentação fiel ao sistema + contexto do produto no `AGENTS.md` | No PR #37 |
| Texto do WhatsApp no painel de IA | No PR #37 |
| Mensagem de erro do Gemini quando a chave é bloqueada | No [PR #38](https://github.com/crm26gold/faculdadepsicologia/pull/38), CI verde, aguardando merge |
| Testes de contraste instáveis no CI | Corrigidos no PR #37 |
| Apagar 37 branches antigos | **Bloqueado** pelo sistema de permissões; nada foi apagado |
| Alinhar o nome da migração nova à versão remota | **Bloqueado** (leitura do histórico negada) |
| Assistente de voz | Fora do ar até o proprietário trocar a chave do Gemini |

O coração do produto, confirmado pelo proprietário nesta sessão: **ajudar cada pessoa a gerenciar e melhorar a vida inteira**. Estudos são um bloco entre vários. Público adulto (18+).

## 2. O que foi feito e por quê

### 2.1 Skills de agentes — PR #37 (`ea90e88`, `cc1da18`, `ad4fdf3`)

- **O quê:** as 27 skills do manifesto oficial de [mattpocock/skills](https://github.com/mattpocock/skills) (v1.3.1, commit `24fe0ef`) foram copiadas para `.claude/skills/` como arquivos editáveis, com a licença MIT em `.claude/skills/LICENSE-mattpocock-skills`. Ficaram de fora as pastas `in-progress/` (experimentais) e `misc/` (específicas de outros projetos).
- **Skill própria `animacao-web`:** escrita a partir de um guia trazido pelo proprietário (Framer/Webflow/Spline → Framer Motion/GSAP/React Three Fiber) e adaptada aos padrões do projeto. Entre as adaptações: movimento reduzido sempre respeitado; 3D só em desktop capaz e carregado sob demanda; `frameloop="demand"`; `OrbitControls` só quando o usuário precisa girar o objeto; GSAP sincronizado com o Lenis; rodar `scripts/dark-theme.mjs` ao mudar cores.
- **Por quê:** pedido do proprietário. As skills dão processo repetível: entrevista antes de construir, TDD, diagnóstico de bugs, design de módulos, especificações e tarefas.
- **`scripts/check-publication.mjs`:** a pasta `.claude/skills/` foi incluída na lista de publicação, com aprovação explícita do proprietário. O CI barrava os arquivos novos, e a Vercel já ignora `/.claude` pelo `.vercelignore`. Na atualização com a `main`, o conflito com a liberação da ponte do WhatsApp foi resolvido mantendo as duas regras.

### 2.2 Diagnóstico do assistente de voz — PR #38 (`0222437`)

- **Sintoma:** "O Gemini recusou a autorização desta chave… Gemini 403".
- **Evidência:** logs de produção da Vercel das chamadas `6c0d4ff7`, `5ed50f99` e `e55cc5bd`. Todas falham com `403 PERMISSION_DENIED` já na etapa `models` (listagem de modelos), antes da Live API, sem `reason`.
- **Conclusão:** não é limite do plano gratuito, porque listar modelos funciona em qualquer chave, e ontem essa mesma chave listava. A causa mais provável é o Google ter revogado a chave, por exemplo por considerá-la vazada. Só o proprietário resolve: gerar uma chave nova no Google AI Studio e substituí-la em Administração › Inteligência artificial.
- **Mudança:** em `src/lib/voice/provider-error.ts`, um 401/403 sem motivo agora orienta a gerar uma chave nova, e `SERVICE_DISABLED` ganhou mensagem própria. Teste em `tests/voice-provider.test.ts`, escrito para falhar antes da mudança.

### 2.3 Análise completa do sistema (GitHub, Supabase, Vercel)

Resultados que orientaram as correções abaixo:

- A documentação "viva" descrevia como roadmap coisas que já existem (vários cursos, finanças, rotina, metas, IA, Telegram, WhatsApp) e ainda falava em acesso só do proprietário. Agentes que leem esses arquivos ficavam com a foto errada.
- O advisor de segurança do Supabase marcava 3 tabelas do schema `private` sem RLS como **crítico**, entre elas duas cópias do espaço pessoal do proprietário. Verificado: `anon` e `authenticated` não tinham permissão de leitura, então não havia exposição real.
- O advisor de desempenho apontava 15 chaves estrangeiras sem índice.
- 5 arquivos de migração tinham versão diferente da registrada no Supabase, e a migração `20261002220000_messenger_bot` nunca foi registrada no histórico remoto, embora suas tabelas existam.
- Produção estável: nenhum erro de execução na Vercel em 7 dias.
- Riscos de processo: há 3 agentes trabalhando (Claude, Codex, Antigravity), mais de 40 branches e a `main` sem proteção. Houve publicações em produção feitas direto de branches `codex/*`.

### 2.4 Endurecimento do banco — PR #37 (`e616be8`) e produção

- **Migração** `supabase/migrations/20261004190902_advisor_hardening.sql` (criada como `20261004190000`, renomeada em 05/10):
  - RLS em `private.trusted_transactions`, `private.personal_workspaces_backup_20260930` e `private.personal_workspaces_backup_20261001` (esta última de forma condicional, porque foi criada fora das migrações);
  - 15 índices de chaves estrangeiras.
- **Por que é seguro:** as funções que usam essas tabelas (`private.trusted_change` e `private.delete_my_account`) são `SECURITY DEFINER` e pertencem ao dono das tabelas (`postgres`), que o RLS não afeta (não há `FORCE ROW LEVEL SECURITY`).
- **Validação antes de aplicar:** os testes de banco do CI rodaram num Postgres 16 local descartável:
  - `supabase/tests/multiusuario_isolamento.sql`: OK;
  - `supabase/tests/multiusuario_api.sql`: OK;
  - `tests/sql/budget-concurrency.mjs` com `CI=true`: PASS.
- **Publicado:** aplicada no Supabase de produção em 04/10/2026, por volta de 19h09 UTC. O alerta crítico de RLS sumiu do advisor de segurança; as três tabelas ficaram como as demais do schema `private` (RLS ligado, sem políticas).
- **Teste novo:** `supabase/tests/multiusuario_isolamento.sql` confere o RLS nessas tabelas e um dos índices. O stub `supabase/tests/lib/supabase_stub.sql` passou a carregar a migração.
- **Desfazer:** ver o Apêndice B. Isso reabriria o alerta crítico, então não é recomendado.

### 2.5 Migrações alinhadas ao histórico remoto — PR #37 (`e616be8`)

| Antes | Depois (versão registrada no Supabase) |
| --- | --- |
| `20260927035239_private_note_attachments.sql` | `20260927040622_private_note_attachments.sql` |
| `20260927112036_workspace_editor_generation.sql` | `20260927112342_workspace_editor_generation.sql` |
| `20260928011355_workspace_generation_three.sql` | `20260928114544_workspace_generation_three.sql` |
| `20261003010000_conflict_without_retry.sql` | `20261003205055_conflict_without_retry.sql` |
| `20261003215642_jornada_global_budgets.sql` | `20261003224138_jornada_global_budgets.sql` |

Equivalência verificada: o hash MD5 do SQL sem comentários e sem espaços é igual ao `statements` registrado no Supabase para todas as migrações do repositório. Também foram atualizadas as referências no stub de testes, em `docs/INCIDENTE_LOGS_2026-10-03.md` e em `docs/SEGURANCA_CACHE_CLOUDFLARE.md`.

### 2.6 Documentação e contexto para agentes — PR #37 (`d6f9456`)

- **`README.md`:**
  - frase de abertura com o coração do produto;
  - matriz de estado corrigida (Meu dia, vários cursos, metas, finanças, rotina, flashcards, Telegram, WhatsApp, administração de IA);
  - as 7 áreas sem módulo próprio aparecem como etiquetas.
- **`docs/ARCHITECTURE.md`:**
  - as três camadas (vida pessoal, coletiva, IA) e as novas pastas na tabela de camadas;
  - modelo de dados atual;
  - limite do documento JSON único;
  - modelo de acesso multiusuário em vigor desde 30/09;
  - Telegram e WhatsApp.
- **`docs/ROADMAP.md`:** seção "Estado em 04/10/2026", com o que foi entregue e o que está em aberto, sem prioridade definida (decisão do proprietário).
- **`AGENTS.md`:** seção "Jornada Plena: contexto do produto", fora do bloco que o `next dev` regenera. Traz coração, camadas, privacidade, fontes da verdade, dados, convenção de migrações e fluxo de entrega.
- **Não alterado de propósito:** a frase desatualizada do `docs/VISAO_E_FUNDACAO_2026-09-30.md` ("Nada aqui foi aplicado em produção ainda"). O [PR #8](https://github.com/crm26gold/faculdadepsicologia/pull/8) já a corrige, e o proprietário preferiu manter esse PR aberto.

### 2.7 Painel de IA — PR #37 (`c30c7a2`)

Em `src/components/community/ai-settings.tsx`, "WhatsApp · API da Meta pendente" virou "WhatsApp · ponte por QR disponível". O texto antigo dizia que o recebimento estava fechado, mas a ponte por QR já funciona em Administração › WhatsApp da Jornada.

### 2.8 Testes de contraste instáveis — PR #37

- **Sintoma:** nos commits `c30c7a2` e `cde4312`, um dos dois jobs do CI falhou e o outro passou com o mesmo código. As falhas estavam em `tests/browser/community.spec.ts:391` e `:450` e em `tests/browser/workspace.spec.ts:29`.
- **Causa:** o axe media o contraste no meio de uma animação de CSS:
  - `.button` anima `background-color` por 150 ms na troca de tema, então o texto fica claro antes do fundo escurecer (contraste 1,05);
  - a gaveta mobile entra com `workspace-drawer-enter`, que começa com opacidade 0,7.
- **Correção:** o auxiliar `tests/browser/axe-ready.ts` (`settleAnimations`) espera as transições e animações finitas terminarem. Ele é chamado antes dessas três auditorias.
- **Prova:** com as animações alongadas para 3 s, os testes falham sem o auxiliar (o mesmo `color-contrast` do CI) e passam com ele.

## 3. Validação executada

| Verificação | Resultado | Onde |
| --- | --- | --- |
| `npm run typecheck` | OK | Local e CI |
| `npm test` | 182/182 | Local e CI |
| `node scripts/check-publication.mjs` | Sem alertas (384 arquivos) | Local e CI |
| `git diff --cached --check` | OK | Local |
| Testes de banco do CI (isolamento, API, concorrência) | OK | Postgres 16 local descartável e CI |
| `npm run build` | OK | Local e CI |
| Playwright `community`, `mobile` e `desktop` | 37 aprovados, 3 omitidos pelo dispositivo; os três testes corrigidos, 12/12 em repetição | Local (Chromium pré-instalado) e CI |
| `test:gate` e demais projetos do Playwright | Verdes | Apenas CI |
| Advisor de segurança do Supabase após a migração | Alerta crítico removido | Produção |
| Advisor de desempenho após os índices | **Não confirmado** (leitura bloqueada) | — |

## 4. O que ainda falta e por quê

### 4.1 Bloqueado pelo sistema de permissões desta sessão

1. **Apagar os 37 branches antigos** (lista com SHAs no Apêndice A).
   - Todo o conteúdo deles já está na `main`: 34 foram mesclados direto e 3 por squash, nos PRs #32, #33 e #34.
   - O proprietário autorizou, mas a ação foi classificada como destrutiva e bloqueada.
   - Pode ser feito pela página *Branches* do GitHub, ou com `git push origin --delete <nomes>` numa máquina com permissão.
2. **Concluído em 05/10:** `20261004190000_advisor_hardening.sql` virou `20261004190902_advisor_hardening.sql`, a versão registrada no Supabase, com o stub atualizado. Registro original:
   - A leitura de `list_migrations` foi bloqueada.
   - A versão aparece no painel do Supabase, em Database › Migrations.
   - Ao renomear, atualizar também `supabase/tests/lib/supabase_stub.sql`.
3. **Registrar `20261002220000_messenger_bot` no histórico remoto.**
   - As tabelas e funções existem em produção, mas a versão nunca foi registrada.
   - É uma escrita em produção (`supabase_migrations.schema_migrations`); só fazer com ok explícito do proprietário.
   - Até lá, **não use `supabase db push`**: ele tentaria reaplicar essa migração, e o primeiro `create table` falharia. A `advisor_hardening` é idempotente.
4. **Confirmar o advisor de desempenho** depois dos índices.

### 4.2 Decisões do proprietário

- Mesclar os PRs #37, #38 e #8.
- Trocar a chave do Gemini, sem colá-la em conversas, prints ou arquivos.
- **Menores de idade.** A política em `src/app/privacidade/page.tsx` (item 9) permite menores com autorização dos responsáveis, mas o proprietário decidiu que o app **não aceita menores**.
  - Mudar o texto pede uma nova versão de `TERMS_VERSION` em `src/lib/community.ts` e o novo aceite de todas as contas.
  - O README e o `AGENTS.md` já dizem 18+.
- **Cópias antigas do espaço pessoal** (`private.personal_workspaces_backup_20260930` e `_20261001`): o proprietário preferiu **não apagar**. Ficam trancadas com RLS.
- **Proteger a `main` no GitHub**, exigindo PR e CI verde, e publicar em produção só a partir da `main`.
- **Supabase Auth:** confirmar que só o Google está ligado em Authentication › Providers. O app não usa e-mail e senha, e isso também esvazia o aviso de "senha vazada" do advisor.

### 4.3 Dívida técnica e próximos passos (a prioridade é do proprietário)

- **Documento JSON único da vida pessoal** (`personal_workspaces`, até 2 MB, regravado inteiro). Ele impede compartilhar partes, obriga a IA a carregar tudo e gera conflitos entre aparelhos. Módulos que precisem crescer ou ser compartilhados (Networking, finanças) devem ir para tabelas próprias. É a maior decisão técnica antes do Networking.
- **Pessoal × coletivo:** os prazos das partes de trabalhos em grupo aparecem no Meu dia, mas não na Agenda nem nos alertas.
- **Áreas sem módulo:** saúde, emocional, espiritualidade, família, casa, lazer e documentos existem só como etiquetas.
- **Cobertura dos testes de banco:** o stub não carrega as migrações `assistant_continuity`, `assistant_attachment_auth` e `assistant_export`, e `tests/sql/assistant-continuity.sql` não é executado pelo CI.
- **Integrações pendentes:** Google Agenda e Drive (OAuth próprio); pagamento (Asaas) e Vercel Pro na abertura das vendas.
- **Aceite real** do WhatsApp com telefone e da chamada de voz com chave válida.

## 5. Contexto do Networking (conversado, ainda não decidido formalmente)

O proprietário descreveu uma aba nova, **Networking**, dentro do propósito de vida inteira. Nada disso está implementado.

- **Perfil único**, acessível pelo Networking e pelo canto da conta.
- **A pessoa controla:**
  - aceitar pedidos de amizade, ou não;
  - aceitar mensagens, ou não;
  - perfil público ou privado;
  - interagir só com o nome, sem foto nem dados completos.
- **Em grupo de trabalho**, que exige convite, os membros veem nome, foto, sala e a participação nas partes. Sugestão em aberto: aceitar iniciais quando não houver foto.
- **Finalidade:** falar de trabalhos, vida, ideias e motivação sobre os cursos; conectar quem estuda o mesmo (vários cursos, mentorias, palestras); formar grupos de estudo e de trabalho. Não é uma rede social genérica.
- **IA no trabalho em grupo:** organiza as partes, revisa, formata e avisa, por exemplo "seu colega já entregou, falta a sua". Lembretes também pelo Google Agenda.
- **Controle sem vigilância:** a IA não lê todas as mensagens; há moderação por denúncia e bloqueio, registro de acessos administrativos e finalidade explícita nos termos.
- **Perguntas em aberto:**
  - amizade com aceite dos dois lados ou "seguir" de um lado só;
  - se o perfil público fica visível fora do app;
  - se um trabalho de grupo pode ir para o perfil e com autorização de quem.

## 6. Observações para o Codex voltar a trabalhar

1. **Comece por:** `AGENTS.md` (seção de contexto do produto), `docs/PROMPT_COLABORACAO_IA.md` (contrato de entrega) e este relatório. Depois veja o estado dos PRs #37, #38 e #8 e trabalhe a partir da `main` atualizada.
2. **Fontes da verdade:**
   - decisões: `docs/VISAO_E_FUNDACAO_2026-09-30.md`;
   - o que existe: matriz do `README.md`;
   - camadas e dados: `docs/ARCHITECTURE.md`.

   Documentos com data no nome são históricos.
3. **Migrações:**
   - depois de aplicar pelo MCP, renomeie o arquivo para a versão atribuída e atualize `supabase/tests/lib/supabase_stub.sql`;
   - antes de aplicar, rode os testes do passo "Testar permissões e isolamento do banco" de `.github/workflows/ci.yml` num Postgres local descartável;
   - `tests/sql/budget-concurrency.mjs` exige `CI=true` e o banco `t_multiusuario_api` já criado.
4. **Publicação:** rode `node scripts/check-publication.mjs` com o índice já preparado. Arquivos fora das pastas liberadas fazem o CI falhar de propósito.
5. **`AGENTS.md`:** o `next dev` reescreve só o trecho entre `<!-- BEGIN:nextjs-agent-rules -->` e `<!-- END:nextjs-agent-rules -->`; o resto do arquivo é preservado.
6. **Produção:** a `main` publica na Vercel automaticamente. Publique em produção só a partir da `main`; houve deploys de produção saídos de branches `codex/*`.
7. **Não faça sem o proprietário:**
   - apagar as cópias `private.personal_workspaces_backup_*`;
   - mudar a política de privacidade ou os termos;
   - mexer em chaves de provedores;
   - escrever no histórico de migrações remoto.
8. **Auditorias axe:** depois de trocar o tema, abrir uma gaveta ou abrir um diálogo animado, chame `settleAnimations(page)` (`tests/browser/axe-ready.ts`) antes do `AxeBuilder`; ver a seção 2.8. Localmente, o Playwright do projeto pode exigir uma versão do Chromium diferente da instalada; use `launchOptions.executablePath` numa configuração temporária, fora do Git.
9. **Skills:** estão em `.claude/skills/`, formato do Claude Code. O Codex pode seguir qualquer `SKILL.md` como instrução, ou instalá-las no próprio ambiente com `npx skills@latest add mattpocock/skills`, escolhendo o Codex como agente. A pasta `.agents/` está no `.gitignore` e não vai para o repositório.

### Skills sugeridas para a próxima sessão

- `grill-with-docs` e `domain-modeling`: fechar as decisões do Networking e registrar glossário e ADRs.
- `codebase-design` e `improve-codebase-architecture`: planejar a saída do documento JSON único para tabelas.
- `to-spec`, `to-tickets` e `implement`: transformar as decisões em entregas.
- `tdd` e `diagnosing-bugs`: implementar e corrigir com testes primeiro.
- `animacao-web`: telas do Networking e da landing.
- `pr` e `writing-for-agents`: descrições de PR e edições do `AGENTS.md`.

## Apêndice A — Branches já incorporados à `main` (autorizados para apagar)

<details>
<summary>37 branches com o SHA de cada um, para recriar se necessário</summary>

```text
881c734 antigravity/planning-interface
14d68ee backup-before-v2-redesign
56456fa claude/assistente-computador
5ee4c03 claude/assistente-limpo
3f65da0 claude/assistente-resiliente
293e5f6 claude/auditoria-1
143f8f1 claude/caderno
873a051 claude/comandos
a52d3a4 claude/comandos-teste
36ac713 claude/conexoes-privadas
3318ae5 claude/conflito-sem-repeticao
caf964d claude/conversa
eb409c0 claude/estudos-cursos
18c4b4c claude/financas
fe669fc claude/financas-2
e68f3ac claude/foco-microfone
84727f9 claude/ia-base
77a503e claude/ia-modelos
14e9c39 claude/identidade-visual
a9885ba claude/meu-dia
2156680 claude/registro-rapido
6995e44 claude/telegram
400565f codex/ai-voice-continuation
237b97e codex/assistente-voz-ao-vivo
def7f5b codex/cinematic-hero
c3e660b codex/consumption-guard
3bba799 codex/corrigir-abertura-chamada
9f625b8 codex/diagnostico-voz-gemini
9f04c3e codex/focus-planning-core
5a0dfaf codex/gemini-live-contract
dde995c codex/integration-safety-review
3aae106 codex/live-voice-continuity
0c8d8bd codex/mobile-capture-overflow
9589628 codex/mobile-navigation-layout
971b557 codex/note-save-before-reload
bc23e27 codex/planning-core-and-handoff
95811ac codex/verify-workspace-conflicts
```

Ficam: `main`, `claude/jolly-ritchie-jodq8g` (PR #37), `claude/mensagem-chave-gemini` (PR #38) e `claude/chat-vc-vercel-supabase-dghi9u` (PR #8).

</details>

## Apêndice B — Como desfazer a migração `advisor_hardening`

Não recomendado: reabre o alerta crítico do Supabase. Os índices podem ser removidos sem efeito funcional.

```sql
alter table private.trusted_transactions disable row level security;
alter table private.personal_workspaces_backup_20260930 disable row level security;
alter table private.personal_workspaces_backup_20261001 disable row level security;
drop index if exists public.admin_audit_log_actor_id_idx, public.admin_audit_log_target_user_id_idx,
  public.spaces_created_by_idx, public.space_members_added_by_idx, public.space_invitations_created_by_idx,
  public.assignments_created_by_idx, public.assignment_parts_assignee_id_idx, public.assignment_parts_submitted_by_idx,
  public.assignment_parts_updated_by_idx, public.part_comments_author_id_idx, public.space_posts_author_id_idx,
  public.polls_author_id_idx, public.poll_votes_user_id_idx, public.ai_tasks_connection_id_idx, public.ai_tasks_provider_idx;
```
