// Real concurrent transactions in CI's disposable local database only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
assert.equal(process.env.CI, 'true', 'Run only in the disposable CI database');
assert.equal(process.platform, 'linux');
const host = process.env.PGHOST ?? '/var/run/postgresql';
const database = process.env.PGDATABASE ?? 't_multiusuario_api';
assert.ok(['localhost', '127.0.0.1', '::1', '/var/run/postgresql'].includes(host), 'Only a local Postgres host is allowed');
assert.match(database, /^t_[a-z0-9_]+$/i);
const env = { ...process.env, PGHOST: host, PGDATABASE: database };
const sql = async query => (await exec('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', query], { env, timeout: 15000 })).stdout.trim();
const ids = [randomUUID(), randomUUID()];
const idList = ids.map(id => `'${id}'`).join(',');
try {
  await sql(`insert into auth.users(id,email) values ${ids.map(id => `('${id}','race-${id}@example.invalid')`).join(',')};
    insert into private.bot_server(id,secret_hash) values(true,encode(extensions.digest('synthetic-budget-secret-at-least-32-chars','sha256'),'hex')) on conflict(id) do update set secret_hash=excluded.secret_hash;
    insert into private.jornada_budget_server(id,secret_hash) values(true,encode(extensions.digest('synthetic-budget-secret-at-least-32-chars','sha256'),'hex')) on conflict(id) do update set secret_hash=excluded.secret_hash;
    delete from private.jornada_budget_days where scope='ai';
    update private.jornada_global_budgets set minute_count=0,minute_start='-infinity',day_limit=5,window_limit=5 where scope='ai';`);
  const decisions = await Promise.all(Array.from({ length: 20 }, (_, i) => sql(`begin;
    set local role authenticated;
    set local request.jwt.claim.sub='${ids[i % 2]}';
    select public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','ai')->>'allowed'; commit;`)));
  assert.equal(decisions.filter(value => value === 'true').length, 5, 'Concurrent requests exceeded shared capacity');
  assert.equal(decisions.filter(value => value === 'false').length, 15);
  assert.equal(await sql(`select sum(day_count) from private.jornada_request_limits where scope='ai' and user_id in (${idList})`), '5', 'Denials charged personal counters');
  assert.equal(await sql(`select sum(units) from private.jornada_budget_days where scope='ai'`), '5', 'Shared reservation count diverged');
  console.log('PASS: 20 simultaneous admissions across two accounts accepted exactly 5');
} finally {
  await sql(`delete from auth.users where id in (${idList});
    delete from private.jornada_budget_days where scope='ai';
    update private.jornada_global_budgets set minute_count=0,minute_start='-infinity',day_limit=600,window_limit=6000 where scope='ai';`);
}
