// Real transaction races, restricted to a disposable local database. Never run against Supabase.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

assert.ok(process.env.CI === 'true' || process.env.JORNADA_DISPOSABLE_DATABASE === 'true', 'Disposable database opt-in is required');
const database = process.env.PGDATABASE ?? 't_multiusuario_api';
const host = process.env.PGHOST ?? (process.platform === 'linux' ? '/var/run/postgresql' : '127.0.0.1');
assert.match(database, /^t_[a-z0-9_]+$/i);
assert.ok(['localhost', '127.0.0.1', '::1', '/var/run/postgresql'].includes(host), 'Only a local Postgres host is allowed');
const exec = promisify(execFile);
const env = { ...process.env, PGHOST: host, PGDATABASE: database };
const sql = async query => (await exec(process.env.JORNADA_PSQL_PATH ?? 'psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', query], { env, timeout: 20_000 })).stdout.trim();
const secret = 'synthetic-oauth-secret-at-least-32-characters';
const user = randomUUID();
const ids = Array.from({ length: 60 }, () => `jpc_${randomBytes(18).toString('base64url')}`);
const hash = text => createHash('sha256').update(text).digest('hex');
const clientRegistration = (id, origin) => sql(`set role anon; select public.mcp_oauth_register_limited('${secret}','${id}','Concurrency test',array['https://client.example/callback'],'${hash(origin)}'); select 'accepted';`);
let oldProof;
try {
  assert.equal(await sql('select count(*) from private.oauth_clients'), '0', 'Use a fresh database without registered clients');
  oldProof = await sql('select secret_hash from private.bot_server where id=true');
  await sql(`insert into private.bot_server(id,secret_hash) values(true,encode(extensions.digest('${secret}','sha256'),'hex')) on conflict(id) do update set secret_hash=excluded.secret_hash;
    insert into auth.users(id,email) values('${user}','oauth-race-${user}@example.invalid');`);

  const originRace = await Promise.allSettled(ids.slice(0, 20).map(id => clientRegistration(id, 'same-origin')));
  assert.equal(originRace.filter(value => value.status === 'fulfilled').length, 10, 'Per-origin capacity exceeded under concurrency');
  assert.equal(originRace.filter(value => value.status === 'rejected').length, 10);
  for (const value of originRace) if (value.status === 'rejected') assert.match(String(value.reason.stderr), /Rate limited/);
  const activeClient = ids[originRace.findIndex(value => value.status === 'fulfilled')];

  const code = randomBytes(32).toString('hex'), firstAccess = randomBytes(32).toString('hex'), firstRefresh = randomBytes(32).toString('hex');
  await sql(`insert into private.oauth_codes(code_hash,client_id,user_id,redirect_uri,code_challenge,can_write,expires_at)
    values('${code}','${activeClient}','${user}','https://client.example/callback',repeat('A',43),true,now()+interval '10 minutes');
    set role anon; select public.mcp_oauth_exchange('${secret}','${code}','${activeClient}','https://client.example/callback',repeat('A',43),'${firstAccess}','${firstRefresh}');`);
  const replacements = Array.from({ length: 2 }, () => ({ access: randomBytes(32).toString('hex'), refresh: randomBytes(32).toString('hex') }));
  const refreshRace = await Promise.all(replacements.map(next => sql(`set role anon; select public.mcp_oauth_refresh('${secret}','${firstRefresh}','${activeClient}','${next.access}','${next.refresh}');`).then(JSON.parse)));
  assert.equal(refreshRace.filter(value => value.error === 'invalid_grant').length, 1, 'Duplicate refresh must be detected');
  assert.equal(refreshRace.filter(value => value.can_write === true).length, 1);
  const winner = replacements[refreshRace.findIndex(value => value.can_write === true)];
  await assert.rejects(sql(`set role anon; select public.mcp_auth('${secret}','${winner.access}');`), error => /Not authorized/.test(String(error.stderr)), 'Replay did not revoke the winning successor');
  const renewed = JSON.parse(await sql(`set role anon; select public.mcp_oauth_refresh('${secret}','${winner.refresh}','${activeClient}','${randomBytes(32).toString('hex')}','${randomBytes(32).toString('hex')}');`));
  assert.equal(renewed.error, 'invalid_grant');

  // Reach 40 registrations, then compete for the remaining 10 slots using distinct origins.
  for (let i = 20; i < 50; i++) await clientRegistration(ids[i], `origin-${i}`);
  const globalIds = Array.from({ length: 20 }, (_, i) => ids[50 + i] ?? `jpc_${randomBytes(18).toString('base64url')}`);
  ids.push(...globalIds.filter(id => !ids.includes(id)));
  const globalRace = await Promise.allSettled(globalIds.map((id, i) => clientRegistration(id, `global-origin-${i}`)));
  assert.equal(globalRace.filter(value => value.status === 'fulfilled').length, 10, 'Global capacity exceeded under concurrency');
  for (const value of globalRace) if (value.status === 'rejected') assert.match(String(value.reason.stderr), /Rate limited/);
  assert.equal(await sql('select count(*) from private.oauth_clients'), '50');
  console.log('PASS: registration origin/global limits serialize; concurrent refresh replay revokes its successor family');
} finally {
  await sql(`delete from auth.users where id='${user}'; delete from private.oauth_clients where client_id in (${ids.map(id => `'${id}'`).join(',')});`);
  if (oldProof) { assert.match(oldProof, /^[a-f0-9]{64}$/); await sql(`update private.bot_server set secret_hash='${oldProof}' where id=true`); }
}
