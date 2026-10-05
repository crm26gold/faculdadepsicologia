-- Servidor MCP da Jornada: chaves pessoais para assistentes externos (Claude Code, Codex, Gemini, Antigravity).
-- Só o hash da chave fica no banco. Cada chave acessa apenas a vida pessoal de quem a criou;
-- nunca grupos, salas ou dados de outras pessoas. Escrever é uma permissão explícita da chave.
create table private.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check(char_length(label) between 1 and 60),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  hint text not null check(char_length(hint) between 1 and 8),
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  window_started timestamptz not null default now(),
  window_calls integer not null default 0
);
create index mcp_tokens_user_id_idx on private.mcp_tokens(user_id);
alter table private.mcp_tokens enable row level security;
revoke all on private.mcp_tokens from public,anon,authenticated;

-- Pessoa autenticada: criar, listar e revogar as próprias chaves.
create function public.mcp_token_create(next_label text,next_hash text,next_hint text,next_write boolean,valid_days integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare person uuid:=auth.uid(); saved uuid;
begin
 if person is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if next_hash is null or next_hash !~ '^[a-f0-9]{64}$' or char_length(coalesce(next_hint,'')) not between 1 and 8
    or char_length(btrim(coalesce(next_label,''))) not between 1 and 60 or next_write is null
    or (valid_days is not null and valid_days not between 1 and 365) then raise exception 'Invalid token' using errcode='22023'; end if;
 if (select count(*) from private.mcp_tokens t where t.user_id=person and t.revoked_at is null and (t.expires_at is null or t.expires_at>now()))>=10 then
   raise exception 'Token limit reached' using errcode='22023'; end if;
 insert into private.mcp_tokens(user_id,label,token_hash,hint,can_write,expires_at)
 values(person,btrim(next_label),next_hash,next_hint,next_write,case when valid_days is null then null else now()+make_interval(days=>valid_days) end)
 returning id into saved;
 return saved;
end $$;
create function public.mcp_token_list() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'hint',t.hint,'can_write',t.can_write,'created_at',t.created_at,
   'expires_at',t.expires_at,'last_used_at',t.last_used_at) order by t.created_at desc),'[]'::jsonb)
 from private.mcp_tokens t where t.user_id=auth.uid() and t.revoked_at is null and (t.expires_at is null or t.expires_at>now());
$$;
create function public.mcp_token_revoke(token_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.mcp_tokens set revoked_at=now() where id=token_id and user_id=auth.uid() and revoked_at is null;
 if not found then raise exception 'Token not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.mcp_token_create(text,text,text,boolean,integer),public.mcp_token_list(),public.mcp_token_revoke(uuid) from public,anon;
grant execute on function public.mcp_token_create(text,text,text,boolean,integer),public.mcp_token_list(),public.mcp_token_revoke(uuid) to authenticated;

-- Servidor da Jornada (prova com o segredo do bot): valida a chave e limita 300 chamadas a cada 10 minutos.
create function private.mcp_person(server_secret text,token text) returns private.mcp_tokens
language plpgsql security definer set search_path='' as $$
declare found_token private.mcp_tokens;
begin
 perform private.bot_check(server_secret);
 update private.mcp_tokens t set last_used_at=now(),
   window_started=case when t.window_started<now()-interval '10 minutes' then now() else t.window_started end,
   window_calls=case when t.window_started<now()-interval '10 minutes' then 1 else t.window_calls+1 end
 where t.token_hash=token and t.revoked_at is null and (t.expires_at is null or t.expires_at>now())
 returning t.* into found_token;
 if found_token.id is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if found_token.window_calls>300 then raise exception 'Rate limited' using errcode='PT429'; end if;
 return found_token;
end $$;
create function public.mcp_auth(server_secret text,token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens;
begin
 person:=private.mcp_person(server_secret,token);
 return jsonb_build_object('token_id',person.id,'can_write',person.can_write);
end $$;
create function public.mcp_context(server_secret text,token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens;
begin
 person:=private.mcp_person(server_secret,token);
 return jsonb_build_object('can_write',person.can_write,
   'workspace',(select jsonb_build_object('data',w.data,'revision',w.revision) from public.personal_workspaces w where w.owner_id=person.user_id));
end $$;
create function public.mcp_save(server_secret text,token text,next_data jsonb,expected_revision integer) returns integer
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens; next_revision integer;
begin
 person:=private.mcp_person(server_secret,token);
 if not person.can_write then raise exception 'Read-only token' using errcode='42501'; end if;
 if expected_revision is null or expected_revision < 0 or next_data is null or jsonb_typeof(next_data) <> 'object'
    or (next_data->>'version') is distinct from '1'
    or jsonb_typeof(next_data->'subjects') is distinct from 'array' or jsonb_typeof(next_data->'notes') is distinct from 'array'
    or jsonb_typeof(next_data->'tasks') is distinct from 'array' or jsonb_typeof(next_data->'sessions') is distinct from 'array'
    or octet_length(next_data::text) > 2000000 then
   raise exception 'Invalid payload' using errcode = '22023';
 end if;
 if expected_revision = 0 then
   begin
     insert into public.personal_workspaces(owner_id, data, revision) values (person.user_id, next_data, 1);
     return 1;
   exception when unique_violation then raise exception 'Workspace conflict' using errcode = 'PT409';
   end;
 end if;
 update public.personal_workspaces set data = next_data, revision = revision + 1, updated_at = now()
  where owner_id = person.user_id and revision = expected_revision returning revision into next_revision;
 if next_revision is null then raise exception 'Workspace conflict' using errcode = 'PT409'; end if;
 return next_revision;
end $$;
revoke all on function private.mcp_person(text,text),public.mcp_auth(text,text),public.mcp_context(text,text),public.mcp_save(text,text,jsonb,integer) from public,authenticated;
grant execute on function public.mcp_auth(text,text),public.mcp_context(text,text),public.mcp_save(text,text,jsonb,integer) to anon;
