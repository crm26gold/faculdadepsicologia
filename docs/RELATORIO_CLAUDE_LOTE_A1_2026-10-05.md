# Relatório do Claude — lote A1 (mapa de recursos), 05/10/2026

Para revisão do Codex. É registro histórico: confira no código antes de confiar.

## Base e ambiente conferidos

- Repositório `crm26gold/faculdadepsicologia`. Base `main` em `c8dc3fb` (merge do #49); branch `claude/mapa-de-recursos`.
- Produção Vercel `dpl_6v16S69VHgEsqkrAzMmREvAP5iYR`, READY no mesmo SHA. Supabase `uccoaebzmvocqwqljmul`, saudável, com 30 migrações registradas, como na passagem. A migração local `20261002220000_messenger_bot` continua sem registro remoto.
- Leituras remotas: só metadados, contagens e definições de funções. Nenhuma chave, transcrição, nota ou dado pessoal foi lido. Nada foi alterado no Supabase, na Vercel ou na configuração das rotas.

## Decisões do proprietário nesta sessão

1. Cada chave, voz ou MCP é uma peça do roteador. Nenhuma empresa é exclusiva de uma tarefa. O ElevenLabs continua como opção de voz, mas é caro e não deve ser a única.
2. A declaração de privacidade e o público ficam separados por fonte. O padrão é "só eu"; oferecer aos membros é um ato explícito. Recomendação do Claude, aceita pela frase do proprietário "principalmente eu consiga utilizar".

## Divergências encontradas (documento × código × configuração)

| # | Divergência | Evidência | Tratamento neste lote |
| --- | --- | --- | --- |
| 1 | O assistente e o organizar mostram "fallback com 1 alternativa", mas a alternativa (Gemini extra) é descartada por falta de declaração de API paga. O efetivo é só DeepSeek, com zero reservas. A transcrição do WhatsApp também aponta para essa Gemini bloqueada | SQL ao vivo: `ai_task_config` devolve 0 alternativas; `ai_automatic_source_allowed` dá falso | O mapa mostra e explica a situação. A configuração **não** foi alterada: a decisão é do proprietário |
| 2 | A declaração de privacidade e a aprovação para membros eram o mesmo registro | `ai_member_base_sources` usada por `ai_automatic_source_allowed` e por `ai_runtime_for` | Coluna `audience` e `ai_set_source_policy` |
| 3 | Documentos diziam que, no automático, a cota encerra o pedido ou pula a empresa. No texto automático, qualquer falha segue para a próxima conexão, inclusive da mesma empresa. Uma chave pessoal transforma a rota em automática | `attempts.ts:31`; `ai_runtime_for` | ARCHITECTURE, FUNDACAO e o texto do painel corrigidos; o mapa mostra o modo efetivo |
| 4 | O GPT-Live nunca envia `actions_json` | `gpt-live.ts:99` | README e FUNDACAO corrigidos |
| 5 | "Créditos de IA por pessoa" é salvo e não tem efeito | grep `ai_credits` | Rótulo diz "anotação; ainda não limita o uso" |
| 6 | O limite de 20 min só é imposto pelo fornecedor no Gemini e no ElevenLabs; no GPT-Live e no xAI há só cronômetro no navegador | `protocol.ts:78-80`, `elevenlabs-protocol.ts:52` | Pendente para o lote de saúde e limites (A3) |
| 7 | Menores: passagem fora da `main` (PR #50); `.local/claude-review` é worktree, não clone; `.env.example` sem `AI_KEYS_SECRET`; contador do MCP conta operações de banco; renovação OAuth sem teto absoluto; `mcp_save` exposta sem uso | — | `.env.example` corrigido; o resto fica registrado |

Correção do próprio Claude: `supabase/tests/workspace_transaction.sql` fica fora do CI **de propósito**. Ele recusa rodar quando já há proprietário; não é divergência.

## O que mudou

- **Migração** `supabase/migrations/20261006221308_ai_resource_map.sql`, **aplicada em 2026-10-06** (versão registrada `20261006221308`):
  - coluna `audience` (`owner` ou `members`, com padrão `members` para preservar o significado das linhas antigas; o remoto tem 0 linhas);
  - `ai_runtime_for` exige `audience='members'` para a base;
  - `ai_set_source_policy`; o antigo `ai_set_member_base_source` passa a significar "oferecer aos membros";
  - `ai_my_keys` só lista ofertas para membros;
  - helpers de explicação (`ai_source_reason`, `ai_source_declaration`, `ai_chain`, `ai_source_state`) e `ai_resource_map`, só para o proprietário.

  O mapa chama `ai_task_config` e `ai_runtime_for` em vez de duplicar regras. Nunca devolve conteúdo cifrado, hash ou identificador de membro.
- **`src/lib/ai/resources.ts`:** capacidades por provedor (fatos do código, conferidos por testes contra os adaptadores), rótulos e `resourceInsights()`.
- **`src/app/api/ai/resources/route.ts`:** GET do mapa e POST de `set_source_policy` e `set_base`. Funciona sem a migração: responde "aguarda atualização" e não altera nada.
- **Interface:** visão "Mapa de recursos" em Administração › Inteligência artificial (`resource-map.tsx`) e um aviso na Visão geral. Os controles antigos da base saíram de "Minhas chaves de IA" e foram para o mapa, para não haver dois lugares controlando a mesma coisa. CSS só com tokens do tema.
- **Documentação viva:** README (matriz), ARCHITECTURE, FUNDACAO, `.env.example`, comentário em `providers.ts`.

## O que já existia e não foi refeito

Chaves pessoais, remoção segura, OAuth e recibos do MCP, os quatro transportes de voz e a execução estruturada (#46–#49).

## Testes (todos sintéticos; nenhum dado real, nenhuma IA paga)

- SQL em Postgres 17 descartável (contêiner novo; `jornada-assistant-audit-pg` preservado): as 5 suítes do CI mais a nova `ai_resource_map.sql`.
  - A suíte nova reproduz a configuração de produção e prova que o mapa é igual ao roteador em cada tarefa: rota configurada, rota efetiva do proprietário e modo efetivo.
  - Também prova que o mapa não carrega credenciais nem identificador de membro, que a declaração "só eu" não chega a membros, que a oferta a membros bate com o runtime deles e que a chave trocada invalida a declaração.
  - Cobre ainda chaves pessoais no automático, transcrição, MCP, recusas, acesso negado a membro e anônimo e auditoria.
  - **Teste de mutação:** sem o filtro de público, a suíte falha.
- `npm run build`: ok. `tsc --noEmit`: ok. `npm test`: 238 aprovados (6 novos). `npm run test:gate`: 13 cenários ok. `node --test integrations/whatsapp-bridge/protocol.test.mjs`: 3 ok. `git diff --check`: ok.
- Playwright: 128 aprovados e 5 omissões por tipo de aparelho, como antes (suíte completa). Depois das correções da revisão, o projeto da comunidade foi rodado de novo: 22 de 22 aprovados. O teste novo cobre a tela do mapa em desktop e celular escuro, com axe sem violações e sem rolagem horizontal.
- Os testes de concorrência SQL (`tests/sql/*-concurrency.mjs`) exigem Linux e CI, e rodam só no GitHub Actions.
- **Revisão adversarial:** três revisores independentes (segurança, correção, padrões) e um verificador cético. Foram 19 achados confirmados (vários repetidos entre revisores) e 5 descartados como especulativos ou já tratados. Nenhum era bloqueador. Todos os confirmados foram corrigidos:
  - **Organizar usa a rota do assistente quando a dele não resolve nada** (`/api/ai/organize`). O mapa agora mostra isso para o proprietário e para os membros (`served_by`, `members_served_by`), e o teste de equivalência imita esse fallback.
  - **Chave trocada depois de oferecida aos membros:** o formulário volta a "Só eu" e a oferta passa de novo pela confirmação.
  - **Reservas do modo antigo:** seguem `ai_task_config` (as duas primeiras ligadas, atrás de uma principal que funcione). Uma reserva pausada não vira alerta.
  - **Chaves pessoais de voz do proprietário:** aparecem como "indisponível · a voz usa a configuração da Administração", e não como "não faz esta tarefa".
  - **Conexão pausada:** não oferece uma declaração que o banco recusaria; permite retirar a existente.
  - **Atualizar mapa:** só anuncia sucesso quando a leitura dá certo.
  - **Textos e guias:** o que a base atende inclui áudios e fotos dos canais; terminologia "Com alternativas"; plural; comentário de `ELEVENLABS_VOICE_ID`; ponteiro de "Minhas chaves"; guias `ASSISTENTE_VOZ.md` e `WHATSAPP_JORNADA.md` apontam para o mapa.
- **Ordem obrigatória de merge:** aplicar a migração **antes** do merge, como manda o `AGENTS.md` (aplicar, renomear para a versão atribuída, atualizar o stub). Assim não existe janela em que o código publicado esconda os controles da base enquanto o banco ainda não tem `ai_resource_map`.

## Migração: preparada × aplicada

Preparada com a versão local `20261005163000` e **aplicada em 2026-10-06**, com autorização do proprietário, na versão `20261006221308`. Passos seguidos:

1. Aplicar pelo MCP do Supabase.
2. Renomear o arquivo para a versão atribuída.
3. Atualizar a linha do stub.
4. Ler o mapa e confirmar a divergência 1 na conta real.

Não usar `db push`.

## Estados

PR, CI, merge, deployment e alias são confirmados separadamente no PR. O aceite real fica pendente: abrir o mapa na conta do proprietário depois da migração aplicada.

## Pendências e riscos

- **Decisão do proprietário:** a DeepSeek, primeira opção do assistente, guarda dados na China e os termos atuais não excluem treino. A alternativa é o Groq, com contrato sem treino e cota grátis. Ver `docs/PESQUISA_RECURSOS_IA_2026-10-05.md` (PR separado).
- **Decisão do proprietário:** se o Gemini tiver faturamento pago, declarar "API paga, só eu" no mapa para recuperar a reserva e a transcrição.
- **Próximos lotes:** A2 voz flexível (ouvir + pensar + falar), A3 saúde e telemetria sem conteúdo, A4 novos provedores compatíveis, A5 conectores ChatGPT e Claude (CIMD, `iss`, anotações), A6 MCP de saída e worker.
