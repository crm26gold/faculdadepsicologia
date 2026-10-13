-- Teste do Networking, etapa 3a (fotos nas publicações e stories de 24 horas), em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/networking_media.sql
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000004', 'bia@example.invalid', '{"full_name": "Bia Souza"}'),
  ('00000000-0000-4000-8000-000000000005', 'caio@example.invalid', '{"full_name": "Caio"}'),
  ('00000000-0000-4000-8000-000000000006', 'duda@example.invalid', '{"full_name": "Duda"}');
-- Uma "foto" mínima com a assinatura certa (o banco confere o começo do arquivo).
create function public.photo(kind text default 'jpeg', size integer default 200) returns jsonb language sql immutable
as $$ select jsonb_build_object('mime', 'image/' || kind, 'width', 800, 'height', 600, 'data', encode(case kind
  when 'jpeg' then '\xffd8ffe0'::bytea else '\x52494646000000005745425056503820'::bytea end || decode(repeat('00', size), 'hex'), 'base64')) $$;
create function public.post_id(post_body text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.network_posts where body = post_body $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.photo(text, integer), public.post_id(text) to authenticated;
set role authenticated;

select act_as('00000000-0000-4000-8000-000000000004'); select save_my_profile('animal', '🦊', null, '');
select act_as('00000000-0000-4000-8000-000000000005'); select save_my_profile('initials', '', null, '');
select act_as('00000000-0000-4000-8000-000000000006'); select save_my_profile('initials', '', null, '');
select act_as('00000000-0000-4000-8000-000000000004'); select save_my_privacy(true, true, false);
select act_as('00000000-0000-4000-8000-000000000006'); select follow_person('00000000-0000-4000-8000-000000000004');
select act_as('00000000-0000-4000-8000-000000000004'); select answer_follow('00000000-0000-4000-8000-000000000006', true);

-- Publicação com fotos: legenda opcional, até 4, só JPEG ou WebP de verdade.
select create_network_post('', 'text', 'followers', null, '{}', jsonb_build_array(photo('jpeg'), photo('webp')), false);
select create_network_post('Mapa do capítulo', 'text', 'followers', null, '{}', jsonb_build_array(photo()), false);
do $$ begin perform create_network_post('', 'text', 'followers', null, '{}', '[]', false); raise exception 'FALHA: publicação sem texto nem foto';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform create_network_post('x', 'text', 'followers', null, '{}', jsonb_build_array(photo(), photo(), photo(), photo(), photo()), false);
  raise exception 'FALHA: cinco fotos'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform create_network_post('x', 'text', 'followers', null, '{}',
  jsonb_build_array(jsonb_build_object('mime', 'image/jpeg', 'width', 10, 'height', 10, 'data', encode(convert_to(repeat('<svg>', 30), 'UTF8'), 'base64'))), false);
  raise exception 'FALHA: aceitou arquivo que não é foto'; exception when check_violation then null; end $$;
do $$ begin perform create_network_post('x', 'text', 'followers', null, '{}', jsonb_build_array(photo('jpeg', 310000)), false);
  raise exception 'FALHA: foto maior que 300 KB'; exception when check_violation then null; end $$;
select expect((select count(*) from network_posts) = 2, 'tentativas recusadas não deixam publicação pela metade');

-- Quem segue vê as fotos; quem não segue, não; ninguém lê a tabela direto.
select act_as('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(network_feed('following', null, null)->1->'photos') = 2, 'feed traz as duas fotos');
select expect((network_feed('following', null, null)->1->'photos'->0->>'w') = '800', 'feed traz o tamanho para o layout');
select set_config('test.photo', network_feed('following', null, null)->1->'photos'->0->>'id', false);
select expect(network_photo(current_setting('test.photo')::uuid, true)->>'mime' = 'image/jpeg', 'seguidora abre a foto');
select expect(network_photo(current_setting('test.photo')::uuid, false)->>'data' is null, 'conferir acesso não traz os bytes');
do $$ begin perform count(*) from network_media; raise exception 'FALHA: leu a tabela de fotos';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000005');
select expect(network_photo(current_setting('test.photo')::uuid, true) is null, 'quem não segue não abre a foto');

-- Story: uma foto ou um card, some em 24 horas e não entra no feed.
select act_as('00000000-0000-4000-8000-000000000004');
select create_network_post('Estudando agora', 'card_rose', 'followers', null, '{}', '[]', true);
select create_network_post('', 'text', 'followers', null, '{}', jsonb_build_array(photo()), true);
do $$ begin perform create_network_post('', 'text', 'followers', null, '{}', jsonb_build_array(photo(), photo()), true);
  raise exception 'FALHA: story com duas fotos'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform create_network_post('Só eu', 'text', 'private', null, '{}', '[]', true);
  raise exception 'FALHA: story só para mim'; exception when invalid_parameter_value then null; end $$;
select expect(jsonb_array_length(network_stories('following')->0->'stories') = 2, 'dona vê os próprios stories');
select act_as('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(network_stories('following')) = 1, 'seguidora vê os stories de quem segue');
select expect((network_stories('following')->0->'stories'->0->>'body') = 'Estudando agora', 'stories em ordem de chegada');
select expect(jsonb_array_length(network_feed('following', null, null)) = 2, 'story não entra no feed');
select expect(toggle_reaction(post_id('Estudando agora'), 'gostei'), 'gostei no story');
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(network_stories('following')) = 0, 'quem não segue não vê stories');

-- Depois de 24 horas o story some, e a faxina leva a foto junto.
reset role;
update public.network_posts set expires_at = now() - interval '1 minute' where expires_at is not null;
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(network_stories('following')) = 0, 'story vencido some');
do $$ begin perform toggle_reaction(post_id('Estudando agora'), 'util'); raise exception 'FALHA: reagiu a story vencido';
exception when insufficient_privilege then null; end $$;
reset role;
select expect((select count(*) from public.network_media) = 4, 'quatro fotos antes da faxina');
delete from public.network_posts where expires_at < now();
select expect((select count(*) from public.network_media) = 3, 'faxina dos stories leva a foto junto');
set role authenticated;

-- Exportação traz as fotos; apagar a publicação apaga as fotos.
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(export_my_data()->'network_photos') = 3, 'exportação traz as fotos');
select delete_network_post(post_id('Mapa do capítulo'));
select expect(jsonb_array_length(export_my_data()->'network_photos') = 2, 'apagar a publicação apaga a foto');

-- Freio do espaço grátis: 25 MB de fotos por pessoa.
reset role;
with posts as (
  insert into public.network_posts(author_id, body, audience) select '00000000-0000-4000-8000-000000000005', 'lote ' || n, 'private'
    from generate_series(1, 22) n returning id)
insert into public.network_media(post_id, position, mime, bytes, width, height)
select p.id, k, 'image/jpeg', '\xffd8ff'::bytea || decode(repeat('00', 307000), 'hex'), 10, 10 from posts p, generate_series(0, 3) k;
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005');
do $$ begin perform create_network_post('', 'text', 'followers', null, '{}', jsonb_build_array(photo()), false); raise exception 'FALHA: passou do limite de fotos';
exception when sqlstate 'PT413' then null; end $$;
select create_network_post('Texto continua liberado', 'text', 'followers', null, '{}', '[]', false);

reset role;
select 'networking media ok';
