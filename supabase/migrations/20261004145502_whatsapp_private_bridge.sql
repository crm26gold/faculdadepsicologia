-- A replaceable WhatsApp relay. Only Jornada owns accounts, commands and history.
create table private.whatsapp_bridge (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  generation uuid not null default gen_random_uuid(),
  token_hash text not null default '', server_hash text not null default '',
  state text not null default 'offline' check(state in ('offline','qr','connecting','ready')),
  relay text not null default '' check(relay ~ '^[0-9]{0,15}$'),
  qr text, qr_until timestamptz, heartbeat timestamptz,
  stt_connection text not null default 'gemini:primary',
  stt_model text not null default 'auto:rapido' check(char_length(stt_model) between 1 and 160),
  voice text not null default 'pt-BR-AntonioNeural' check(voice in ('pt-BR-AntonioNeural','pt-BR-FranciscaNeural')),
  link_minute timestamptz, link_attempts integer not null default 0
);
insert into private.whatsapp_bridge(singleton) values(true);
create table private.whatsapp_jobs (
  id uuid primary key default gen_random_uuid(), generation uuid not null,
  message_id text not null check(char_length(message_id) between 1 and 180),
  peer text not null check(peer ~ '^[0-9]{10,15}$'), user_id uuid not null references public.accounts(user_id),
  input_ciphertext text, input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'queued' check(status in ('queued','working','done','failed')),
  lease uuid, lease_until timestamptz, attempts integer not null default 0,
  result jsonb, delivered boolean not null default false, created_at timestamptz not null default clock_timestamp(),
  unique(generation,message_id)
);
create index whatsapp_jobs_queue on private.whatsapp_jobs(user_id,created_at) where status in ('queued','working');
create table private.whatsapp_pending (
  user_id uuid primary key references public.accounts(user_id), peer text not null, generation uuid not null,
  confirmation text not null, actions jsonb not null, expires timestamptz not null
);
alter table private.whatsapp_bridge enable row level security;
alter table private.whatsapp_jobs enable row level security;
alter table private.whatsapp_pending enable row level security;
revoke all on private.whatsapp_bridge,private.whatsapp_jobs,private.whatsapp_pending from public,anon,authenticated;

