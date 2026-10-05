-- Login OAuth 2.1 do servidor MCP, para ChatGPT e Claude (app e site), que não aceitam chave colada.
-- Clientes públicos (sem segredo), PKCE S256 obrigatório, código de uso único por 10 minutos.
-- Cada autorização vira uma chave em private.mcp_tokens (visível e revogável em Meu espaço);
-- a renovação troca a chave de acesso e o token de renovação a cada uso.
create table private.oauth_clients (
  client_id text primary key check(client_id ~ '^jpc_[A-Za-z0-9_-]{20,60}$'),
  client_name text not null check(char_length(client_name) between 1 and 80),
  redirect_uris text[] not null check(cardinality(redirect_uris) between 1 and 5),
  created_at timestamptz not null default now()
);
create table private.oauth_codes (
  code_hash text primary key check(code_hash ~ '^[a-f0-9]{64}$'),
  client_id text not null references private.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null check(char_length(redirect_uri) <= 500),
  code_challenge text not null check(code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  can_write boolean not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index oauth_codes_user_id_idx on private.oauth_codes(user_id);
create index oauth_codes_client_id_idx on private.oauth_codes(client_id);
alter table private.mcp_tokens add column client_id text references private.oauth_clients(client_id) on delete cascade,
  add column refresh_hash text unique check(refresh_hash ~ '^[a-f0-9]{64}$'),
  add column refresh_expires_at timestamptz;
create index mcp_tokens_client_id_idx on private.mcp_tokens(client_id);
alter table private.oauth_clients enable row level security;
alter table private.oauth_codes enable row level security;
revoke all on private.oauth_clients,private.oauth_codes from public,anon,authenticated;

-- Registro dinâmico (RFC 7591), feito pelo servidor da Jornada depois de validar os endereços.
create function public.mcp_oauth_register(server_secret text,next_client text,next_name text,next_uris text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.bot_check(server_secret);
 if (select count(*) from private.oauth_clients where created_at>now()-interval '1 hour')>=50 then raise exception 'Rate limited' using errcode='PT429'; end if;
 insert into private.oauth_clients(client_id,client_name,redirect_uris) values(next_client,next_name,next_uris);
end $$;
create function public.mcp_oauth_client(server_secret text,wanted text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.bot_check(server_secret);
 return (select jsonb_build_object('client_id',c.client_id,'client_name',c.client_name,'redirect_uris',to_jsonb(c.redirect_uris)) from private.oauth_clients c where c.client_id=wanted);
end $$;
-- A pessoa autenticada aprova: o código fica guardado só como hash.
create function public.mcp_oauth_approve(wanted text,next_code_hash text,next_redirect text,next_challenge text,next_write boolean) returns void
language plpgsql security definer set search_path='' as $$
declare person uuid:=auth.uid();
begin
 if person is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if not exists(select 1 from private.oauth_clients c where c.client_id=wanted and next_redirect=any(c.redirect_uris)) then raise exception 'Invalid client' using errcode='22023'; end if;
 insert into private.oauth_codes(code_hash,client_id,user_id,redirect_uri,code_challenge,can_write,expires_at)
 values(next_code_hash,wanted,person,next_redirect,next_challenge,next_write,now()+interval '10 minutes');
end $$;
-- Troca o código por chave de acesso (1 hora) e token de renovação (90 dias). O servidor calcula o
-- S256 do code_verifier recebido; o banco só aceita se for igual ao desafio guardado.
create function public.mcp_oauth_exchange(server_secret text,code text,wanted text,redirect text,verifier_challenge text,next_access text,next_refresh text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare grant_row private.oauth_codes; client private.oauth_clients;
begin
 perform private.bot_check(server_secret);
 update private.oauth_codes o set used_at=now() where o.code_hash=code and o.used_at is null and o.expires_at>now()
   and o.client_id=wanted and o.redirect_uri=redirect and o.code_challenge=verifier_challenge returning o.* into grant_row;
 if grant_row.code_hash is null then raise exception 'Invalid grant' using errcode='22023'; end if;
 select * into client from private.oauth_clients where client_id=wanted;
 if (select count(*) from private.mcp_tokens t where t.user_id=grant_row.user_id and t.revoked_at is null and (t.expires_at is null or t.expires_at>now() or t.refresh_expires_at>now()))>=20 then
   raise exception 'Token limit reached' using errcode='22023'; end if;
 insert into private.mcp_tokens(user_id,label,token_hash,hint,can_write,expires_at,client_id,refresh_hash,refresh_expires_at)
 values(grant_row.user_id,left(client.client_name,60),next_access,'oauth',grant_row.can_write,now()+interval '1 hour',wanted,next_refresh,now()+interval '90 days');
 return jsonb_build_object('can_write',grant_row.can_write);
end $$;
create function public.mcp_oauth_refresh(server_secret text,refresh text,wanted text,next_access text,next_refresh text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved private.mcp_tokens;
begin
 perform private.bot_check(server_secret);
 update private.mcp_tokens t set token_hash=next_access,refresh_hash=next_refresh,expires_at=now()+interval '1 hour',refresh_expires_at=now()+interval '90 days'
 where t.refresh_hash=refresh and t.client_id=wanted and t.revoked_at is null and t.refresh_expires_at>now() returning t.* into saved;
 if saved.id is null then raise exception 'Invalid grant' using errcode='22023'; end if;
 return jsonb_build_object('can_write',saved.can_write);
end $$;

-- A lista em Meu espaço mostra também as conexões por login, que expiram e se renovam sozinhas.
create or replace function public.mcp_token_list() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'hint',t.hint,'can_write',t.can_write,'created_at',t.created_at,
   'expires_at',case when t.client_id is null then t.expires_at else t.refresh_expires_at end,'last_used_at',t.last_used_at,'oauth',t.client_id is not null) order by t.created_at desc),'[]'::jsonb)
 from private.mcp_tokens t where t.user_id=auth.uid() and t.revoked_at is null
   and (t.expires_at is null or t.expires_at>now() or t.refresh_expires_at>now());
$$;

revoke all on function public.mcp_oauth_register(text,text,text,text[]),public.mcp_oauth_client(text,text),public.mcp_oauth_exchange(text,text,text,text,text,text,text),
 public.mcp_oauth_refresh(text,text,text,text,text) from public,authenticated;
grant execute on function public.mcp_oauth_register(text,text,text,text[]),public.mcp_oauth_client(text,text),public.mcp_oauth_exchange(text,text,text,text,text,text,text),
 public.mcp_oauth_refresh(text,text,text,text,text) to anon;
revoke all on function public.mcp_oauth_approve(text,text,text,text,boolean) from public,anon;
grant execute on function public.mcp_oauth_approve(text,text,text,text,boolean) to authenticated;
