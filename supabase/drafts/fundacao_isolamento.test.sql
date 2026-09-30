-- Teste de isolamento do rascunho fundacao_multiusuario.sql em Postgres local descartável.
-- Uso: psql -d <banco vazio> -f supabase/drafts/fundacao_isolamento.test.sql
-- Simula o mínimo do Supabase (auth.users, auth.uid(), papéis). NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth; create schema extensions; create extension pgcrypto schema extensions;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, extensions to authenticated, anon;
create schema private; grant usage on schema private to authenticated;
create table public.app_owner (singleton boolean primary key default true, user_id uuid not null);
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.app_owner(user_id) values ('00000000-0000-4000-8000-000000000001');
\ir fundacao_multiusuario.sql
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004'),('00000000-0000-4000-8000-000000000005');
insert into spaces(id,kind,name,parent_id,created_by) values
 ('10000000-0000-4000-8000-000000000001','institution','UNIP',null,'00000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000001','class','Psicologia 1º sem','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','class','Outra sala Prof B','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000001','group','Ética G1','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000003','group','Ética G3','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into space_members(space_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','teacher'),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','teacher'),
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','student'),
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','student'),
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','student'),
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000005','student');
insert into space_invitations(space_id,token_hash,expires_at,created_by) values
 ('20000000-0000-4000-8000-000000000001', encode(extensions.digest('segredo','sha256'),'hex'), now()+interval '1 day','00000000-0000-4000-8000-000000000002');
insert into contacts(owner_id,name,birthdate) values ('00000000-0000-4000-8000-000000000004','Colega sem conta','2000-05-01');

set role authenticated;
\echo '--- Professor A (dá aula na sala 1): vê sala 1 e os dois grupos, não vê a sala do Prof B'
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002'; select name from spaces order by name;
\echo '--- Professor B: vê só a própria sala'
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003'; select name from spaces order by name;
\echo '--- Aluno do G1: vê sala 1 e G1, não vê G3'
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004'; select name from spaces order by name;
\echo '--- Aluno do G1: contatos próprios'
select name from contacts;
\echo '--- Aluno do G3: não vê contatos do aluno G1, não vê G1'
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005'; select count(*) as contatos_visiveis from contacts; select name from spaces order by name;
\echo '--- Aluno tenta se promover (deve falhar)'
do $$ begin perform private.admin_update_account(auth.uid(),'pro','courtesy',null,100,'{}',true); raise exception 'FALHA: aluno se promoveu'; exception when insufficient_privilege then raise notice 'ok: bloqueado'; end $$;
\echo '--- Aluno tenta se colocar em G1 (deve falhar)'
do $$ begin insert into space_members(space_id,user_id,role) values ('30000000-0000-4000-8000-000000000001', auth.uid(),'student'); raise exception 'FALHA: entrou sozinho'; exception when insufficient_privilege then raise notice 'ok: bloqueado'; end $$;
\echo '--- Professor B tenta criar grupo na sala do Prof A (deve falhar)'
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
do $$ begin insert into spaces(kind,name,parent_id,created_by) values ('group','Intruso','20000000-0000-4000-8000-000000000001',auth.uid()); raise exception 'FALHA'; exception when insufficient_privilege then raise notice 'ok: bloqueado'; end $$;
\echo '--- Professor A cria grupo G2 na própria sala'
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
insert into spaces(kind,name,parent_id,created_by) values ('group','Ética G2','20000000-0000-4000-8000-000000000001',auth.uid());
\echo '--- Professor A adiciona Prof B como auxiliar; Prof B passa a ver a sala 1'
insert into space_members(space_id,user_id,role) values ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','assistant');
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003'; select name from spaces order by name;
\echo '--- Novo usuário aceita convite'
reset role; insert into auth.users(id) values ('00000000-0000-4000-8000-000000000006'); set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000006'; select private.accept_invitation('segredo'); select name from spaces order by name; select plan, is_master from accounts;
\echo '--- Master dá cortesia Pro e fica no histórico'
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select private.admin_update_account('00000000-0000-4000-8000-000000000004','pro','courtesy',null,50,'{criar_grupos}',false);
select action, details->'after'->>'plan' plan from admin_audit_log; select count(*) as contas_visiveis_ao_master from accounts;
