import { randomUUID } from 'node:crypto';
import { userSession } from '@/lib/supabase/server';
import { applicationOrigin } from '@/lib/auth-input';
import { demoRequested } from '@/lib/config';
import { mediaTypes, validMedia, NOTE_BUCKET } from '@/lib/note-media';
import { requestBudget } from '@/lib/ai/budget';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  if (demoRequested(process.env)) return reply({ error: 'Anexos privados indisponíveis na demonstração.' }, 404);
  const origin = applicationOrigin(process.env);
  if (!origin || request.headers.get('origin') !== origin) return reply({ error: 'Origem não autorizada.' }, 403);
  const session = await userSession();
  if (!session) return reply({ error: 'Entre novamente para anexar arquivos.' }, 401);
  if (process.env.FACULDADE_CLOUD_WORKSPACE !== 'true') return reply({ error: 'Armazenamento não ativado.' }, 503);
  // This endpoint only receives metadata; large files go directly to private Storage.
  const reader = request.body?.getReader();
  if (!reader || !request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'Formato inválido.' }, 400);
  let bytes = 0, raw = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 2048) { await reader.cancel(); return reply({ error: 'Pedido muito grande.' }, 413); }
    raw += decoder.decode(value, { stream: true });
  }
  let body;
  try { body = JSON.parse(raw + decoder.decode()); } catch { return reply({ error: 'Pedido inválido.' }, 400); }
  if (!body || typeof body.noteId !== 'string' || !validMedia(body.type, body.size)) return reply({ error: 'Use imagem, áudio ou vídeo compatível, com até 25 MB.' }, 400);
  const { data, error } = await session.client.from('personal_workspaces').select('data').eq('owner_id', session.user.id).maybeSingle();
  if (error) return reply({ error: 'Não foi possível verificar sua anotação.' }, 503);
  if (!data?.data?.notes?.some((note: { id: string }) => note.id === body.noteId)) return reply({ error: 'Aguarde a anotação sincronizar antes de anexar.' }, 409);
  const limited = await requestBudget(session, 'upload');
  if (limited) return limited;
  const file = `${randomUUID()}.${mediaTypes[body.type]}`;
  const path = `${session.user.id}/${file}`;
  const upload = await session.client.storage.from(NOTE_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (upload.error || !upload.data) return reply({ error: 'Não foi possível preparar o anexo privado. Tente novamente.' }, 503);
  return reply({ uploadUrl: upload.data.signedUrl, src: `/api/note-media/${file}` });
}
