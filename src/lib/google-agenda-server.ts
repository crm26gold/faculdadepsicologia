import 'server-only';
import { aiSecretReady, openKey } from '@/lib/ai/crypto';
import { demoRequested } from '@/lib/config';
import type { userSession } from '@/lib/supabase/server';
import { agendaEvents, GOOGLE_AGENDA_SCOPE, GOOGLE_AGENDA_WINDOW, planSync, saoPauloToday, type ExistingEvent } from './google-agenda';
import { addDays, type Workspace } from './workspace';

type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;
type Env = Record<string, string | undefined>;
const calendarApi = 'https://www.googleapis.com/calendar/v3';

/** Needs its own OAuth client (the login one may be reused), the key vault and the cloud workspace. */
export const googleAgendaReady = (env: Env) => !demoRequested(env) && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET && env.FACULDADE_CLOUD_WORKSPACE === 'true' && aiSecretReady();
export const agendaCookie = 'jp_google_agenda';
export const googleAgendaRedirect = (origin: string) => `${origin}/api/google-agenda/callback`;

export class GoogleAgendaError extends Error { constructor(readonly problem: 'revoked' | 'failed', message: string) { super(message); } }

async function tokenRequest(fields: Record<string, string>, signal: AbortSignal) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...fields }) });
  const body = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
  if (body.error === 'invalid_grant') throw new GoogleAgendaError('revoked', 'O Google não aceitou mais a autorização. Conecte de novo.');
  if (!response.ok || !body.access_token) throw new GoogleAgendaError('failed', 'O Google não respondeu como esperado. Tente de novo em instantes.');
  return body;
}
/** Code from the consent screen → tokens. Refuses a grant without the calendar scope or without offline access. */
export async function exchangeCode(code: string, verifier: string, origin: string, signal: AbortSignal) {
  const body = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: googleAgendaRedirect(origin) }, signal);
  if (!body.scope?.split(' ').includes(GOOGLE_AGENDA_SCOPE)) throw new GoogleAgendaError('failed', 'A permissão da agenda não foi concedida. Marque a opção da agenda na tela do Google.');
  if (!body.refresh_token) throw new GoogleAgendaError('failed', 'O Google não entregou acesso contínuo. Tente conectar de novo.');
  return { access: body.access_token!, refresh: body.refresh_token };
}
export const accessToken = async (refresh: string, signal: AbortSignal) => (await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh }, signal)).access_token!;

