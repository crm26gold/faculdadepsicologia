-- Teste do Networking, entrega 2 de 13/10 (Salvos, Destaques, descrição da foto, avatar maior e limites ajustáveis),
-- em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/networking_profile_extras.sql
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000004', 'bia@example.invalid', '{"full_name": "Bia Souza"}'),
  ('00000000-0000-4000-8000-000000000005', 'caio@example.invalid', '{"full_name": "Caio"}'),
  ('00000000-0000-4000-8000-000000000006', 'duda@example.invalid', '{"full_name": "Duda"}');
create function public.photo(alt text default '') returns jsonb language sql immutable
as $$ select jsonb_build_object('mime', 'image/jpeg', 'width', 800, 'height', 600, 'alt', alt,
  'data', encode('\xffd8ffe0'::bytea || decode(repeat('00', 200), 'hex'), 'base64')) $$;
create function public.post_id(post_body text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.network_posts where body = post_body $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.photo(text), public.post_id(text) to authenticated;
set role authenticated;

-- Avatar de 256 px: só no perfil aberto, some quando a foto muda e não passa do limite.
select act_as('00000000-0000-4000-8000-000000000004');
select save_my_profile('photo', '', 'data:image/webp;base64,AAAA', '', 'data:image/webp;base64,' || repeat('B', 40000));
select expect(char_length(person_profile('00000000-0000-4000-8000-000000000004')->>'photo_large') > 40000, 'avatar grande no perfil');
select save_my_profile('photo', '', 'data:image/webp;base64,AAAA', 'Psicologia', null);
select expect(person_profile('00000000-0000-4000-8000-000000000004')->>'photo_large' is not null, 'mesma foto mantém o avatar grande');
select save_my_profile('photo', '', 'data:image/webp;base64,CCCC', '', null);
select expect(person_profile('00000000-0000-4000-8000-000000000004')->>'photo_large' is null, 'foto nova sem versão grande tira a antiga');
do $$ begin perform save_my_profile('photo', '', 'data:image/webp;base64,AAAA', '', 'data:image/webp;base64,' || repeat('A', 48000));
  raise exception 'FALHA: avatar grande demais'; exception when check_violation then null; end $$;
do $$ begin perform save_my_profile('animal', '🦊', null, '', 'data:image/webp;base64,AAAA'); raise exception 'FALHA: avatar grande sem foto';
exception when check_violation then null; end $$;
select save_my_profile('animal', '🦊', null, '');
select act_as('00000000-0000-4000-8000-000000000005'); select save_my_profile('initials', '', null, '');
select act_as('00000000-0000-4000-8000-000000000006'); select save_my_profile('initials', '', null, '');
select act_as('00000000-0000-4000-8000-000000000004'); select save_my_privacy(true, true, false);
select act_as('00000000-0000-4000-8000-000000000006'); select follow_person('00000000-0000-4000-8000-000000000004');
select act_as('00000000-0000-4000-8000-000000000004'); select answer_follow('00000000-0000-4000-8000-000000000006', true);

-- Descrição da foto: vai junto no card, com espaços aparados; mais de 300 letras é recusado.
select create_network_post('Mapa do capítulo', 'text', 'followers', null, '{}', jsonb_build_array(photo('  Mapa mental do capítulo 3  ')), false);
select act_as('00000000-0000-4000-8000-000000000006');
select expect(network_feed('following', null, null)->0->'photos'->0->>'alt' = 'Mapa mental do capítulo 3', 'descrição da foto no card');
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin perform create_network_post('x', 'text', 'followers', null, '{}', jsonb_build_array(photo(repeat('a', 301))), false);
  raise exception 'FALHA: descrição longa demais'; exception when check_violation then null; end $$;

-- Salvos: só de quem a pessoa pode ver, só ela enxerga, e some quando ela perde o acesso.
select act_as('00000000-0000-4000-8000-000000000006');
select expect(toggle_save(post_id('Mapa do capítulo')), 'salvou');
select expect((network_feed('following', null, null)->0->>'saved')::boolean, 'card mostra salvo');
select expect(jsonb_array_length(saved_feed(null)) = 1 and saved_feed(null)->0->>'body' = 'Mapa do capítulo', 'lista de salvos');
select expect(jsonb_array_length(export_my_data()->'saved_posts') = 1, 'exportação traz os salvos');
select expect(not toggle_save(post_id('Mapa do capítulo')), 'tocar de novo tira dos salvos');
select expect(jsonb_array_length(saved_feed(null)) = 0, 'lista vazia depois de tirar');
select toggle_save(post_id('Mapa do capítulo'));
select act_as('00000000-0000-4000-8000-000000000005');
do $$ begin perform toggle_save(post_id('Mapa do capítulo')); raise exception 'FALHA: salvou o que não pode ver';
exception when insufficient_privilege then null; end $$;
select expect((select count(*) from saved_posts) = 0, 'ninguém vê os salvos dos outros');
do $$ begin insert into saved_posts(user_id, post_id) values ('00000000-0000-4000-8000-000000000005', post_id('Mapa do capítulo'));
  raise exception 'FALHA: gravou direto na tabela'; exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000006'); select unfollow_person('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(saved_feed(null)) = 0, 'salvo some quando a pessoa deixa de ver');
