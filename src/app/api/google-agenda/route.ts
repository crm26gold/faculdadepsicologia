import { z } from 'zod';
import { openKey } from '@/lib/ai/crypto';
import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';
import { googleAgendaReady, removeCalendar, syncGoogleAgenda } from '@/lib/google-agenda-server';
import { emptyWorkspace, parseWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  if (!googleAgendaReady(process.env)) return reply({ ok: true, data: { ready: false, link: null } });
  const { data, error } = await session.client.rpc('google_agenda_state');
  return error ? dbError(error) : reply({ ok: true, data: { ready: true, link: data ?? null } });
}

const action = z.object({ action: z.enum(['sync', 'disconnect']) });
export async function POST(request: Request) {
  const input = await writeRequest(request, action, 200);
  if (input instanceof Response) return input;
  const { session, body } = input;
  if (!googleAgendaReady(process.env)) return reply({ error: 'O Google Agenda ainda não foi ativado nesta Jornada.' }, 503);
  if (body.action === 'sync') {
    const stored = await session.client.from('personal_workspaces').select('data,revision').eq('owner_id', session.user.id).maybeSingle();
    if (stored.error) return dbError(stored.error);
    const result = await syncGoogleAgenda(session, () => stored.data ? parseWorkspace(JSON.stringify(stored.data.data)) : emptyWorkspace(), stored.data?.revision ?? 0, true);
    if (!result) return reply({ error: 'Já existe uma atualização em andamento, ou a conexão precisa ser refeita.' }, 409);
    return reply({ ok: true, data: result });
  }
  const link = await session.client.rpc('google_agenda_link');
  if (link.error) return dbError(link.error);
  let removed = true;
  // The copy in Google goes away with the connection; the agenda in the Jornada stays as it is.
  if (link.data) { try { removed = await removeCalendar(openKey(link.data.refresh_ciphertext), link.data.calendar_id, AbortSignal.timeout(20_000)); } catch { removed = false; } }
  const result = await session.client.rpc('google_agenda_remove');
  return result.error ? dbError(result.error) : reply({ ok: true, data: { calendarRemoved: removed } });
}
