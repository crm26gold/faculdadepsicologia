import { NextResponse } from 'next/server';
import { userSession } from '@/lib/supabase/server';
import { emptyWorkspace, parseWorkspace, workspaceSchema, type Workspace } from '@/lib/workspace';
import { applyChanges, workspaceChangesSchema } from '@/lib/workspace-sync';
import { z } from 'zod';
import { applicationOrigin } from '@/lib/auth-input';
import { demoRequested } from '@/lib/config';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
  if (demoRequested(process.env)) return response({ error: 'Indisponível na demonstração.' }, 404);
  const session = await userSession();
  if (!session) return response({ error: 'Acesso não autorizado.' }, 401);
  const accountId = new URL(request.url).searchParams.get('accountId');
  if (accountId && accountId !== session.user.id) return response({ error: 'A conta mudou. Recarregue antes de continuar.' }, 409);
  if (process.env.FACULDADE_CLOUD_WORKSPACE !== 'true') return response({ error: 'Sincronização ainda não ativada.' }, 503);
  // The open app asks only for the revision every few seconds, to follow changes made by assistants elsewhere.
  if (new URL(request.url).searchParams.get('only') === 'revision') {
    const { data, error } = await session.client.from('personal_workspaces').select('revision').eq('owner_id', session.user.id).maybeSingle();
    if (error) return response({ error: 'Não foi possível consultar a versão.' }, 503);
    return response({ revision: data?.revision ?? 0, accountId: session.user.id });
  }
  const { data, error } = await session.client.from('personal_workspaces').select('data,revision').eq('owner_id', session.user.id).maybeSingle();
  if (error) return response({ error: 'Não foi possível carregar. Verifique a configuração do banco.' }, 503);
  return response({ ...(data ?? { data: emptyWorkspace(), revision: 0 }), accountId: session.user.id });
}
export async function PUT(request: Request) {
  if (demoRequested(process.env)) return response({ error: 'Indisponível na demonstração.' }, 404);
  const origin = applicationOrigin(process.env);
  if (!origin || request.headers.get('origin') !== origin) return response({ error: 'Origem não autorizada.' }, 403);
  const session = await userSession();
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
  const accountId = z.string().uuid().optional(), revision = z.number().int().nonnegative();
  let body;
  try { body = z.union([z.object({ changes: workspaceChangesSchema, revision, editorGeneration: z.number().int().min(1).max(1000), accountId }), z.object({ data: workspaceSchema, revision, accountId })]).parse(JSON.parse(raw)); }
  catch { return response({ error: 'Dados inválidos. Nada foi alterado.' }, 400); }
  if (body.accountId && body.accountId !== session.user.id) return response({ error: 'A conta mudou. Recarregue antes de salvar.' }, 409);
  const outdatedEditor = (message?: string) => /Editor outdated/.test(message ?? '');
  const outdated = 'Este aparelho está com uma versão antiga do app. Recarregue a página para continuar.';
  // A tab opened before this change still sends the whole document.
  if ('data' in body) {
    const { data, error } = await session.client.rpc('save_personal_workspace', { next_data: body.data, expected_revision: body.revision });
    if (outdatedEditor(error?.message)) return response({ error: outdated }, 409);
    if (error?.code === 'PT409' || error?.code === '40001') return response({ error: 'Outra sessão alterou os dados. Exporte suas alterações e recarregue antes de continuar.' }, 409);
    if (error) return response({ error: 'Não foi possível salvar. Suas alterações continuam nesta tela; exporte uma cópia.' }, 503);
    return response({ revision: data });
  }
  // Only what changed: merged onto the current version, validated whole and saved at that version. A write from
  // another device or assistant in between just means merging again.
  const refusals = {
    outdated: [outdated, 409],
    invalid: ['Dados inválidos. Nada foi alterado.', 400],
    clash: ['O que você mudou não combina com uma mudança feita em outro lugar (por exemplo, um item ligado a algo que foi apagado). Nada foi alterado: exporte uma cópia e recarregue para ver a versão atual.', 409],
    full: ['Seu espaço chegou ao limite de 2 MB. Nada foi alterado.', 413],
  } as const;
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await session.client.from('personal_workspaces').select('data,revision').eq('owner_id', session.user.id).maybeSingle();
    if (stored.error) return response({ error: 'Não foi possível salvar. Suas alterações continuam nesta tela; exporte uma cópia.' }, 503);
    const currentRevision = stored.data?.revision ?? 0;
    let current: Workspace;
    try { current = stored.data ? parseWorkspace(JSON.stringify(stored.data.data)) : emptyWorkspace(); }
    catch { return response({ error: 'Não consegui ler a versão salva do seu espaço. Suas alterações continuam nesta tela; exporte uma cópia.' }, 503); }
    const applied = applyChanges(current, body.changes, body.editorGeneration, currentRevision !== body.revision);
    if ('refused' in applied) { const [error, status] = refusals[applied.refused]; return response({ error }, status); }
    const { data, error } = await session.client.rpc('save_personal_workspace', { next_data: applied.workspace, expected_revision: currentRevision });
    if (outdatedEditor(error?.message)) return response({ error: outdated }, 409);
    if (error?.code === 'PT409' || error?.code === '40001') continue;
    if (error) return response({ error: 'Não foi possível salvar. Suas alterações continuam nesta tela; exporte uma cópia.' }, 503);
    // Someone else wrote since this screen loaded: it gets the merged version back to stay in step.
    const joined = currentRevision !== body.revision || applied.conflicts.length > 0;
    return response({ revision: data, ...(joined ? { data: applied.workspace } : {}), ...(applied.conflicts.length ? { conflicts: applied.conflicts } : {}) });
  }
  return response({ error: 'Muitas gravações ao mesmo tempo. Suas alterações continuam nesta tela; tente de novo em instantes.' }, 409);
}
