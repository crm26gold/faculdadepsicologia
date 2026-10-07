import { z } from 'zod';
import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';

export const dynamic = 'force-dynamic';

// The person's own trash (RLS): newest first. Restoring happens in the space itself; this route lists and
// lets the person delete an item for good.
export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  const { data, error } = await session.client.from('personal_trash').select('id,collection,item_id,item,deleted_at,expires_at')
    .order('deleted_at', { ascending: false }).limit(100);
  if (error) return dbError(error);
  return reply({ ok: true, data: data ?? [] });
}

const purge = z.object({ action: z.literal('purge'), id: z.uuid() });
export async function POST(request: Request) {
  const input = await writeRequest(request, purge);
  if (input instanceof Response) return input;
  const { error } = await input.session.client.from('personal_trash').delete().eq('id', input.body.id);
  return error ? dbError(error) : reply({ ok: true, data: null });
}
