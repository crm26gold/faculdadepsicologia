# Relatório da sessão Claude — 5 de outubro de 2026 (passagem para o Codex)

Escopo: repositório `crm26gold/faculdadepsicologia`, Supabase `uccoaebzmvocqwqljmul`, Vercel `faculdadepsicologia` (equipe `faculpsi`). Continua o [relatório de 4 de outubro](RELATORIO_CLAUDE_2026-10-04.md). Este é um registro histórico: confira no código antes de confiar nele.

**Para o Codex:** o proprietário volta a trabalhar com você a partir daqui. A seção 8 traz perguntas diretas. Ele quer saber se você concorda com o trabalho, se vê erros e o que corrigiria ou melhoraria.

## 1. Resumo

Tudo abaixo está na `main`, publicado na Vercel e, quando há banco, aplicado em produção.

| PR | O que entrou | Banco |
| --- | --- | --- |
| [#37](https://github.com/crm26gold/faculdadepsicologia/pull/37) | Skills de agentes, endurecimento do banco, docs fiéis ao código, contexto do produto no `AGENTS.md` (ver relatório de 4/10) | Aplicado |
| [#38](https://github.com/crm26gold/faculdadepsicologia/pull/38) | Mensagem clara quando o Gemini recusa a chave (401/403 sem motivo) | — |
| [#39](https://github.com/crm26gold/faculdadepsicologia/pull/39) | **ElevenLabs** como provedor da Chamada ao vivo | `20261005001355_elevenlabs_voice` |
| [#40](https://github.com/crm26gold/faculdadepsicologia/pull/40) | Roteamento **Automático**: usa o provedor que funcionar, em texto e voz | `20261005010022_ai_auto_routing` |
| [#41](https://github.com/crm26gold/faculdadepsicologia/pull/41) | Automático com **economia primeiro** e **transcrição Whisper** (Groq/OpenAI) para áudios do Telegram e WhatsApp | `20261005011151_ai_auto_economy` |
| [#42](https://github.com/crm26gold/faculdadepsicologia/pull/42) | **Servidor MCP da Jornada** (`/api/mcp`) com chave pessoal `jp_…` | `20261005014431_mcp_access` |
| [#43](https://github.com/crm26gold/faculdadepsicologia/pull/43) | **Login OAuth 2.1 + PKCE** no MCP, para ChatGPT e Claude (app e site) | `20261005015929_mcp_oauth` |
| [#44](https://github.com/crm26gold/faculdadepsicologia/pull/44) | Nome do arquivo da migração OAuth alinhado à versão registrada | — |

**Não foi feita:** a etapa 5 (chaves de IA de cada pessoa e IA para todos os membros). O proprietário decidiu deixá-la para você. A seção 6 traz o desenho e um rascunho do SQL.

## 2. A visão que orientou o trabalho (decisões do proprietário nesta sessão)

1. **Voz:** o ElevenLabs funcionou e fica **só para a Chamada ao vivo**. Áudios comuns (mensagens de voz no Telegram e no WhatsApp) usam transcrição Whisper.
2. **Automático "de um modo geral":** o sistema deve usar a opção recomendada ou qualquer uma que funcionar, em todas as tarefas, com cotas gratuitas primeiro (Google, Groq e outras) e as pagas por último.
3. **Quem paga o quê:**
   - Existe uma **base do sistema**, com as chaves de API do proprietário e cotas gratuitas primeiro, que pode atender todos com **controle e limites por pessoa**.
   - **Cada pessoa pode cadastrar as próprias chaves.** Elas são usadas **primeiro e só para ela**. A chave de alguém nunca atende outra pessoa.
   - **Assinaturas de app** (ChatGPT Plus, Claude Pro, Google AI Pro de estudante) não viram chave de API. Elas se conectam pelo **MCP**, com a pessoa usando a própria assinatura para falar com a Jornada.
   - As assinaturas pessoais do proprietário não podem, legal e tecnicamente, servir outras pessoas.
4. **Promessa operacional:** migração que acrescenta opções novas só é aplicada **depois** que o código que as conhece está publicado. Isso vem de um incidente: o painel antigo quebrou ao receber o provedor `elevenlabs` antes do deploy (seção 5).

## 3. O que foi feito e por quê

### 3.1 ElevenLabs na Chamada ao vivo (#39)

- **Por quê:** a voz pelo Gemini Live falhava (chave revogada e cotas). O proprietário tinha conta e API do ElevenLabs.
- **Como funciona:**
  - O servidor cria ou reaproveita um agente "Jornada Plena · voz" (tag `jornada-plena-voz`, versão `jp-<hash12>` do prompt e das ferramentas).
  - As ferramentas do assistente viram *client tools* (`/v1/convai/tools`).
  - A cada chamada, o servidor pede uma **URL assinada** (`get-signed-url`). O navegador conecta direto por WebSocket (`convai`) com PCM 16 kHz, `eleven_flash_v2_5`, `enable_auth` e `record_voice:false`.
  - As ações chegam como `client_tool_call` e voltam como `client_tool_result`.
  - O contexto e o histórico vão por `dynamic_variables`.
- **Arquivos:**
  - `src/lib/voice/elevenlabs-protocol.ts`: conversões puras e o socket, restrito a `wss://*.elevenlabs.io`.
  - `src/lib/voice/elevenlabs.ts` (server-only): agente, sessão, cache e erros.
  - `src/lib/voice/client.ts`: transporte no navegador.
  - `catalog.ts`: `voiceOnlyProviders`, `liveProviders` e `liveModelAllowed`.
  - Teste do admin `test_live`.
- **Descartado:** o "Speech Engine" do ElevenLabs, porque exige um servidor WebSocket persistente que a Vercel não oferece.
- **Fontes:** o domínio elevenlabs.io está bloqueado no ambiente da sessão. Usei os SDKs oficiais do npm (`@elevenlabs/elevenlabs-js` 2.70.0, `@elevenlabs/types`, `@elevenlabs/client`) como fonte primária e validei os corpos com os serializadores do SDK em modo estrito.
- **Testes:** `tests/voice-elevenlabs.test.ts`, mais Playwright em `tests/browser/voice.spec.ts`.
- **Estado:** o proprietário confirmou que a voz funcionou.

### 3.2 Roteamento Automático (#40) e economia primeiro (#41)

- **Por quê:** o proprietário queria que "use o que funcionar" valesse para tudo, sem escolher modelo à mão.
- **Banco:**
  - `private.ai_task_config` monta a lista de candidatos: a conexão principal primeiro e, no modo `auto`, as demais chaves habilitadas em ordem.
  - A ordem vem de `private.ai_auto_rank` e o modelo de `private.ai_auto_model`. Máximo de 8 candidatos.
  - Voz: `elevenlabs`, `gemini` (Live) e `openai` (`gpt-live-1`).
  - Texto: `gemini`, `groq`, `mistral`, `deepseek`, `xai`, `openrouter` (só modelos `:free`), `openai` e `anthropic`.
- **App:**
  - `runAiAttempts` ganhou `persistent`: no modo `auto`, qualquer erro passa ao próximo candidato, até 8. Os outros modos mantêm o limite de 4 e param em erro de cota.
  - Cada nova tentativa consome o orçamento (`retryBudget`).
- **Voz com reserva:** acontece no servidor (`prepareLiveSession` com `skip`) e no navegador (lista `skipped`), **antes do primeiro áudio**. Depois que a conversa começa, não troca no meio.
- **Whisper:** `audioTask: 'transcribe'` em `providers.ts`, com Groq `whisper-large-v3-turbo` e OpenAI `gpt-4o-mini-transcribe`. Usado pelos webhooks do Telegram e do WhatsApp.
- **Correção junto:** `models.ts` excluía modelos `-instruct` também nos gateways (Groq e OpenRouter), onde eles são de conversa.
- **Testes:** `tests/ai-auto-routing.test.ts` e `tests/ai-models.test.ts`.

### 3.3 Servidor MCP da Jornada (#42)

- **Por quê:** o proprietário quer usar Claude Code, Codex, Gemini CLI e Antigravity **com as próprias assinaturas** para consultar e organizar a Jornada, sem gastar as chaves de API do sistema.
- **Rota:** `src/app/api/mcp/route.ts` usa `@modelcontextprotocol/server` 2.3.0 com `createMcpHandler(..., { legacy: 'stateless', responseMode: 'json' })`.
  - Aceita a era 2026-07-28 (em `tools/call` exige o cabeçalho `Mcp-Name`) e a 2025 (resposta em SSE).
- **Ferramentas (`src/lib/mcp/server.ts`):**
  - `consultar_jornada` (só leitura) usa `assistantQuery` e `queryWorkspace`.
  - `registrar_na_jornada` aceita até 8 `commandAction` e usa `applyCommands`, com as mesmas validações do app.
  - **Exclusões e substituição de anotação inteira nunca são aplicadas pelo MCP**: ficam pendentes no app.
- **Chaves pessoais:**
  - Prefixo `jp_`. O banco guarda só o SHA-256, a dica e a permissão de escrita.
  - Limites: 300 chamadas a cada 10 minutos por chave e 10 chaves ativas por pessoa.
  - O painel fica em Meu espaço › Conectar assistentes (`src/components/assistant-connections.tsx`), com a configuração pronta para cada app.
- **Acesso ao banco:** as RPCs `mcp_*` exigem o segredo do servidor (`private.bot_check`) e são chamadas pelo cliente anônimo `botDatabase()`. É o mesmo padrão já usado pelo Telegram e pelo WhatsApp. O segredo deriva de `AI_KEYS_SECRET`.
- **Testes:** `tests/mcp-server.test.ts` (Node, com `registerHooks` resolvendo `server-only`), `tests/sql/mcp-access.sql` e Playwright em `community.spec.ts`.
- **Documentação:** `docs/CONECTAR_ASSISTENTES.md`.

### 3.4 OAuth 2.1 para ChatGPT e Claude (#43, #44)

- **Por quê:** o ChatGPT e o Claude (site e app) não aceitam chave colada; exigem OAuth.
- **Metadados:**
  - RFC 9728 em `/.well-known/oauth-protected-resource` e em `/.well-known/oauth-protected-resource/api/mcp`.
  - RFC 8414 em `/.well-known/oauth-authorization-server`.
  - O 401 do `/api/mcp` envia `resource_metadata` no `WWW-Authenticate`.
- **Fluxo:**
  - Registro dinâmico de clientes (RFC 7591), só clientes públicos.
  - Página de consentimento `/oauth/authorize`. Depois do login Google, o app volta à página pela chave `jornada-plena:oauth-return` no `localStorage`, aceitando só `/oauth/authorize?...`.
  - `POST /api/oauth/authorize` grava o código como hash.
  - `/api/oauth/token` faz a troca com **PKCE S256 conferido no banco**.
- **Tokens:**
  - Acesso de 1 hora; renovação rotativa válida por 90 dias.
  - Cada autorização vira uma linha em `private.mcp_tokens` (colunas `client_id`, `refresh_hash`, `refresh_expires_at`).
  - Aparece e é revogável em Meu espaço. Revogar também corta a renovação.
- **Escopos:** `ler` e `registrar`. A pessoa escolhe na tela se permite escrita.
- **Testes:** `tests/sql/mcp-oauth.sql` cobre PKCE errado, código reutilizado, renovação reutilizada, retorno não registrado e revogação. Também `tests/mcp-server.test.ts`. O valor de referência do RFC 7636 (`E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`) está no teste.
- **Verificado em produção:** os dois documentos `.well-known` e a página de consentimento, que consulta o banco e responde "aplicativo não registrado" para um cliente inexistente.

## 4. Estado atual de produção (consultado em 5/10, ~02:15 UTC)

- **Última migração registrada:** `20261005015929_mcp_oauth`. Os arquivos em `supabase/migrations` batem com o histórico remoto.
- **Chaves do sistema:** gemini, groq, deepseek e elevenlabs, mais uma reserva gemini habilitada.
- **Tarefas:**
  - `assistente` e `organizar`: deepseek, `auto:rapido`, **modo `fallback`**. O proprietário ainda não trocou para "Automático" no painel.
  - `voz`: elevenlabs, modo `fixed`.
- **IA só para o proprietário:** `private.ai_runtime` devolve `null` para quem não é dono. Membros ainda não têm IA; essa é a etapa 5.
- **Usuários:** 4. Orçamento global de IA: 80/min, 600/dia, 6000/30 dias. Por conta: 40/min e 400/dia (`private.reserve_jornada_budget`).
- **MCP:** 1 chave ativa ("Gemini Cli", com escrita), **ainda nunca usada** (`last_used_at` nulo). Nenhum cliente OAuth registrado ainda. **Nenhuma conexão real foi validada até agora**: nem Gemini CLI, nem Antigravity, nem ChatGPT, nem Claude.
- **Avisos do Supabase Advisor esperados:** "RLS sem política" nas tabelas `private.*`, de propósito. "Função SECURITY DEFINER executável por anon" nas RPCs `bot_*`, `mcp_*`, `mcp_oauth_*` e `whatsapp_server`, todas protegidas por `bot_check`. A seção 8 pede sua opinião sobre esse padrão.

## 5. Incidentes e erros desta sessão

- **Painel de administração caiu ("This page couldn't load").**
  - Causa: apliquei a migração do ElevenLabs **antes** de publicar o código. O painel antigo fazia `aiCatalog['elevenlabs']` e recebia `undefined`.
  - Correção: o merge do #39, com aprovação do proprietário.
  - Lição, virou regra: migração que traz opções novas só depois do deploy.
- **Valor de referência PKCE errado no meu teste:** corrigido para o valor do RFC.
- **Testes de banco precisaram semear a tarefa `voz`:** ela não existe no stub. O teste faz isso como superusuário.
- **Rede bloqueada no ambiente da sessão** (elevenlabs.io, modelcontextprotocol.io e o próprio domínio do app): verifiquei a produção pela ferramenta da Vercel, e não por `curl`.
- **Merge pelo agente bloqueado:** a partir do #44, o ambiente passou a exigir que o proprietário faça os merges.

## 6. Pendente: etapa 5, chaves de IA por pessoa e IA para todos

**Objetivo:** "mesmo que a pessoa não tenha nada, o sistema tem o seu; se ela tiver chaves, fica cada vez melhor, com controle e inteligência."

**Desenho proposto (não implementado):**

1. **Tabela `private.ai_user_keys`** com `(user_id, provider)` como chave primária. Guarda chave cifrada com o mesmo cofre de `src/lib/ai/vault.ts`, dica e `enabled`. Provedores aceitos: gemini, groq, mistral, deepseek, xai, openrouter, openai e anthropic. Ficam fora `vertex` e `google_cloud` (exigem projeto) e `elevenlabs` (custo e agente por conta; avaliar depois).
2. **Política `private.ai_member_policy`** (linha única) com `base_enabled`, **desligada por padrão**. Liberar a base do sistema para membros é decisão do proprietário e fica registrada em `private.audit`.
3. **`private.ai_runtime_for(person, task)`:**
   - Proprietário: segue como hoje (`ai_task_config`).
   - Membro: primeiro as chaves dele, na ordem do Automático. Depois, se `base_enabled` e a tarefa não for `voz`, a base do sistema. Máximo de 8 candidatos; `routing = 'auto'` quando há chave pessoal.
   - `ai_runtime(task)` passa a chamar `ai_runtime_for(auth.uid(), task)`.
   - `bot_context` (Telegram e WhatsApp) troca o teste de dono por `ai_runtime_for(person, 'assistente')`.
4. **RPCs da pessoa:**
   - `ai_my_keys()` devolve só dicas.
   - `ai_my_key_save(server_secret, provider, ciphertext, hint)` e `ai_my_key_runtime(server_secret, provider)` exigem o segredo do servidor, para que a gravação passe pela validação e pela cifragem no servidor.
   - Também `ai_my_key_set(provider, enabled)`, `ai_my_key_remove(provider)` e `ai_set_member_base(enabled)`, esta só para o dono.
5. **App:**
   - Rota `/api/ai/my-keys`: GET; POST salvar (usa `credentialIssue`, testa a chave com `refreshModels` e cifra com `sealKey`), ligar/desligar e remover.
   - Componente "Minhas chaves de IA" em Meu espaço, ao lado de `AssistantConnections`, com link para obter a chave de cada provedor.
   - O dono vê ali também o interruptor da base do sistema.
6. **Ordem de entrega:** código publicado primeiro, migração depois. O código deve tolerar a ausência das RPCs, por exemplo escondendo o painel.

**Pontos em aberto que você deve resolver:**

- **Orçamento global de IA (600/dia):** hoje conta tudo. Com chaves pessoais, quem usa a própria chave não deveria gastar o orçamento da base. Sugestão: escopo de orçamento separado, ou não consumir o global quando o candidato que respondeu for `personal`.
- **Privacidade:** o plano gratuito do Gemini (AI Studio) pode usar o conteúdo para melhorar os produtos do Google. Liberar a base gratuita para membros manda a vida pessoal deles para esse plano. É preciso aviso claro na tela e na página `/privacidade`, ou restringir a base dos membros a provedores pagos ou sem treino.
- **Voz dos membros:** só com chave própria (Gemini Live ou OpenAI). O ElevenLabs do sistema continua só do dono.

**Rascunho do SQL (não testado, nunca aplicado):**

<details><summary>supabase/migrations/…_ai_personal_keys.sql (rascunho)</summary>

```sql
create table private.ai_user_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic')),
  key_ciphertext text not null check (char_length(key_ciphertext) between 1 and 20000),
  key_hint text not null check (char_length(key_hint) between 1 and 12),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table private.ai_user_keys enable row level security;
revoke all on private.ai_user_keys from public, anon, authenticated;

create table private.ai_member_policy (
  id boolean primary key default true check (id),
  base_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.ai_member_policy default values;
alter table private.ai_member_policy enable row level security;
revoke all on private.ai_member_policy from public, anon, authenticated;

create function private.ai_personal_candidates(person uuid, task_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider',k.provider,'model',m.model,'base_url','','gcp_project','','gcp_location','',
    'key_ciphertext',k.key_ciphertext,'personal',true) order by private.ai_auto_rank(task_id,k.provider)),'[]'::jsonb)
  from private.ai_user_keys k
  cross join lateral (select private.ai_auto_model(task_id,k.provider,coalesce((select t.model from public.ai_tasks t where t.id=task_id),'auto:rapido')) model) m
  where k.user_id=person and k.enabled and m.model is not null;
$$;

create function private.ai_runtime_for(person uuid, task_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare personal jsonb; base jsonb; candidates jsonb;
begin
  if person is null then return null; end if;
  if exists(select 1 from public.app_owner o where o.user_id=person) then return private.ai_task_config(task_id); end if;
  personal := private.ai_personal_candidates(person, task_id);
  if task_id <> 'voz' and coalesce((select p.base_enabled from private.ai_member_policy p), false) then
    base := private.ai_task_config(task_id);
  end if;
  candidates := personal;
  if base is not null then
    candidates := candidates || jsonb_build_array(base - 'alternatives' - 'routing') || coalesce(base->'alternatives','[]'::jsonb);
  end if;
  if jsonb_array_length(candidates) = 0 then return null; end if;
  select jsonb_agg(e.value order by e.ord) into candidates from jsonb_array_elements(candidates) with ordinality e(value, ord) where e.ord <= 8;
  return (candidates->0) || jsonb_build_object('alternatives', candidates - 0,
    'routing', case when jsonb_array_length(personal) > 0 then 'auto' else coalesce(base->>'routing','fixed') end);
end;
$$;
revoke all on function private.ai_personal_candidates(uuid,text), private.ai_runtime_for(uuid,text) from public, anon, authenticated;

create or replace function private.ai_runtime(task_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.ai_runtime_for(auth.uid(), task_id);
end;
$$;
-- bot_context: idêntico ao de 20261004115741_ai_connections_routing.sql, trocando a linha do dono por
--   runtime := private.ai_runtime_for(person, 'assistente');
-- RPCs da pessoa: ai_my_keys(), ai_my_key_save(server_secret,provider,ciphertext,hint) com private.bot_check,
--   ai_my_key_runtime(server_secret,provider), ai_my_key_set(provider,enabled), ai_my_key_remove(provider),
--   ai_set_member_base(enabled) só para private.is_owner() e com private.audit('ai_member_base',...).
--   Todas: revoke de public/anon, grant a authenticated.
```

</details>

## 7. Outros pendentes e convenções

- **Bloqueados, aguardando o proprietário:** apagar 37 branches antigos (ele autorizou; o ambiente bloqueou) e a decisão sobre `TERMS_VERSION`. Ele **recusou** apagar os dois backups `private.personal_workspaces_backup_*` e fechar o PR #8.
- **Guias dados ao proprietário, ainda sem confirmação de sucesso:** Gemini CLI (`~/.gemini/settings.json` com `httpUrl` e `headers`) e Antigravity (`mcp_config.json` com `serverUrl` e `headers`). Também a opção do conector personalizado no claude.ai, que seria o primeiro teste real do OAuth. Os menus desses apps mudam; confirme com ele.
- **Convenção de migração:**
  1. Aplicar pelo MCP do Supabase.
  2. Ler a versão em `supabase_migrations.schema_migrations`.
  3. Renomear o arquivo para essa versão.
  4. Atualizar `supabase/tests/lib/supabase_stub.sql`.
  5. Rodar os testes de banco do CI num Postgres local antes.
- **Testes de banco:** `supabase/tests/multiusuario_api.sql` inclui os arquivos de `tests/sql/*.sql`.
- **Playwright local:** use uma configuração temporária com `executablePath` do Chromium instalado, **sem commitar**.
- **Next.js 16.3.6:** leia `node_modules/next/dist/docs/` antes de mexer em rotas (aviso do `AGENTS.md`).
- **README:** a matriz já marca "Assistentes externos (MCP)" como "Implementado; conexão real a validar". Atualize quando a primeira conexão real funcionar e quando a etapa 5 entrar.

## 8. Perguntas para o Codex

O proprietário pediu sua revisão crítica. Responda a ele com o que concorda, o que discorda e o que corrigiria. Em especial:

1. **Padrão `anon` + segredo do servidor** (`bot_check`) nas RPCs do MCP, do OAuth e dos bots, em vez da chave `service_role`. Você mantém ou migra? O segredo deriva de `AI_KEYS_SECRET`; rotacioná-lo invalida as chaves cifradas e o verificador de orçamento ao mesmo tempo.
2. **Tela de consentimento OAuth** (`src/components/oauth-consent.tsx`): mostra só o `client_name`, que o próprio cliente escolhe no registro dinâmico. Um cliente malicioso pode se chamar "ChatGPT". **Acho que errei aqui:** a tela deveria mostrar também o domínio do `redirect_uri` e avisar quando não for de um app conhecido. Você concorda?
3. **Registro dinâmico aberto:** limite global de 50 por hora. Um abuso bloqueia o registro legítimo de todos. Também não há limpeza de `private.oauth_clients` sem uso, de `private.oauth_codes` usados ou expirados, nem de linhas expiradas em `mcp_tokens`. Vale um job de limpeza (cron do Supabase) e um limite por IP?
4. **Automático persistente (8 tentativas):** cada tentativa consome o orçamento por pessoa. Numa queda geral, uma única pergunta pode gastar 8 unidades. Prefere limitar por tempo total, ou contar uma só unidade por pergunta?
5. **Voz:** a reserva só troca antes do primeiro áudio. Faz sentido para você, ou valeria reconectar no meio da conversa com outro provedor?
6. **Etapa 5:** concorda com o desenho da seção 6, inclusive a base dos membros desligada por padrão e a questão de privacidade do plano gratuito do Gemini?
7. **Rotas `assistente`/`organizar` em `fallback`:** recomendaria ao proprietário trocar para "Automático" agora?
8. Qualquer outra coisa que você veja de errado no código desses PRs (#39 a #44): o proprietário quer saber.
