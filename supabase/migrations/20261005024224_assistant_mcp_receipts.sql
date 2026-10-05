-- Atomically save validated MCP changes, durable app confirmations and an idempotent receipt.
-- The server proof and the bearer hash resolve the person; the caller cannot choose an account.
create table private.mcp_receipts (
  token_id uuid not null references private.mcp_tokens(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  outcome jsonb not null check (jsonb_typeof(outcome) = 'object' and octet_length(outcome::text) <= 1500000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  primary key (token_id, request_id)
);
create index mcp_receipts_expiry_idx on private.mcp_receipts(expires_at);
alter table private.mcp_receipts enable row level security;
revoke all on private.mcp_receipts from public, anon, authenticated;

create function private.mcp_commit_workspace(person uuid, next_data jsonb, expected_revision integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare next_revision integer;
begin
 if expected_revision is null or expected_revision < 0 or next_data is null or jsonb_typeof(next_data) <> 'object'
    or (next_data->>'version') is distinct from '1'
    or jsonb_typeof(next_data->'subjects') is distinct from 'array' or jsonb_typeof(next_data->'notes') is distinct from 'array'
    or jsonb_typeof(next_data->'tasks') is distinct from 'array' or jsonb_typeof(next_data->'sessions') is distinct from 'array'
    or octet_length(next_data::text) > 2000000 then raise exception 'Invalid payload' using errcode='22023'; end if;
 if expected_revision = 0 then
   begin
     insert into public.personal_workspaces(owner_id,data,revision) values(person,next_data,1);
     return 1;
   exception when unique_violation then raise exception 'Workspace conflict' using errcode='PT409'; end;
 end if;
 update public.personal_workspaces set data=next_data, revision=revision+1, updated_at=now()
 where owner_id=person and revision=expected_revision returning revision into next_revision;
 if next_revision is null then raise exception 'Workspace conflict' using errcode='PT409'; end if;
 return next_revision;
end $$;

create function public.mcp_request_result(server_secret text,token text,request_id uuid,payload_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens; prior private.mcp_receipts;
begin
 person:=private.mcp_person(server_secret,token);
 if not person.can_write then raise exception 'Read-only token' using errcode='42501'; end if;
 select * into prior from private.mcp_receipts r where r.token_id=person.id and r.request_id=mcp_request_result.request_id and r.expires_at>now();
 if prior.token_id is null then return null; end if;
 if prior.payload_hash is distinct from mcp_request_result.payload_hash then raise exception 'Request identifier reused' using errcode='PT409'; end if;
 return prior.outcome;
end $$;

create function public.mcp_commit(server_secret text,token text,request_id uuid,payload_hash text,next_data jsonb,expected_revision integer,outcome jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens; prior private.mcp_receipts; conversation uuid; job uuid; saved jsonb; current_revision integer;
begin
 -- This update also serializes simultaneous commits with the same token.
 person:=private.mcp_person(server_secret,token);
 if not person.can_write then raise exception 'Read-only token' using errcode='42501'; end if;
 if request_id is null or payload_hash is null or payload_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(outcome) is distinct from 'object' or outcome->>'saved' is distinct from 'true'
    or jsonb_typeof(outcome->'pending') is distinct from 'array' or jsonb_array_length(outcome->'pending')>8
    or jsonb_typeof(outcome->'applied') is distinct from 'array' or jsonb_array_length(outcome->'applied')>8
    or jsonb_typeof(outcome->'failed') is distinct from 'array'
    or char_length(coalesce(outcome->>'reply',''))>3000 or octet_length(outcome::text)>1400000
    or expected_revision is null or expected_revision<0 then raise exception 'Invalid receipt' using errcode='22023'; end if;
 select * into prior from private.mcp_receipts r where r.token_id=person.id and r.request_id=mcp_commit.request_id;
 if prior.token_id is not null and prior.expires_at>now() then
   if prior.payload_hash is distinct from mcp_commit.payload_hash then raise exception 'Request identifier reused' using errcode='PT409'; end if;
   return prior.outcome;
 end if;
 if next_data is not null then perform private.mcp_commit_workspace(person.user_id,next_data,expected_revision);
 else
   select w.revision into current_revision from public.personal_workspaces w where w.owner_id=person.user_id for update;
   if coalesce(current_revision,0)<>expected_revision then raise exception 'Workspace conflict' using errcode='PT409'; end if;
 end if;
 if jsonb_array_length(outcome->'pending')>0 then
   conversation:=gen_random_uuid(); job:=gen_random_uuid();
   insert into public.assistant_conversations(user_id,id,title,messages)
   values(person.user_id,conversation,'Confirmação de assistente externo',jsonb_build_array(jsonb_build_object(
     'id','job:'||job,'from','assistant','text',outcome->>'reply','saved',true)));
   insert into public.assistant_jobs(user_id,id,conversation_id,request_key,input,status,result)
   values(person.user_id,job,conversation,'mcp:'||person.id||':'||request_id,
     jsonb_build_object('message','Pedido de '||person.label,'today',to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'history','[]'::jsonb),
     'needs_confirmation',outcome);
 end if;
 saved:=outcome||jsonb_build_object('conversation_id',conversation);
 insert into private.mcp_receipts(token_id,request_id,payload_hash,outcome) values(person.id,request_id,payload_hash,saved)
 on conflict on constraint mcp_receipts_pkey do update set payload_hash=excluded.payload_hash,outcome=excluded.outcome,created_at=now(),expires_at=now()+interval '90 days';
 -- Expired deduplication receipts contain no independent user history. Bound maintenance per call.
 delete from private.mcp_receipts expired where (expired.token_id,expired.request_id) in
   (select r.token_id,r.request_id from private.mcp_receipts r where r.expires_at<now() order by r.expires_at limit 100);
 return saved;
end $$;
revoke all on function private.mcp_commit_workspace(uuid,jsonb,integer),public.mcp_request_result(text,text,uuid,text),public.mcp_commit(text,text,uuid,text,jsonb,integer,jsonb) from public,authenticated;
grant execute on function public.mcp_request_result(text,text,uuid,text),public.mcp_commit(text,text,uuid,text,jsonb,integer,jsonb) to anon;