select follow_person('00000000-0000-4000-8000-000000000004');
select act_as('00000000-0000-4000-8000-000000000004'); select answer_follow('00000000-0000-4000-8000-000000000006', true);

-- Destaques: só quem publicou guarda, só story, título de 1 a 30 letras.
select create_network_post('Primeiro dia de estágio', 'card_rose', 'followers', null, '{}', '[]', true);
select create_network_post('Café antes da prova', 'card_rose', 'followers', null, '{}', '[]', true);
select keep_story(post_id('Primeiro dia de estágio'), ' Estágio ');
select expect((select highlight from network_posts where id = post_id('Primeiro dia de estágio')) = 'Estágio', 'título aparado');
do $$ begin perform keep_story(post_id('Mapa do capítulo'), 'Mapas'); raise exception 'FALHA: destaque de publicação comum';
exception when insufficient_privilege then null; end $$;
do $$ begin perform keep_story(post_id('Café antes da prova'), repeat('a', 31)); raise exception 'FALHA: título longo';
exception when check_violation then null; end $$;
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform keep_story(post_id('Café antes da prova'), 'Meu'); raise exception 'FALHA: guardou story de outra pessoa';
exception when insufficient_privilege then null; end $$;

-- Depois de 24 horas: o destaque fica no perfil, sai dos stories e escapa da faxina; o resto vai embora.
reset role;
update public.network_posts set expires_at = now() - interval '1 minute' where expires_at is not null;
set role authenticated;
select expect(jsonb_array_length(network_stories('following')) = 0, 'destaque não volta para os stories');
select expect(jsonb_array_length(network_feed('following', null, null)) = 1, 'destaque não entra no feed');
select expect(person_profile('00000000-0000-4000-8000-000000000004')->'highlights'->0->>'title' = 'Estágio', 'seguidora vê o destaque');
select expect(jsonb_array_length(person_profile('00000000-0000-4000-8000-000000000004')->'highlights'->0->'stories') = 1, 'destaque com o story');
select expect(toggle_reaction(post_id('Primeiro dia de estágio'), 'gostei'), 'gostei no destaque');
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(person_profile('00000000-0000-4000-8000-000000000004')->'highlights') = 0, 'quem não segue não vê o destaque');
reset role;
delete from public.network_posts where expires_at < now() and highlight is null;
select expect((select count(*) from public.network_posts where expires_at is not null) = 1, 'faxina poupa só o destaque');
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000004');
select keep_story(post_id('Primeiro dia de estágio'), '');
select act_as('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(person_profile('00000000-0000-4000-8000-000000000004')->'highlights') = 0, 'tirar do perfil esconde na hora');

-- Limites num lugar só: a configuração manda; ninguém muda pelo app.
do $$ begin update platform_settings set posts_per_day = 1000; raise exception 'FALHA: mudou o limite pelo app';
exception when insufficient_privilege then null; end $$;
reset role;
update public.platform_settings set posts_per_day = 2, photo_mb_per_person = 1;
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin perform create_network_post('Quarta do dia', 'text', 'followers', null, '{}', '[]', false); raise exception 'FALHA: passou do limite do dia';
exception when sqlstate 'PT429' then null; end $$;
select act_as('00000000-0000-4000-8000-000000000005');
reset role;
with posts as (
  insert into public.network_posts(author_id, body, audience) select '00000000-0000-4000-8000-000000000005', 'lote ' || n, 'private'
    from generate_series(1, 4) n returning id)
insert into public.network_media(post_id, position, mime, bytes, width, height)
select p.id, 0, 'image/jpeg', '\xffd8ff'::bytea || decode(repeat('00', 300000), 'hex'), 10, 10 from posts p;
update public.platform_settings set posts_per_day = 30;
set role authenticated;
do $$ begin perform create_network_post('', 'text', 'followers', null, '{}', jsonb_build_array(photo()), false); raise exception 'FALHA: passou do limite de fotos';
exception when sqlstate 'PT413' then null; end $$;
reset role;
update public.platform_settings set photo_mb_per_person = 25;
set role authenticated;
select create_network_post('', 'text', 'followers', null, '{}', jsonb_build_array(photo()), false);

reset role;
select 'networking profile extras ok';