async function google(token: string, path: string, init: RequestInit & { signal: AbortSignal }) {
  return fetch(`${calendarApi}${path}`, { ...init, redirect: 'error', headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
}
export async function createCalendar(token: string, signal: AbortSignal) {
  const response = await google(token, '/calendars', { method: 'POST', signal, body: JSON.stringify({ summary: 'Jornada Plena', timeZone: 'America/Sao_Paulo',
    description: 'Cópia da sua agenda na Jornada Plena, atualizada sozinha. Altere os compromissos na Jornada.' }) });
  const body = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok || !body.id) throw new GoogleAgendaError('failed', 'Não consegui criar a agenda “Jornada Plena” no Google.');
  return body.id;
}
/** A calendar from an earlier connection is reused when the new authorization still reaches it. */
export async function calendarReachable(token: string, id: string, signal: AbortSignal) {
  return (await google(token, `/calendars/${encodeURIComponent(id)}`, { method: 'GET', signal })).ok;
}
export async function removeCalendar(refresh: string, id: string, signal: AbortSignal) {
  const token = await accessToken(refresh, signal);
  const response = await google(token, `/calendars/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST', signal, redirect: 'error' }).catch(() => null);
  return response.ok || response.status === 404 || response.status === 410;
}

async function listEvents(token: string, calendar: string, signal: AbortSignal) {
  const events: ExistingEvent[] = [];
  let page = '';
  do {
    const query = new URLSearchParams({ maxResults: '2500', fields: 'items(id,extendedProperties/private),nextPageToken', ...(page ? { pageToken: page } : {}) });
    const response = await google(token, `/calendars/${encodeURIComponent(calendar)}/events?${query}`, { method: 'GET', signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new GoogleAgendaError('failed', 'Não consegui ler a agenda no Google.');
    const body = await response.json() as { items?: { id: string; extendedProperties?: { private?: Record<string, string> } }[]; nextPageToken?: string };
    for (const item of body.items ?? []) events.push({ id: item.id, hash: item.extendedProperties?.private?.jornada, date: item.extendedProperties?.private?.jornadaDate });
    page = body.nextPageToken ?? '';
  } while (page && events.length < 10_000);
  return events;
}

/** Brings the Google calendar in line with the agenda at this revision. Claimed in the database, so only one runs
 * at a time per person and a revision already copied costs one query. Never throws: the outcome is recorded. */
export async function syncGoogleAgenda(session: Session, workspace: () => Workspace, revision: number, force = false) {
  if (!googleAgendaReady(process.env)) return null;
  const claimed = await session.client.rpc('google_agenda_claim', { next_revision: revision, force });
  if (claimed.error || !claimed.data) return null;
  const signal = AbortSignal.timeout(50_000);
  let calendar: string = claimed.data.calendar_id, recreated = '';
  const outcome = { applied: 0, failed: 0 };
  let desired: ReturnType<typeof agendaEvents> = [];
  try {
    desired = agendaEvents(workspace(), saoPauloToday());
    const token = await accessToken(openKey(claimed.data.refresh_ciphertext), signal);
    let existing = await listEvents(token, calendar, signal);
    // The person deleted the calendar in Google: a new one takes its place.
    if (!existing) { calendar = recreated = await createCalendar(token, signal); existing = []; }
    const plan = planSync(desired, existing, addDays(saoPauloToday(), -GOOGLE_AGENDA_WINDOW.past));
    const base = `/calendars/${encodeURIComponent(calendar)}/events`;
    const tasks = [
      ...plan.insert.map(event => async () => {
        const created = await google(token, base, { method: 'POST', signal, body: JSON.stringify(event.body) });
        // 409: the ID exists (a copy deleted in Google keeps it), so it is brought back by update.
        return created.status === 409 ? google(token, `${base}/${event.id}`, { method: 'PUT', signal, body: JSON.stringify(event.body) }) : created;
      }),
      ...plan.update.map(event => () => google(token, `${base}/${event.id}`, { method: 'PUT', signal, body: JSON.stringify(event.body) })),
      ...plan.remove.map(id => async () => { const removed = await google(token, `${base}/${id}`, { method: 'DELETE', signal }); return removed.status === 410 || removed.status === 404 ? new Response(null, { status: 204 }) : removed; }),
    ];
    // Four at a time keeps within Google's per-user write rate.
    for (let index = 0; index < tasks.length; index += 4) {
      const done = await Promise.allSettled(tasks.slice(index, index + 4).map(task => task()));
      for (const result of done) result.status === 'fulfilled' && result.value.ok ? outcome.applied++ : outcome.failed++;
      if (signal.aborted) { outcome.failed += Math.max(0, tasks.length - index - 4); break; }
    }
    const complete = outcome.failed <= 0;
    await session.client.rpc('google_agenda_finish', { next_revision: complete ? revision : null, next_events: desired.length, next_problem: complete ? '' : 'partial', next_calendar: recreated });
    return { ...outcome, events: desired.length, complete };
  } catch (cause) {
    const problem = cause instanceof GoogleAgendaError ? cause.problem : 'failed';
    console.warn('[google-agenda]', { problem, stage: 'sync' });
    await session.client.rpc('google_agenda_finish', { next_revision: null, next_events: desired.length, next_problem: problem, next_calendar: recreated });
    return { ...outcome, events: desired.length, complete: false, problem };
  }
}
