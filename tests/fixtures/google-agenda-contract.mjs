// Synthetic Google: checks the order of calls of one sync, without credentials or network.
import assert from 'node:assert/strict';
process.env.GOOGLE_CLIENT_ID = 'client.example'; process.env.GOOGLE_CLIENT_SECRET = 'synthetic-secret';
process.env.FACULDADE_CLOUD_WORKSPACE = 'true'; process.env.AI_KEYS_SECRET = Buffer.alloc(32, 7).toString('base64');
const { sealKey } = await import('../../src/lib/ai/vault.ts');
const { syncGoogleAgenda } = await import('../../src/lib/google-agenda-server.ts');
const { agendaEvents, saoPauloToday } = await import('../../src/lib/google-agenda.ts');
const { demoWorkspace } = await import('../../src/lib/workspace.ts');

const data = demoWorkspace(saoPauloToday()); data.notes = [];
const desired = agendaEvents(data, saoPauloToday());
assert(desired.length >= 3, 'a demonstração tem eventos suficientes');
const rpcs = [];
const session = (claim) => ({ user: { id: 'u1' }, client: { rpc: async (name, args) => { rpcs.push({ name, args }); return name === 'google_agenda_claim' ? { data: claim, error: null } : { data: null, error: null }; } } });
const claim = { refresh_ciphertext: sealKey('refresh-1'), calendar_id: 'cal@group.calendar.google.com' };
let calls = [], calendarGone = false, revoked = false;
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, method: init.method, body: init.body });
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    assert.equal(new URLSearchParams(init.body).get('refresh_token'), 'refresh-1');
    return revoked ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : Response.json({ access_token: 'access-1' });
  }
  assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, 'Bearer access-1');
  if (url.includes('/events?')) {
    if (calendarGone) return new Response('{}', { status: 404 });
    return Response.json({ items: [
      { id: desired[0].id, extendedProperties: { private: { jornada: desired[0].hash, jornadaDate: desired[0].date } } }, // igual
      { id: desired[1].id, extendedProperties: { private: { jornada: 'antigo', jornadaDate: desired[1].date } } }, // mudou
      { id: 'jpsaiu', extendedProperties: { private: { jornada: 'x', jornadaDate: saoPauloToday() } } }, // saiu da agenda
      { id: 'pessoal' }, // criado à mão
    ] });
  }
  if (url.endsWith('/calendars') && init.method === 'POST') return Response.json({ id: 'nova@group.calendar.google.com' });
  if (init.method === 'POST') return JSON.parse(init.body).id === desired[2].id ? new Response('{}', { status: 409 }) : Response.json({});
  if (init.method === 'DELETE') return new Response(null, { status: 410 });
  return Response.json({});
};

const result = await syncGoogleAgenda(session(claim), () => data, 42);
assert.deepEqual({ complete: result.complete, failed: result.failed, events: result.events }, { complete: true, failed: 0, events: desired.length });
const writes = calls.filter(call => call.method !== 'GET' && !call.url.includes('oauth2'));
assert(!writes.some(call => call.url.includes(desired[0].id)), 'o igual não é reenviado');
assert(writes.some(call => call.method === 'PUT' && call.url.endsWith(`/events/${desired[1].id}`)), 'o que mudou é atualizado');
assert(writes.some(call => call.method === 'PUT' && call.url.endsWith(`/events/${desired[2].id}`)), '409 vira atualização');
assert(writes.some(call => call.method === 'DELETE' && call.url.endsWith('/events/jpsaiu')), 'o que saiu é removido; 410 conta como feito');
assert(!writes.some(call => call.url.includes('pessoal')), 'evento feito à mão no Google fica');
assert.deepEqual(rpcs.at(-1), { name: 'google_agenda_finish', args: { next_revision: 42, next_events: desired.length, next_problem: '', next_calendar: '' } });

calls = []; rpcs.length = 0; calendarGone = true;
await syncGoogleAgenda(session(claim), () => data, 43);
assert(calls.some(call => call.url.endsWith('/calendars') && call.method === 'POST'), 'agenda apagada no Google é recriada');
assert.equal(rpcs.at(-1).args.next_calendar, 'nova@group.calendar.google.com');
assert.equal(rpcs.at(-1).args.next_revision, 43);

calls = []; rpcs.length = 0; calendarGone = false; revoked = true;
const refused = await syncGoogleAgenda(session(claim), () => data, 44);
assert.equal(refused.problem, 'revoked');
assert.deepEqual(rpcs.at(-1).args, { next_revision: null, next_events: desired.length, next_problem: 'revoked', next_calendar: '' });

rpcs.length = 0; calls = [];
assert.equal(await syncGoogleAgenda(session(null), () => { throw new Error('não deveria ler o espaço'); }, 45), null, 'revisão já copiada: nada a fazer');
assert.equal(calls.length, 0);
console.log('Google Agenda contract verified without credentials or network.');
