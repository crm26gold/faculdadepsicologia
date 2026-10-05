-- Native xAI voice support and economical ordering of all automatic text candidates.
-- Existing tasks and credentials are not changed; the owner's fixed ElevenLabs route stays fixed.
create or replace function private.ai_live_model_allowed(provider_id text,model text) returns boolean
language sql immutable set search_path='' as $$
 select case provider_id
   when 'openai' then model='gpt-live-1'
   when 'gemini' then model='auto:rapido' or model ~ '^gemini-[a-z0-9.-]*live[a-z0-9.-]*$'
   when 'xai' then model in('auto:rapido','grok-voice-latest','grok-voice-think-fast-2.0')
   when 'elevenlabs' then model='auto:rapido' or (model ~ '^[a-z0-9][a-z0-9.@_-]{1,79}$' and model<>'custom-llm')
   else false end;
$$;
create or replace function private.ai_auto_model(task_id text,provider_id text,task_model text) returns text
language sql immutable set search_path='' as $$
 select case
   when task_id='voz' then case provider_id when 'elevenlabs' then 'auto:rapido' when 'gemini' then 'auto:rapido' when 'xai' then 'grok-voice-latest' when 'openai' then 'gpt-live-1' end
   when provider_id in('gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic') then case when task_model like 'auto:%' then task_model else 'auto:rapido' end
 end;
$$;
create or replace function private.ai_auto_rank(task_id text,provider_id text) returns integer
language sql immutable set search_path='' as $$
 select coalesce(array_position(case when task_id='voz' then array['elevenlabs','gemini','xai','openai']
   else array['gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic'] end,provider_id),99);
$$;

-- Gemini's unpaid API terms prohibit sending personal/confidential information. Every
-- selection requires the owner's explicit paid-API declaration for this exact encrypted key.
-- Replacing a key invalidates the declaration; this migration does not grant any approval.
create function private.ai_automatic_source_allowed(provider_id text,connection_id uuid,ciphertext text) returns boolean
language sql stable security definer set search_path='' as $$
 select provider_id<>'gemini' or exists(select 1 from private.ai_member_base_sources a
   where a.source_id=case when connection_id is null then 'provider:'||provider_id else 'connection:'||connection_id::text end
   and a.provider=provider_id and a.connection_id is not distinct from connection_id and a.privacy_basis='paid'
   and a.cipher_hash=encode(extensions.digest(ciphertext,'sha256'),'hex'));
$$;
revoke all on function private.ai_automatic_source_allowed(text,uuid,text),private.ai_live_model_allowed(text,text),private.ai_auto_model(text,text,text),private.ai_auto_rank(text,text) from public,anon,authenticated;

create or replace function private.ai_task_config(task_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.ai_tasks; primary_config jsonb; candidates jsonb:='[]'; item jsonb; candidate jsonb;
begin
 select * into t from public.ai_tasks where id=task_id and enabled and model<>'';
 if not found then return null; end if;
 primary_config:=private.ai_effective_connection(t.connection_id,t.provider);
 if primary_config is not null and not private.ai_automatic_source_allowed(t.provider,t.connection_id,primary_config->>'key_ciphertext') then
  primary_config:=null;
 end if;
 if primary_config is not null then
  primary_config:=primary_config||jsonb_build_object('model',t.model,'source_id',case when t.connection_id is null then 'provider:'||t.provider else 'connection:'||t.connection_id::text end);
  -- Fixed/legacy/manual fallback retain explicit ordering. Voice starts with the chosen
  -- transport; automatic text includes its chosen connection in the common ordered pool.
  if t.routing_mode<>'auto' or (task_id='voz' and private.ai_automatic_source_allowed(t.provider,t.connection_id,primary_config->>'key_ciphertext')) then
   candidates:=jsonb_build_array(primary_config);
  end if;
 end if;
 if t.routing_mode='legacy' and primary_config is not null then
  for item in select to_jsonb(c) from private.ai_connections c where c.provider=t.provider and c.enabled order by c.position limit 2 loop
   candidate:=private.ai_effective_connection((item->>'id')::uuid,t.provider);
   if candidate is not null and private.ai_automatic_source_allowed(t.provider,(item->>'id')::uuid,candidate->>'key_ciphertext') then candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',t.model,'source_id','connection:'||(item->>'id'))); end if;
  end loop;
 elsif t.routing_mode='fallback' then
  for item in select value from jsonb_array_elements(t.fallbacks) loop
   candidate:=private.ai_effective_connection((item->>'connection_id')::uuid,null);
   if candidate is not null and private.ai_automatic_source_allowed(candidate->>'provider',(item->>'connection_id')::uuid,candidate->>'key_ciphertext') then candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',item->>'model','source_id','connection:'||((item->>'connection_id')::uuid)::text)); end if;
  end loop;
 elsif t.routing_mode='auto' then
  for item in
   select to_jsonb(x) from (
    select distinct on(all_sources.provider,all_sources.connection_id) all_sources.* from (
     select t.provider provider,t.connection_id connection_id,-1 pos,t.model model,true chosen,primary_config->>'key_ciphertext' ciphertext where primary_config is not null
     union all
     select p.id,null::uuid,0,private.ai_auto_model(task_id,p.id,t.model),false,p.key_ciphertext from public.ai_providers p where p.enabled and p.key_ciphertext<>''
     union all
     select c.provider,c.id,c.position,private.ai_auto_model(task_id,c.provider,t.model),false,c.key_ciphertext from private.ai_connections c where c.enabled
    )all_sources
    where all_sources.model is not null and private.ai_automatic_source_allowed(all_sources.provider,all_sources.connection_id,all_sources.ciphertext)
    order by all_sources.provider,all_sources.connection_id,all_sources.chosen desc
   )x
   where task_id<>'voz' or not x.chosen
   order by private.ai_auto_rank(task_id,x.provider),x.pos,x.connection_id nulls first
  loop
   exit when jsonb_array_length(candidates)>=8;
   candidate:=private.ai_effective_connection((item->>'connection_id')::uuid,item->>'provider');
   if candidate is not null then candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',item->>'model',
    'source_id',case when item->>'connection_id' is null then 'provider:'||(item->>'provider') else 'connection:'||(item->>'connection_id') end)); end if;
  end loop;
 end if;
 if jsonb_array_length(candidates)=0 then return null; end if;
 return(candidates->0)||jsonb_build_object('alternatives',candidates-0,'routing',t.routing_mode);
end;
$$;
