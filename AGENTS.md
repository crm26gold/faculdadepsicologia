<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Jornada Plena: contexto do produto

Vale para qualquer agente (Claude, Codex, Antigravity). Leia antes de propor ou mudar algo.

- **Coração:** ajudar cada pessoa a gerenciar e melhorar a vida inteira. Estudos são um bloco entre vários: o projeto nasceu numa faculdade de psicologia, mas serve a qualquer curso, graduação, mentoria ou fase da vida. Público adulto (18+).
- **Camadas:** vida pessoal (Meu dia, agenda, caderno, estudos, foco, metas, finanças, rotina, flashcards, contatos) → camada coletiva (instituição › sala › grupo, trabalhos em grupo, mural, enquetes; o papel depende do contexto) → IA (assistente por texto e voz, Telegram, WhatsApp) agindo sobre a vida pessoal com confirmação.
- **Privacidade:** privado por padrão; compartilhar é sempre um ato explícito; a vida pessoal nunca aparece para grupos, professores ou administração; o isolamento é garantido por RLS; ações administrativas deixam rastro.
- **Fontes da verdade:** decisões do proprietário em `docs/VISAO_E_FUNDACAO_2026-09-30.md`; o que existe hoje na matriz do `README.md`; camadas e dados em `docs/ARCHITECTURE.md`. Documentos com data no nome são registros históricos: confirme no código antes de confiar neles, e atualize a matriz do README quando um recurso mudar de estado.
- **Dados:** a vida pessoal é um documento JSON por conta (`personal_workspaces`, até 2 MB, gravado inteiro com controle de revisão); o coletivo usa tabelas relacionais. Um módulo que precise crescer ou ser compartilhado vai para tabela própria.
- **Banco:** Supabase `uccoaebzmvocqwqljmul`. Cada arquivo em `supabase/migrations` leva a versão registrada no Supabase: depois de aplicar pelo MCP, renomeie o arquivo para a versão atribuída e atualize `supabase/tests/lib/supabase_stub.sql`. Rode antes os testes de banco do CI num Postgres local descartável.
- **Entrega:** branch → PR → CI verde → merge. A `main` publica em produção na Vercel automaticamente; produção sai da `main`.
