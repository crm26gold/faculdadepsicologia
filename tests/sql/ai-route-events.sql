-- Quedas de IA: só o servidor (com o segredo) anota; só o administrador geral lê o resumo; nada de conteúdo.
begin;
set local role anon;
do $$ begin perform public.ai_report_fallbacks('segredo-errado-com-mais-de-trinta-e-dois-caracteres', 'assistente', '[{"provider":"gemini","kind":"auth"}]', 'groq');
  raise exception 'FALHA: segredo errado anotou queda'; exception when insufficient_privilege then null; end $$;
select public.ai_report_fallbacks('segredo-do-servidor-com-mais-de-32-caracteres', 'assistente', '[{"provider":"gemini","kind":"rate_limit"}]', 'groq');
select public.ai_report_fallbacks('segredo-do-servidor-com-mais-de-32-caracteres', 'organizar', '[{"provider":"gemini","kind":"rate_limit"}]', 'groq');
select public.ai_report_fallbacks('segredo-do-servidor-com-mais-de-32-caracteres', 'assistente', '[{"provider":"deepseek","kind":"billing"}]', null);
do $$ begin perform public.ai_recent_failures(); raise exception 'FALHA: anônimo leu as quedas'; exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin perform public.ai_report_fallbacks('segredo-do-servidor-com-mais-de-32-caracteres', 'assistente', '[{"provider":"gemini","kind":"texto livre"}]', 'groq');
  raise exception 'FALHA: tipo de falha livre foi aceito'; exception when check_violation then null; end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
select expect(jsonb_array_length(public.ai_recent_failures()) = 2, 'resumo por empresa e tipo de falha');
select expect((select (e->>'count')::int = 2 and e->>'served' = 'groq' and e->'tasks' @> '["assistente","organizar"]'
  from jsonb_array_elements(public.ai_recent_failures()) e where e->>'provider' = 'gemini'), 'conta as quedas, quem assumiu e as tarefas');
select expect((select e->'served' = 'null'::jsonb from jsonb_array_elements(public.ai_recent_failures()) e where e->>'provider' = 'deepseek'), 'queda sem ninguém assumindo fica marcada');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
do $$ begin perform public.ai_recent_failures(); raise exception 'FALHA: membro leu as quedas'; exception when insufficient_privilege then null; end $$;
reset role;
rollback;
