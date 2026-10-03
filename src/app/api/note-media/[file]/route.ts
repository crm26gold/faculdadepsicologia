import { userSession } from '@/lib/supabase/server';
import { demoRequested } from '@/lib/config';
import { NOTE_BUCKET, safeMediaSource } from '@/lib/note-media';
import { privateMedia } from '@/lib/private-media';
import { requestBudget } from '@/lib/ai/budget';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (demoRequested(process.env)) return new Response(null, { status: 404, headers });
  const session = await userSession();
  if (!session) return new Response(null, { status: 401, headers });
  const { file } = await params;
  if (!safeMediaSource(`/api/note-media/${file}`)) return new Response(null, { status: 400, headers });
  return privateMedia(request, session.user.id, file, session.client.storage.from(NOTE_BUCKET), fetch,
    bytes => requestBudget(session, 'media', bytes));
}
export const HEAD = GET;
