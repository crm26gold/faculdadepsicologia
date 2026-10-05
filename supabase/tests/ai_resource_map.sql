-- Standalone local-only suite: the resource map explains exactly what the router uses, never
-- returns credentials or member details, and per-source audience separates owner use from sharing.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','one@example.invalid');
-- Helpers read the map saved by refresh_map(), always computed by the current session role.
create function public.refresh_map() returns void language sql as $$ select set_config('test.map',public.ai_resource_map()::text,false) $$;
create function public.map_route(task text) returns jsonb language sql stable as $$
 select r from jsonb_array_elements(current_setting('test.map')::jsonb->'routes') r where r->>'task'=task $$;
create function public.map_state(task text,sid text) returns jsonb language sql stable as $$
 select s from jsonb_array_elements(public.map_route(task)->'sources') s where s->>'source_id'=sid $$;
create function public.map_ids(list jsonb) returns text language sql immutable as $$
 select coalesce(string_agg(case when jsonb_typeof(x.e)='string' then x.e#>>'{}' else x.e->>'source_id' end,',' order by x.ord),'')
 from jsonb_array_elements(coalesce(list,'[]'::jsonb)) with ordinality x(e,ord) $$;
create function public.runtime_ids(runtime jsonb) returns text language sql immutable as $$
 select coalesce(string_agg(coalesce(x.e->>'source_id','personal:'||(x.e->>'provider')),',' order by x.ord),'')
 from jsonb_array_elements(case when runtime is null then '[]'::jsonb else jsonb_build_array(runtime-'alternatives'-'routing')||coalesce(runtime->'alternatives','[]'::jsonb) end)
 with ordinality x(e,ord) $$;
-- The map must equal the router for every task: configured routes and the owner's real runtime.
create function public.expect_router_match(label text) returns void language plpgsql as $$
declare task text;
begin
 foreach task in array array['assistente','organizar','voz'] loop
  perform public.expect(public.map_ids(public.map_route(task)->'configured_chain')=public.runtime_ids(public.ai_runtime(task)),label||': configured chain equals router for '||task);
  perform public.expect(public.map_ids(public.map_route(task)->'chain')=public.runtime_ids(public.ai_runtime_for_current('synthetic-server-proof-over-thirty-two-characters',task)),label||': owner chain equals runtime for '||task);
  perform public.expect(public.map_route(task)->>'routing_effective' is not distinct from public.ai_runtime_for_current('synthetic-server-proof-over-thirty-two-characters',task)->>'routing',label||': effective routing mode for '||task);
 end loop;
 perform public.expect(current_setting('test.map') not like '%v1.%' and current_setting('test.map') not like '%key_ciphertext%' and current_setting('test.map') not like '%cipher_hash%',label||': map never carries credentials');
 perform public.expect(current_setting('test.map') not like '%00000000-0000-4000-8000-000000000001%',label||': map never names a member account');
end $$;
grant execute on function public.expect(boolean,text),public.act_as(text),public.refresh_map(),public.map_route(text),public.map_state(text,text),
 public.map_ids(jsonb),public.runtime_ids(jsonb),public.expect_router_match(text) to authenticated,anon;

set role authenticated;
select act_as('00000000-0000-4000-8000-00000000000a');
select configure_jornada_budget_guard(encode(extensions.digest('synthetic-server-proof-over-thirty-two-characters','sha256'),'hex'));
-- The production shape audited on 05/10: DeepSeek primary with an undeclared Gemini reserve.
select ai_save_provider('deepseek',true,'','','','','v1.owner-deepseek','dsk1');
select ai_save_provider('gemini',true,'','','','','v1.owner-gemini','gem1');
select ai_save_provider('groq',true,'','','','','v1.owner-groq','grq1');
select ai_save_provider('elevenlabs',true,'','','','','v1.owner-voice','voic');
select set_config('test.extra',ai_save_connection_details(null,'gemini','Reserva Gemini',true,1,'v1.extra-gemini','ext1','','','')::text,false);
select ai_save_route('assistente','deepseek',null,'auto:rapido',true,'fallback',jsonb_build_array(jsonb_build_object('connection_id',current_setting('test.extra'),'model','auto:rapido')));
select ai_save_route('organizar','deepseek',null,'auto:rapido',true,'fallback',jsonb_build_array(jsonb_build_object('connection_id',current_setting('test.extra'),'model','auto:rapido')));
select ai_save_route('voz','elevenlabs',null,'qwen36-35b-a3b',true,'fixed','[]');
select refresh_map();
select expect_router_match('production shape');
select expect(map_ids(map_route('assistente')->'chain')='provider:deepseek','undeclared Gemini reserve is not an effective alternative');
select expect(map_state('assistente','connection:'||current_setting('test.extra'))@>'{"state":"blocked","role":"fallback","reason":"declaration_missing"}','map explains the inert reserve');
select expect(map_state('assistente','provider:gemini')@>'{"state":"unusable","reason":"declaration_missing"}','Gemini key without declaration is unusable for personal data');
select expect(map_state('assistente','provider:groq')@>'{"state":"available"}','enabled Groq is reported as available, not silently used');
select expect(map_state('assistente','provider:elevenlabs')@>'{"state":"incapable","reason":"capability"}','voice-only provider is not offered for text');
select expect(map_ids(map_route('voz')->'chain')='provider:elevenlabs','approved voice route is unchanged');
select expect(map_state('voz','provider:deepseek')@>'{"state":"incapable"}','text-only provider is not offered for live voice');
select expect(map_state('voz','provider:gemini')@>'{"state":"unusable","reason":"declaration_missing"}','voice-capable Gemini still needs its declaration');
select expect(map_route('assistente')->>'members_note'='base_off' and map_route('voz')->>'members_note'='voice_not_shared','member scope is explained');
select expect((current_setting('test.map')::jsonb->'whatsapp'->'stt'->>'reason')='declaration_missing','default WhatsApp transcription source is explained');

-- Declaration for the owner only: the reserve starts working for the owner and nobody else.
select ai_set_source_policy('gemini',current_setting('test.extra')::uuid,'paid','owner');
select ai_set_member_base(true);
select refresh_map();
select expect_router_match('owner-only declaration');
select expect(map_ids(map_route('assistente')->'chain')='provider:deepseek,connection:'||current_setting('test.extra'),'declared reserve now follows the primary');
select expect((select r->'declaration' from jsonb_array_elements(current_setting('test.map')::jsonb->'resources') r where r->>'source_id'='connection:'||current_setting('test.extra'))@>'{"privacy_basis":"paid","audience":"owner","current":true}','declaration and audience are reported');
select expect(map_ids(map_route('assistente')->'members_chain')='','owner-only declaration is not offered to members');
select act_as('00000000-0000-4000-8000-000000000001');
select expect(ai_runtime_for_current('synthetic-server-proof-over-thirty-two-characters','assistente') is null,'member cannot use an owner-only source even with the base on');
do $$ begin perform ai_resource_map(); raise exception 'FALHA: member read the resource map'; exception when insufficient_privilege then null; end $$;
do $$ begin perform ai_set_source_policy('gemini',null,'paid','members'); raise exception 'FALHA: member changed a source policy'; exception when insufficient_privilege then null; end $$;

-- Offering to members is a separate, explicit act, and the map matches the member runtime.
select act_as('00000000-0000-4000-8000-00000000000a');
select ai_set_source_policy('gemini',current_setting('test.extra')::uuid,'paid','members');
select ai_set_member_base_source('deepseek',null,'no_training');
select refresh_map();
select expect_router_match('member offer');
select expect(map_ids(map_route('assistente')->'members_chain')='provider:deepseek,connection:'||current_setting('test.extra'),'map lists the sources members really receive');
select expect(map_ids(map_route('voz')->'members_chain')='','voice is never shared through the base');
select act_as('00000000-0000-4000-8000-000000000001');
select expect(runtime_ids(ai_runtime_for_current('synthetic-server-proof-over-thirty-two-characters','assistente'))='provider:deepseek,connection:'||current_setting('test.extra'),'member runtime equals the mapped member chain');
select expect(ai_runtime_for_current('synthetic-server-proof-over-thirty-two-characters','assistente')->>'source'='base','member sources are labelled base');

-- Replacing a key invalidates its declaration for owner and members, and the map says why.
select act_as('00000000-0000-4000-8000-00000000000a');
select ai_save_connection_details(current_setting('test.extra')::uuid,'gemini','Reserva Gemini',true,1,'v1.extra-rotated','rot1','','','');
select refresh_map();
select expect_router_match('rotated key');
select expect(map_ids(map_route('assistente')->'chain')='provider:deepseek','rotated Gemini key loses its declaration');
select expect(map_state('assistente','connection:'||current_setting('test.extra'))@>'{"state":"blocked","reason":"declaration_stale"}','stale declaration is named');
select expect(map_ids(map_route('assistente')->'members_chain')='provider:deepseek','members keep only still-valid offers');

-- Owner personal keys come first and switch the effective route to automatic: the map shows both.
select ai_my_key_save('synthetic-server-proof-over-thirty-two-characters','groq','v1.owner-personal-groq','pgrq',true,'no_training');
select ai_save_route('organizar','deepseek',null,'auto:rapido',true,'auto','[]');
select ai_save_provider('mistral',false,'','','','','v1.paused-mistral','mst1');
select refresh_map();
select expect_router_match('personal and automatic');
select expect(map_route('assistente')->>'mode'='fallback' and map_route('assistente')->>'routing_effective'='auto','saved fallback mode is reported next to the effective automatic mode');
select expect(map_state('assistente','personal:groq')@>'{"state":"active","position":1,"role":"personal"}','owner personal key is first');
select expect(map_state('voz','personal:groq')@>'{"state":"incapable","reason":"owner_voice_uses_admin"}','owner voice keeps the administration route');
select expect(map_state('organizar','provider:gemini')@>'{"state":"blocked","role":"auto","reason":"declaration_missing"}','automatic pool explains excluded Gemini');
select expect(map_state('organizar','provider:mistral')@>'{"state":"blocked","role":"auto","reason":"disabled"}','paused key is excluded from the automatic pool');
select expect(map_state('organizar','provider:groq')->>'state'='active' and map_state('organizar','provider:deepseek')->>'state'='active','enabled eligible keys are active in automatic mode');

-- Transcription, channels and MCP are explained without exposing tokens or other accounts.
select whatsapp_admin('save',jsonb_build_object('enabled',false,'stt_connection',current_setting('test.extra'),'stt_model','auto:rapido','voice','pt-BR-AntonioNeural'));
select refresh_map();
select expect((current_setting('test.map')::jsonb->'whatsapp'->'stt')@>'{"state":"blocked","reason":"declaration_stale"}','stale transcription source is explained');
select whatsapp_admin('save',jsonb_build_object('enabled',false,'stt_connection','groq:primary','stt_model','auto:rapido','voice','pt-BR-AntonioNeural'));
select ai_save_connector(null,'Agenda','https://tools.example.invalid/mcp','2026-07-28',true,'v1.connector-token','tokn');
select mcp_token_create('Assistente externo',encode(extensions.digest('synthetic-mcp-token','sha256'),'hex'),'mcpt',false,30);
select refresh_map();
select expect_router_match('channels and MCP');
select expect((current_setting('test.map')::jsonb->'whatsapp'->'stt')@>'{"state":"active","provider":"groq"}','eligible transcription source is active');
select expect((current_setting('test.map')::jsonb->'mcp_outbound'->0)@>'{"host":"tools.example.invalid","enabled":true,"has_key":true}','outbound MCP reports host and token presence only');
select expect((current_setting('test.map')::jsonb->'mcp_inbound'->>'owner_tokens')::int=1,'inbound MCP access is counted');
select expect((current_setting('test.map')::jsonb->'members'->>'with_personal_keys')::int=0,'member aggregates contain counts only');

-- Invalid declarations are refused before anything is stored.
do $$ begin perform ai_set_source_policy('gemini',null,'no_training','owner'); raise exception 'FALHA: unpaid Gemini declared'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform ai_set_source_policy('groq',null,'paid','everyone'); raise exception 'FALHA: unknown audience'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform ai_set_source_policy('elevenlabs',null,'paid','owner'); raise exception 'FALHA: voice key declared for the text base'; exception when invalid_parameter_value then null; end $$;
select ai_set_source_policy('gemini',current_setting('test.extra')::uuid,null,'owner');
select refresh_map();
select expect((select r->'declaration'->>'privacy_basis' from jsonb_array_elements(current_setting('test.map')::jsonb->'resources') r where r->>'source_id'='connection:'||current_setting('test.extra')) is null,'withdrawing a declaration deletes it');
set role anon;
do $$ begin perform ai_resource_map(); raise exception 'FALHA: anonymous resource map'; exception when insufficient_privilege then null; end $$;
reset role;
select expect((select count(*) from public.admin_audit_log where action='ai_source_policy')>=4,'every source policy change is audited');
select 'OK: resource map matches the router, hides credentials and separates audience';
