import { readSession, rpc, writeRequest } from '@/lib/api-route';
import { contactAction } from '@/lib/community';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  return rpc(session, 'list_contacts');
}

export async function POST(request: Request) {
  const input = await writeRequest(request, contactAction);
  if (input instanceof Response) return input;
  const { session, body } = input;
  if (body.action === 'delete') return rpc(session, 'delete_contact', { target: body.contact });
  return rpc(session, 'save_contact', {
    target: body.contact, contact_name: body.name, contact_email: body.email, contact_phone: body.phone,
    contact_birthdate: body.birthdate, contact_notes: body.notes,
  });
}