create function public.whatsapp_admin(operation text default 'state',payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg private.whatsapp_bridge; result jsonb;
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into strict cfg from private.whatsapp_bridge where singleton for update;
  if operation='rotate' then
    if payload->>'token_hash' !~ '^[a-f0-9]{64}$' or payload->>'server_hash' !~ '^[a-f0-9]{64}$'
      or payload->>'token_hash' is null or payload->>'server_hash' is null then
      raise exception 'Invalid hash' using errcode='22023'; end if;
    update private.whatsapp_bridge set generation=gen_random_uuid(),token_hash=payload->>'token_hash',
      server_hash=payload->>'server_hash',enabled=true,state='offline',qr=null,qr_until=null,relay='',heartbeat=null where singleton;
    delete from public.messenger_links where channel='whatsapp';
    delete from public.messenger_link_codes where channel='whatsapp';
    delete from private.whatsapp_pending;
    update private.whatsapp_jobs set status='failed',input_ciphertext=null,lease=null,lease_until=null,
      result='{"reply":"Conexão substituída. O pedido não será retomado."}' where status in ('queued','working');
    perform private.audit('whatsapp_rotated',null,null,'{}');
  elsif operation='save' then
    if payload->>'stt_connection' !~ '^(gemini|vertex|google_cloud):primary$|^[a-f0-9-]{36}$'
      or payload->>'stt_connection' is null then raise exception 'Invalid connection' using errcode='22023'; end if;
    update private.whatsapp_bridge set enabled=(payload->>'enabled')::boolean,
      stt_connection=payload->>'stt_connection',stt_model=payload->>'stt_model',voice=payload->>'voice' where singleton;
  elsif operation='unlink' then
    delete from public.messenger_links where channel='whatsapp' and user_id=auth.uid();
    delete from public.messenger_link_codes where channel='whatsapp' and user_id=auth.uid();
    delete from private.whatsapp_pending where user_id=auth.uid();
    update private.whatsapp_jobs set status='failed',input_ciphertext=null,lease=null,lease_until=null,
      result='{"reply":"Telefone desvinculado. O pedido não será retomado."}'
      where user_id=auth.uid() and status in ('queued','working');
  elsif operation='code' then
    if not cfg.enabled or cfg.token_hash='' or cfg.state<>'ready' or cfg.heartbeat<now()-interval '90 seconds'
      or cfg.heartbeat is null then raise exception 'Bridge offline' using errcode='PT409'; end if;
    if payload->>'code_hash' !~ '^[a-f0-9]{64}$' or payload->>'code_hash' is null then raise exception 'Invalid hash' using errcode='22023'; end if;
    delete from public.messenger_link_codes where channel='whatsapp' and user_id=auth.uid();
    insert into public.messenger_link_codes(code_hash,user_id,channel,expires_at)
      values(payload->>'code_hash',auth.uid(),'whatsapp',now()+interval '15 minutes');
  elsif operation<>'state' then raise exception 'Invalid operation' using errcode='22023'; end if;
  select jsonb_build_object('enabled',enabled,'configured',token_hash<>'','state',
      case when heartbeat is null or heartbeat<now()-interval '90 seconds' then 'offline' else state end,
    'relay',relay,'heartbeat',heartbeat,'qr',case when qr_until>now() and state='qr' then qr end,
    'stt_connection',stt_connection,'stt_model',stt_model,'voice',voice,
    'linked',exists(select 1 from public.messenger_links where channel='whatsapp' and user_id=auth.uid()),
    'peer',(select chat_id from public.messenger_links where channel='whatsapp' and user_id=auth.uid()),
    'queued',(select count(*) from private.whatsapp_jobs where status in ('queued','working')),
    'connections',coalesce((select jsonb_agg(c) from (
      select p.id||':primary' as id,p.label as label,p.enabled and p.key_ciphertext<>'' as enabled from public.ai_providers p where p.id in ('gemini','vertex','google_cloud')
      union all select c.id::text,p.label||' · '||c.label,c.enabled and p.enabled from private.ai_connections c
        join public.ai_providers p on p.id=c.provider where p.id in ('gemini','vertex','google_cloud')
    )c),'[]')) into result from private.whatsapp_bridge where singleton;
  return result;
end $$;
revoke all on function public.whatsapp_admin(text,jsonb) from public,anon;
grant execute on function public.whatsapp_admin(text,jsonb) to authenticated;

-- Both proofs are required. A stolen transport token cannot call SQL for AI credentials.
create function public.whatsapp_server(server_secret text,bridge_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg private.whatsapp_bridge; actor uuid; job private.whatsapp_jobs; info jsonb; stt jsonb; seq text;
begin
  select * into strict cfg from private.whatsapp_bridge where singleton for update;
  if not cfg.enabled or char_length(coalesce(server_secret,''))<32 or char_length(coalesce(bridge_token,''))<32
    or encode(extensions.digest(server_secret,'sha256'),'hex')<>cfg.server_hash
    or encode(extensions.digest(bridge_token,'sha256'),'hex')<>cfg.token_hash then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if operation='verify' then return '{}'::jsonb; end if;
  if operation='heartbeat' then
    if payload->>'state' not in ('offline','qr','connecting','ready') or payload->>'state' is null
      or coalesce(payload->>'relay','') !~ '^[0-9]{0,15}$'
      or (payload->>'qr' is not null and (char_length(payload->>'qr')>70000 or payload->>'qr' !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$')) then
      raise exception 'Invalid status' using errcode='22023'; end if;
    if cfg.relay<>'' and coalesce(payload->>'relay','')<>'' and cfg.relay<>payload->>'relay' then
      delete from public.messenger_links where channel='whatsapp';
      delete from public.messenger_link_codes where channel='whatsapp';
      delete from private.whatsapp_pending;
      update private.whatsapp_jobs set status='failed',input_ciphertext=null,lease=null,
        result='{"reply":"Número da ponte alterado. Vincule seu telefone novamente."}' where status in ('queued','working');
    end if;
    update private.whatsapp_bridge set state=payload->>'state',heartbeat=now(),
      relay=case when coalesce(payload->>'relay','')='' then relay else payload->>'relay' end,
      qr=payload->>'qr',qr_until=case when payload->>'qr' is not null then now()+interval '55 seconds' end where singleton;
    return jsonb_build_object('voice',cfg.voice);
  end if;
  if payload->>'peer' !~ '^[0-9]{10,15}$' or payload->>'peer' is null or payload->>'peer'=cfg.relay then
    raise exception 'Invalid peer' using errcode='42501'; end if;
  if operation='link' then
    -- No AI, files or writes to the workspace during linking; throttle brute-force attempts.
    update private.whatsapp_bridge set link_minute=date_trunc('minute',now()),
      link_attempts=case when link_minute=date_trunc('minute',now()) then link_attempts+1 else 1 end where singleton returning * into cfg;
    if cfg.link_attempts>10 then return jsonb_build_object('linked',false); end if;
    delete from public.messenger_link_codes where channel='whatsapp' and code_hash=payload->>'code_hash' and expires_at>now()
      returning user_id into actor;
    if actor is null or not exists(select 1 from public.app_owner where user_id=actor) then return jsonb_build_object('linked',false); end if;
    delete from public.messenger_links where channel='whatsapp' and user_id=actor;
    update private.whatsapp_jobs set status='failed',input_ciphertext=null,lease=null,lease_until=null,
      result='{"reply":"Telefone substituído. O pedido antigo não será retomado."}' where user_id=actor and status in ('queued','working');
    insert into public.messenger_links(channel,chat_id,user_id) values('whatsapp',payload->>'peer',actor)
      on conflict(channel,chat_id) do update set user_id=excluded.user_id,linked_at=now();
    delete from private.whatsapp_pending where user_id=actor;
    return jsonb_build_object('linked',true);
  end if;
  select l.user_id into actor from public.messenger_links l join public.app_owner o on o.user_id=l.user_id
    where l.channel='whatsapp' and l.chat_id=payload->>'peer';
  if actor is null then raise exception 'Not linked' using errcode='42501'; end if;
  if operation='check' then return jsonb_build_object('authorized',true); end if;
  if operation='enqueue' then
    if char_length(coalesce(payload->>'input_ciphertext','')) not between 1 and 4000000
      or char_length(coalesce(payload->>'message_id','')) not between 1 and 180 or payload->>'input_hash' !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid input' using errcode='22023'; end if;
    select * into job from private.whatsapp_jobs where generation=cfg.generation and message_id=payload->>'message_id';
    if found then
      if job.user_id<>actor or job.peer<>payload->>'peer' or job.input_hash<>payload->>'input_hash' then raise exception 'Message changed' using errcode='PT409'; end if;
      return jsonb_build_object('id',job.id,'status',job.status);
    end if;
    if (select count(*) from private.whatsapp_jobs where user_id=actor and status in ('queued','working'))>=20 then raise exception 'Queue full' using errcode='PT409'; end if;
    if coalesce((payload->>'media_units')::integer,0)>0 then
      info:=private.reserve_jornada_budget(actor,'upload',1);
      if not (info->>'allowed')::boolean then raise exception 'Upload budget exceeded' using errcode='PT429'; end if;
      info:=private.reserve_jornada_budget(actor,'media',(payload->>'media_units')::integer);
      if not (info->>'allowed')::boolean then raise exception 'Media budget exceeded' using errcode='PT429'; end if;
    end if;
    insert into private.whatsapp_jobs(generation,message_id,peer,user_id,input_ciphertext,input_hash)
      values(cfg.generation,payload->>'message_id',payload->>'peer',actor,payload->>'input_ciphertext',payload->>'input_hash') returning * into job;
    -- Keep replay receipts for 31 days; raw media is cleared when a job settles.
    delete from private.whatsapp_jobs where created_at<now()-interval '31 days' and status in ('done','failed');
    return jsonb_build_object('id',job.id,'status',job.status);
  end if;
  select * into job from private.whatsapp_jobs where id=(payload->>'id')::uuid and user_id=actor
    and peer=payload->>'peer' and generation=cfg.generation for update;
  if not found then raise exception 'Not found' using errcode='P0002'; end if;
  if operation='result' then return jsonb_build_object('id',job.id,'status',job.status,'result',job.result,'delivered',job.delivered,'voice',cfg.voice); end if;
  if operation='ack' then
    if job.status not in ('done','failed') then raise exception 'Not settled' using errcode='PT409'; end if;
    update private.whatsapp_jobs set delivered=true where id=job.id; return '{}'::jsonb;
  end if;
  if operation='claim' then
    if job.status in ('done','failed') or (job.status='working' and job.lease_until>now()) then return null; end if;
    if job.attempts>=3 or job.created_at<now()-interval '1 day' then
      update private.whatsapp_jobs set status='failed',input_ciphertext=null,result='{"reply":"O pedido expirou. Envie novamente se ainda deseja executá-lo."}' where id=job.id; return null;
    end if;
    if exists(select 1 from private.whatsapp_jobs j where j.user_id=actor and j.status in ('queued','working') and (j.created_at,j.id)<(job.created_at,job.id)) then return null; end if;
    update private.whatsapp_jobs set status='working',lease=(payload->>'lease')::uuid,lease_until=now()+interval '150 seconds',attempts=attempts+1 where id=job.id;
  elsif operation='finish' then
    if job.status in ('done','failed') then return job.result; end if;
    if job.status<>'working' or job.lease is distinct from (payload->>'lease')::uuid or job.lease_until<now() then raise exception 'Lease changed' using errcode='PT409'; end if;
    if jsonb_typeof(payload->'result') is distinct from 'object' or char_length(coalesce(payload->'result'->>'reply','')) not between 1 and 4000 then raise exception 'Invalid result' using errcode='22023'; end if;
    if payload->'next_data' is not null and payload->'next_data'<>'null'::jsonb then
      info:=payload->'next_data';
      if (info->>'version') is distinct from '1' or jsonb_typeof(info->'subjects') is distinct from 'array'
        or jsonb_typeof(info->'notes') is distinct from 'array' or jsonb_typeof(info->'tasks') is distinct from 'array'
        or jsonb_typeof(info->'sessions') is distinct from 'array' or octet_length(info::text)>2000000 then raise exception 'Invalid workspace' using errcode='22023'; end if;
      update public.personal_workspaces set data=info,revision=revision+1,updated_at=now()
        where owner_id=actor and revision=(payload->>'revision')::integer;
      if not found then
        if (payload->>'revision')::integer<>0 then raise exception 'Workspace changed' using errcode='PT409'; end if;
        begin insert into public.personal_workspaces(owner_id,data,revision) values(actor,info,1);
        exception when unique_violation then raise exception 'Workspace changed' using errcode='PT409'; end;
      end if;
    end if;
    if payload->>'pending_mode'='clear' then delete from private.whatsapp_pending where user_id=actor;
    elsif payload->>'pending_mode'='replace' then
      insert into private.whatsapp_pending(user_id,peer,generation,confirmation,actions,expires)
        values(actor,job.peer,cfg.generation,payload->>'confirmation',payload->'pending',now()+interval '15 minutes')
        on conflict(user_id) do update set peer=excluded.peer,generation=excluded.generation,confirmation=excluded.confirmation,actions=excluded.actions,expires=excluded.expires;
    end if;
    seq:='wa:'||job.id::text;
    insert into public.messenger_messages(user_id,channel,update_id,role,body,applied)
      values(actor,'whatsapp',seq,'user',left(coalesce(payload->>'transcript',''),4000),'[]'),
        (actor,'whatsapp',seq||':reply','assistant',payload->'result'->>'reply',coalesce(payload->'result'->'applied','[]'));
    delete from public.messenger_messages where user_id=actor and channel='whatsapp' and id not in
      (select id from public.messenger_messages where user_id=actor and channel='whatsapp' order by id desc limit 60);
    update private.whatsapp_jobs set status=case when payload->>'failed'='true' then 'failed' else 'done' end,
      result=payload->'result',input_ciphertext=null,lease=null,lease_until=null where id=job.id;
    return payload->'result';
  elsif operation='budget' then return private.reserve_jornada_budget(actor,'ai',1);
  elsif operation<>'context' then raise exception 'Invalid operation' using errcode='22023'; end if;
  -- Internal context cannot be reached using the transport credential alone.
  select jsonb_build_object('provider',p.id,'model',cfg.stt_model,'base_url',p.base_url,'gcp_project',p.gcp_project,
      'gcp_location',p.gcp_location,'key_ciphertext',case when cfg.stt_connection=p.id||':primary' then p.key_ciphertext else c.key_ciphertext end)
    into stt from public.ai_providers p left join private.ai_connections c on c.provider=p.id and c.id::text=cfg.stt_connection and c.enabled
    where p.id in ('gemini','vertex','google_cloud') and p.enabled and ((cfg.stt_connection=p.id||':primary' and p.key_ciphertext<>'') or c.id is not null);
  return jsonb_build_object('input_ciphertext',job.input_ciphertext,'ai',private.ai_task_config('assistente'),'stt',stt,
    'workspace',(select jsonb_build_object('data',data,'revision',revision) from public.personal_workspaces where owner_id=actor),
    'history',coalesce((select jsonb_agg(jsonb_build_object('role',h.role,'text',h.body) order by h.id) from
      (select id,role,body from public.messenger_messages where user_id=actor and channel='whatsapp' order by id desc limit 12)h),'[]'),
    'pending',(select jsonb_build_object('confirmation',confirmation,'actions',actions) from private.whatsapp_pending
      where user_id=actor and peer=job.peer and generation=cfg.generation and expires>now()));
end $$;
revoke all on function public.whatsapp_server(text,text,text,jsonb) from public,authenticated;
grant execute on function public.whatsapp_server(text,text,text,jsonb) to anon;
