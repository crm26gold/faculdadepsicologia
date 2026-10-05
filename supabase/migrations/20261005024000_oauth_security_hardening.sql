-- Keep used refresh hashes tied to their authorization family. Never store raw credentials.
-- A replay revokes the current access and refresh credentials, and returns a status (not an
-- exception): raising after UPDATE would roll the revocation back in the RPC transaction.
create table private.oauth_refresh_history (
  refresh_hash text primary key check(refresh_hash ~ '^[a-f0-9]{64}$'),
  token_id uuid not null references private.mcp_tokens(id) on delete cascade,
  used_at timestamptz not null default now()
);
create index oauth_refresh_history_token_id_idx on private.oauth_refresh_history(token_id);
alter table private.oauth_refresh_history enable row level security;
revoke all on private.oauth_refresh_history from public,anon,authenticated;

create or replace function public.mcp_oauth_refresh(server_secret text,refresh text,wanted text,next_access text,next_refresh text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved private.mcp_tokens;
begin
 perform private.bot_check(server_secret);
 if refresh is null or refresh !~ '^[a-f0-9]{64}$' or next_access is null or next_access !~ '^[a-f0-9]{64}$'
   or next_refresh is null or next_refresh !~ '^[a-f0-9]{64}$' or refresh=next_refresh then
   return jsonb_build_object('error','invalid_grant');
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jornada.oauth.refresh.v1:'||refresh,0));
 -- Lock the family for both a current token and a used predecessor. Concurrent refreshes
 -- serialize on the same row; the second use becomes a replay instead of another rotation.
 select t.* into saved from private.mcp_tokens t where t.client_id=wanted and
   (t.refresh_hash=refresh or exists(select 1 from private.oauth_refresh_history h where h.token_id=t.id and h.refresh_hash=refresh))
 for update of t;
 if saved.id is null then return jsonb_build_object('error','invalid_grant'); end if;
 if exists(select 1 from private.oauth_refresh_history h where h.token_id=saved.id and h.refresh_hash=refresh) then
   update private.mcp_tokens set revoked_at=coalesce(revoked_at,now()) where id=saved.id;
   return jsonb_build_object('error','invalid_grant');
 end if;
 if saved.revoked_at is not null or saved.refresh_expires_at<=now() or saved.refresh_expires_at is null then
   return jsonb_build_object('error','invalid_grant');
 end if;
 insert into private.oauth_refresh_history(refresh_hash,token_id) values(refresh,saved.id);
 update private.mcp_tokens set token_hash=next_access,refresh_hash=next_refresh,expires_at=now()+interval '1 hour',refresh_expires_at=now()+interval '90 days'
 where id=saved.id;
 return jsonb_build_object('can_write',saved.can_write);
end $$;

-- Limit public dynamic registration both globally and by an HMAC of the trusted platform
-- origin. A single source cannot consume the global hourly allowance. Its raw IP is not kept.
create table private.oauth_registration_origins (
  client_id text primary key references private.oauth_clients(client_id) on delete cascade,
  origin_hash text not null check(origin_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index oauth_registration_origins_window_idx on private.oauth_registration_origins(origin_hash,created_at);
create index oauth_clients_created_at_idx on private.oauth_clients(created_at);
create index oauth_codes_expiry_idx on private.oauth_codes(expires_at);
alter table private.oauth_registration_origins enable row level security;
revoke all on private.oauth_registration_origins from public,anon,authenticated;

create function public.mcp_oauth_register_limited(server_secret text,next_client text,next_name text,next_uris text[],origin_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.bot_check(server_secret);
 if origin_hash is not null and origin_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid origin' using errcode='22023'; end if;
 if next_uris is null or cardinality(next_uris) not between 1 and 5 or exists(select 1 from unnest(next_uris) u where u is null or char_length(u)>500) then
   raise exception 'Invalid redirect' using errcode='22023'; end if;
 -- The check and insert share one lock; concurrent registrations cannot overrun either limit.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jornada.oauth.registration.v1',0));
 if (select count(*) from private.oauth_clients where created_at>now()-interval '1 hour')>=50 then raise exception 'Rate limited' using errcode='PT429'; end if;
 if origin_hash is not null and (select count(*) from private.oauth_registration_origins o where o.origin_hash=mcp_oauth_register_limited.origin_hash and o.created_at>now()-interval '1 hour')>=10 then
   raise exception 'Rate limited' using errcode='PT429'; end if;
 -- Bounded housekeeping only touches unusable grants and unreferenced, old registrations.
 delete from private.oauth_codes where code_hash in (select code_hash from private.oauth_codes where expires_at<now()-interval '1 day' order by expires_at limit 200);
 delete from private.oauth_refresh_history where refresh_hash in (
   select h.refresh_hash from private.oauth_refresh_history h join private.mcp_tokens t on t.id=h.token_id
   where (t.revoked_at<now()-interval '7 days' or t.refresh_expires_at<now()-interval '7 days') order by h.used_at limit 200
 );
 delete from private.oauth_registration_origins where client_id in (select client_id from private.oauth_registration_origins where created_at<now()-interval '1 day' order by created_at limit 200);
 delete from private.oauth_clients c where c.client_id in (
   select old.client_id from private.oauth_clients old where old.created_at<now()-interval '30 days'
   and not exists(select 1 from private.oauth_codes o where o.client_id=old.client_id)
   and not exists(select 1 from private.mcp_tokens t where t.client_id=old.client_id)
   order by old.created_at limit 200
 );
 insert into private.oauth_clients(client_id,client_name,redirect_uris) values(next_client,next_name,next_uris);
 if origin_hash is not null then insert into private.oauth_registration_origins(client_id,origin_hash) values(next_client,origin_hash); end if;
end $$;

-- Preserve the old server-only signature for older deployments and SQL callers. Its global
-- budget is serialized too; the public HTTP endpoint uses the origin-aware function above.
create or replace function public.mcp_oauth_register(server_secret text,next_client text,next_name text,next_uris text[]) returns void
language sql security definer set search_path='' as $$
 select public.mcp_oauth_register_limited(server_secret,next_client,next_name,next_uris,null);
$$;
revoke all on function public.mcp_oauth_register_limited(text,text,text,text[],text) from public,authenticated;
grant execute on function public.mcp_oauth_register_limited(text,text,text,text[],text) to anon;
