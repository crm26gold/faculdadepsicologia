import { dbError, readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { meAction, TERMS_VERSION } from '@/lib/community';
import { NOTE_BUCKET } from '@/lib/note-media';
import { openKey } from '@/lib/ai/crypto';
import { googleAgendaReady, removeCalendar } from '@/lib/google-agenda-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  if (new URL(request.url).searchParams.get('export') === '1') {
    const { data, error } = await session.client.rpc('export_my_data');
    if (error) return dbError(error);
    return new Response(JSON.stringify(data, null, 2), { headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="meus-dados-jornada-plena.json"`,
    } });
  }
  return rpc(session, 'app_home');
}

export async function POST(request: Request) {
  const input = await writeRequest(request, meAction);
  if (input instanceof Response) return input;
  const { session, body } = input;
  switch (body.action) {
    case 'accept_terms': return rpc(session, 'accept_terms', { terms_version: TERMS_VERSION });
    case 'rename': return rpc(session, 'update_my_name', { new_name: body.name });
    case 'delete_account': {
      // Anexos privados saem antes da conta; o banco apaga o resto e anonimiza o que foi do grupo.
      const storage = session.client.storage.from(NOTE_BUCKET);
      const { data: files } = await storage.list(session.user.id, { limit: 1000 });
      if (files?.length) {
        const { error } = await storage.remove(files.map(file => `${session.user.id}/${file.name}`));
        if (error) return reply({ error: 'Não foi possível apagar seus anexos. Nada foi excluído; tente novamente.' }, 503);
      }
      // A cópia no Google Agenda sai junto, quando o Google responde; a exclusão não espera por ele.
      const agenda = googleAgendaReady(process.env) ? await session.client.rpc('google_agenda_link') : null;
      if (agenda?.data) await removeCalendar(openKey(agenda.data.refresh_ciphertext), agenda.data.calendar_id, AbortSignal.timeout(10_000)).catch(() => false);
      const { error } = await session.client.rpc('delete_my_account');
      if (error) return dbError(error);
      await session.client.auth.signOut({ scope: 'local' });
      return reply({ ok: true });
    }
  }
}
