import { NextResponse } from 'next/server';
import { ownerSession } from '@/lib/supabase/server';
import { emptyWorkspace, workspaceSchema } from '@/lib/workspace';
import { z } from 'zod';
import { applicationOrigin } from '@/lib/auth-input';
import { demoRequested } from '@/lib/config';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET() {
  if (demoRequested(process.env)) return response({ error: 'Indisponível na demonstração.' }, 404);
  const session = await ownerSession();
  if (!session) return response({ error: 'Acesso não autorizado.' }, 401);
  if (process.env.FACULDADE_CLOUD_WORKSPACE !== 'true') return response({ error: 'Sincronização ainda não ativada.' }, 503);
  const { data, error } = await session.client.from('personal_workspaces').select('data,revision').eq('owner_id', session.user.id).maybeSingle();
  if (error) return response({ error: 'Não foi possível carregar. Verifique a configuração do banco.' }, 503);
  return response(data ?? { data: emptyWorkspace(), revision: 0 });
}
export async function PUT(request: Request) {
  if (demoRequested(process.env)) return response({ error: 'Indisponível na demonstração.' }, 404);
  const origin = applicationOrigin(process.env);
  if (!origin || request.headers.get('origin') !== origin) return response({ error: 'Origem não autorizada.' }, 403);
  const session = await ownerSession();
  if (!session) return response({ error: 'Acesso não autorizado.' }, 401);
  if (process.env.FACULDADE_CLOUD_WORKSPACE !== 'true') return response({ error: 'Sincronização ainda não ativada.' }, 503);
  if (!request.headers.get('content-type')?.includes('application/json')) return response({ error: 'Formato inválido.' }, 415);
  if (Number(request.headers.get('content-length')) > 2_000_000) return response({ error: 'Limite de 2 MB excedido.' }, 413);
  // Read incrementally so a missing/forged Content-Length cannot bypass the cap.
  const reader = request.body?.getReader();
  if (!reader) return response({ error: 'Conteúdo vazio.' }, 400);
  let total = 0;
  let raw = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 2_000_000) { await reader.cancel(); return response({ error: 'Limite de 2 MB excedido.' }, 413); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  let body;
  try { body = z.object({ data: workspaceSchema, revision: z.number().int().nonnegative() }).parse(JSON.parse(raw)); }
  catch { return response({ error: 'Dados inválidos. Nada foi alterado.' }, 400); }
  const { data, error } = await session.client.rpc('save_personal_workspace', { next_data: body.data, expected_revision: body.revision });
  if (error?.code === '40001') return response({ error: 'Outra sessão alterou os dados. Exporte suas alterações e recarregue antes de continuar.' }, 409);
  if (error) return response({ error: 'Não foi possível salvar. Suas alterações continuam nesta tela; exporte uma cópia.' }, 503);
  return response({ revision: data });
}
