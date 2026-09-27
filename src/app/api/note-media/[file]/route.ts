import { ownerSession } from '@/lib/supabase/server';
import { demoRequested } from '@/lib/config';
import { NOTE_BUCKET, safeMediaSource } from '@/lib/note-media';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (demoRequested(process.env)) return new Response(null, { status: 404, headers });
  const session = await ownerSession();
  if (!session) return new Response(null, { status: 401, headers });
  const { file } = await params;
  if (!safeMediaSource(`/api/note-media/${file}`)) return new Response(null, { status: 400, headers });
  const { data, error } = await session.client.storage.from(NOTE_BUCKET).createSignedUrl(`${session.user.id}/${file}`, 120);
  if (error || !data) return new Response(null, { status: 404, headers });
  // The stable document URL reauthorizes on every load. Short-lived Storage URLs
  // support native audio range requests without proxying large files via Vercel.
  return new Response(null, { status: 307, headers: { ...headers, Location: data.signedUrl } });
}
