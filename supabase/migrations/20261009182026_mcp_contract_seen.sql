-- Conector desatualizado: ChatGPT e Claude guardam a lista de ferramentas e as instruções da Jornada e só pedem de
-- novo quando a pessoa atualiza o conector. Cada conexão guarda aqui a impressão do contrato que recebeu por último
-- (o servidor grava ao responder tools/list). Quando difere da atual, a ferramenta avisa a pessoa e a tela mostra
-- "atualize este conector". Só o servidor grava, com o segredo; a pessoa lê pela própria lista de conexões.
alter table private.mcp_tokens add column contract text check(contract ~ '^[a-f0-9]{12}$');

create function public.mcp_contract_seen(server_secret text,token text,seen text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.bot_check(server_secret);
 if seen is null or seen !~ '^[a-f0-9]{12}$' then raise exception 'Invalid contract' using errcode='22023'; end if;
 update private.mcp_tokens t set contract=seen
 where t.token_hash=token and t.revoked_at is null and t.contract is distinct from seen;
end $$;
revoke all on function public.mcp_contract_seen(text,text,text) from public,authenticated;
grant execute on function public.mcp_contract_seen(text,text,text) to anon;

create or replace function public.mcp_auth(server_secret text,token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens;
begin
 person:=private.mcp_person(server_secret,token);
 return jsonb_build_object('token_id',person.id,'can_write',person.can_write,'contract',person.contract);
end $$;

create or replace function public.mcp_token_list() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'hint',t.hint,'can_write',t.can_write,'created_at',t.created_at,
   'expires_at',case when t.client_id is null then t.expires_at else t.refresh_expires_at end,'last_used_at',t.last_used_at,'oauth',t.client_id is not null,
   'contract',t.contract) order by t.created_at desc),'[]'::jsonb)
 from private.mcp_tokens t where t.user_id=auth.uid() and t.revoked_at is null
   and (t.expires_at is null or t.expires_at>now() or t.refresh_expires_at>now());
$$;
