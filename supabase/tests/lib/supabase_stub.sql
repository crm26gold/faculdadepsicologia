-- Simulação mínima do Supabase para testes locais: papéis, auth, storage e extensões.
-- Aplica todas as migrações em ordem sobre um proprietário e um workspace existentes.
-- Incluído pelos testes em supabase/tests. NUNCA executar no projeto remoto.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create schema extensions;
create schema storage;
create extension pgcrypto schema extensions;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema auth, extensions, storage to authenticated, anon;
grant select, insert, delete on storage.objects to authenticated;

-- Estado anterior à fundação: proprietário vinculado e um workspace existente.
insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'master@example.invalid', '{"full_name": "Pessoa Master"}'),
  ('00000000-0000-4000-8000-00000000000b', 'antiga@example.invalid', '{}');
\ir ../../migrations/20260924205403_personal_workspace.sql
insert into public.app_owner(user_id) values ('00000000-0000-4000-8000-00000000000a');
insert into public.personal_workspaces(owner_id, data)
values ('00000000-0000-4000-8000-00000000000a', '{"version": "1", "subjects": [], "notes": [], "tasks": [], "sessions": []}');
\ir ../../migrations/20260925004423_restrict_internal_trigger.sql
\ir ../../migrations/20260927040622_private_note_attachments.sql
\ir ../../migrations/20260927112342_workspace_editor_generation.sql
\ir ../../migrations/20260928114544_workspace_generation_three.sql
\ir ../../migrations/20260930094408_multiusuario_fundacao.sql
\ir ../../migrations/20260930094700_multiusuario_funcoes_app.sql
\ir ../../migrations/20261001143850_note_attachments_video.sql
\ir ../../migrations/20261001234639_ai_foundation.sql
\ir ../../migrations/20261002220000_messenger_bot.sql
\ir ../../migrations/20261003205055_conflict_without_retry.sql
\ir ../../migrations/20261003185709_jornada_request_limits.sql
\ir ../../migrations/20261003224138_jornada_global_budgets.sql
\ir ../../migrations/20261004115741_ai_connections_routing.sql
\ir ../../migrations/20261004133754_ai_independent_routes.sql
\ir ../../migrations/20261004153404_whatsapp_private_bridge.sql
\ir ../../migrations/20261004190902_advisor_hardening.sql
\ir ../../migrations/20261005001355_elevenlabs_voice.sql
\ir ../../migrations/20261005010022_ai_auto_routing.sql
\ir ../../migrations/20261005011151_ai_auto_economy.sql
\ir ../../migrations/20261005014431_mcp_access.sql
\ir ../../migrations/20261005050000_mcp_oauth.sql

create function public.expect(ok boolean, message text) returns void language plpgsql
as $$ begin if not coalesce(ok, false) then raise exception 'FALHA: %', message; end if; end $$;
create function public.act_as(person text) returns void language sql
as $$ select set_config('request.jwt.claim.sub', person, false) $$;
