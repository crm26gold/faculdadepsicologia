-- Base de IA trocável pelo painel: provedores, chaves cifradas e o modelo de cada tarefa.
-- Só o proprietário (public.app_owner) configura. As chaves chegam aqui já cifradas pelo
-- servidor (AES-256-GCM com segredo que existe apenas no ambiente da Vercel) e nunca voltam ao navegador.

create function private.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.app_owner o where o.user_id = (select auth.uid())) $$;

create table public.ai_providers (
  id text primary key check (id in ('gemini', 'vertex', 'openai', 'anthropic', 'compatible')),
  enabled boolean not null default false,
  label text not null default '' check (char_length(label) <= 60),
  base_url text not null default '' check (char_length(base_url) <= 300 and (base_url = '' or base_url ~ '^https://')),
  gcp_project text not null default '' check (char_length(gcp_project) <= 100),
  gcp_location text not null default '' check (char_length(gcp_location) <= 40),
  key_ciphertext text not null default '' check (char_length(key_ciphertext) <= 20000),
  key_hint text not null default '' check (char_length(key_hint) <= 12),
  updated_at timestamptz not null default now()
);
insert into public.ai_providers(id) values ('gemini'), ('vertex'), ('openai'), ('anthropic'), ('compatible');

create table public.ai_tasks (
  id text primary key check (id in ('assistente', 'organizar')),
  provider text references public.ai_providers(id),
  model text not null default '' check (char_length(model) <= 120),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.ai_tasks(id) values ('assistente'), ('organizar');

alter table public.ai_providers enable row level security;
alter table public.ai_tasks enable row level security;
revoke all on public.ai_providers, public.ai_tasks from anon, authenticated;

-- Estado para o painel: sem chave, só se existe e os últimos caracteres.
create function private.ai_admin_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'providers', (select jsonb_agg(jsonb_build_object('id', p.id, 'enabled', p.enabled, 'label', p.label, 'base_url', p.base_url,
      'gcp_project', p.gcp_project, 'gcp_location', p.gcp_location, 'has_key', p.key_ciphertext <> '', 'key_hint', p.key_hint,
      'updated_at', p.updated_at) order by p.id) from public.ai_providers p),
    'tasks', (select jsonb_agg(jsonb_build_object('id', t.id, 'provider', t.provider, 'model', t.model, 'enabled', t.enabled,
      'updated_at', t.updated_at) order by t.id) from public.ai_tasks t));
end;
$$;

-- next_ciphertext null mantém a chave atual; '' remove.
create function private.ai_save_provider(provider_id text, next_enabled boolean, next_label text, next_base_url text,
  next_project text, next_location text, next_ciphertext text, next_hint text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.ai_providers
     set enabled = next_enabled, label = coalesce(next_label, ''), base_url = coalesce(next_base_url, ''),
         gcp_project = coalesce(next_project, ''), gcp_location = coalesce(next_location, ''),
         key_ciphertext = coalesce(next_ciphertext, key_ciphertext),
         key_hint = case when next_ciphertext is null then key_hint else coalesce(next_hint, '') end,
         updated_at = now()
   where id = provider_id;
  if not found then raise exception 'Provider not found' using errcode = 'P0002'; end if;
  perform private.audit('ai_provider', null, null, jsonb_build_object('provider', provider_id, 'enabled', next_enabled,
    'key', case when next_ciphertext is null then 'mantida' when next_ciphertext = '' then 'removida' else 'trocada' end));
end;
$$;

create function private.ai_save_task(task_id text, next_provider text, next_model text, next_enabled boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.ai_tasks set provider = nullif(next_provider, ''), model = coalesce(next_model, ''), enabled = next_enabled, updated_at = now()
   where id = task_id;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  perform private.audit('ai_task', null, null, jsonb_build_object('task', task_id, 'provider', next_provider, 'model', next_model, 'enabled', next_enabled));
end;
$$;

-- O servidor busca a configuração de uma tarefa para quem está usando. A chave vem cifrada:
-- sem o segredo do servidor ela é inútil. Durante o piloto, só o proprietário usa a IA.
create function private.ai_runtime(task_id text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  found_row record;
begin
  if not private.is_owner() then return null; end if;
  select t.model, p.id as provider, p.base_url, p.gcp_project, p.gcp_location, p.key_ciphertext into found_row
    from public.ai_tasks t join public.ai_providers p on p.id = t.provider
   where t.id = task_id and t.enabled and p.enabled and p.key_ciphertext <> '' and t.model <> '';
  if not found then return null; end if;
  return to_jsonb(found_row);
end;
$$;

-- Para testar um provedor ou listar os modelos dele a partir do painel (somente o proprietário).
create function private.ai_provider_runtime(provider_id text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  found_row record;
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select p.id as provider, p.base_url, p.gcp_project, p.gcp_location, p.key_ciphertext into found_row
    from public.ai_providers p where p.id = provider_id and p.key_ciphertext <> '';
  if not found then return null; end if;
  return to_jsonb(found_row);
end;
$$;

create function public.ai_provider_runtime(provider_id text) returns jsonb language sql security invoker set search_path = ''
as $$ select private.ai_provider_runtime(provider_id) $$;
create function public.ai_admin_state() returns jsonb language sql security invoker set search_path = ''
as $$ select private.ai_admin_state() $$;
create function public.ai_save_provider(provider_id text, next_enabled boolean, next_label text, next_base_url text,
  next_project text, next_location text, next_ciphertext text, next_hint text) returns void language sql security invoker set search_path = ''
as $$ select private.ai_save_provider(provider_id, next_enabled, next_label, next_base_url, next_project, next_location, next_ciphertext, next_hint) $$;
create function public.ai_save_task(task_id text, next_provider text, next_model text, next_enabled boolean) returns void
language sql security invoker set search_path = ''
as $$ select private.ai_save_task(task_id, next_provider, next_model, next_enabled) $$;
create function public.ai_runtime(task_id text) returns jsonb language sql security invoker set search_path = ''
as $$ select private.ai_runtime(task_id) $$;

revoke all on function private.is_owner(), private.ai_admin_state(), private.ai_save_provider(text, boolean, text, text, text, text, text, text),
  private.ai_save_task(text, text, text, boolean), private.ai_runtime(text), private.ai_provider_runtime(text) from public, anon;
revoke all on function public.ai_admin_state(), public.ai_save_provider(text, boolean, text, text, text, text, text, text),
  public.ai_save_task(text, text, text, boolean), public.ai_runtime(text), public.ai_provider_runtime(text) from public, anon;
grant execute on function private.is_owner(), private.ai_admin_state(), private.ai_save_provider(text, boolean, text, text, text, text, text, text),
  private.ai_save_task(text, text, text, boolean), private.ai_runtime(text), private.ai_provider_runtime(text) to authenticated;
grant execute on function public.ai_admin_state(), public.ai_save_provider(text, boolean, text, text, text, text, text, text),
  public.ai_save_task(text, text, text, boolean), public.ai_runtime(text), public.ai_provider_runtime(text) to authenticated;
