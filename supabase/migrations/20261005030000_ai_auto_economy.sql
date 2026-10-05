-- Automático com economia primeiro: cotas gratuitas e opções baratas antes das pagas.
-- Groq e os modelos gratuitos do OpenRouter passam a escolher o modelo sozinhos. Até oito tentativas.
create or replace function private.ai_auto_model(task_id text,provider_id text,task_model text) returns text
language sql immutable set search_path='' as $$
 select case
   when task_id='voz' then case provider_id when 'elevenlabs' then 'auto:rapido' when 'gemini' then 'auto:rapido' when 'openai' then 'gpt-live-1' end
   when provider_id in('gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic') then case when task_model like 'auto:%' then task_model else 'auto:rapido' end
 end;
$$;
create or replace function private.ai_auto_rank(task_id text,provider_id text) returns integer
language sql immutable set search_path='' as $$
 select coalesce(array_position(case when task_id='voz' then array['elevenlabs','gemini','openai']
   else array['gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic'] end,provider_id),99);
$$;
revoke all on function private.ai_auto_model(text,text,text),private.ai_auto_rank(text,text) from public,anon,authenticated;

create or replace function private.ai_task_config(task_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.ai_tasks; primary_config jsonb; candidates jsonb := '[]'; item jsonb; candidate jsonb; auto_model text;
begin
 select * into t from public.ai_tasks where id=task_id and enabled and model<>'';
 if not found then return null; end if;
 primary_config:=private.ai_effective_connection(t.connection_id,t.provider);
 if primary_config is not null then candidates:=jsonb_build_array(primary_config||jsonb_build_object('model',t.model)); end if;
 if t.routing_mode='legacy' and primary_config is not null then
   for item in select to_jsonb(c) from private.ai_connections c where c.provider=t.provider and c.enabled order by c.position limit 2 loop
     candidate:=private.ai_effective_connection((item->>'id')::uuid,t.provider);
     candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',t.model));
   end loop;
 elsif t.routing_mode='fallback' then
   for item in select value from jsonb_array_elements(t.fallbacks) loop
     candidate:=private.ai_effective_connection((item->>'connection_id')::uuid,null);
     if candidate is not null then candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',item->>'model')); end if;
   end loop;
 elsif t.routing_mode='auto' then
   -- Chave principal antes das reservas; a conexão escolhida não se repete. No máximo oito tentativas.
   for item in
     select jsonb_build_object('provider',x.provider,'connection_id',x.connection_id) from (
       select p.id provider,null::uuid connection_id,0 pos from public.ai_providers p where p.enabled and p.key_ciphertext<>''
       union all select c.provider,c.id,c.position from private.ai_connections c where c.enabled
     ) x
     where private.ai_auto_model(task_id,x.provider,t.model) is not null
       and not (x.connection_id is not distinct from t.connection_id and x.provider=t.provider)
     order by private.ai_auto_rank(task_id,x.provider),x.pos
   loop
     exit when jsonb_array_length(candidates)>=8;
     candidate:=private.ai_effective_connection((item->>'connection_id')::uuid,item->>'provider');
     auto_model:=private.ai_auto_model(task_id,item->>'provider',t.model);
     if candidate is not null then candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',auto_model)); end if;
   end loop;
 end if;
 if jsonb_array_length(candidates)=0 then return null; end if;
 return (candidates->0)||jsonb_build_object('alternatives',candidates-0,'routing',t.routing_mode);
end;
$$;
