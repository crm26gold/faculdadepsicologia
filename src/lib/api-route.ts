import 'server-only';
import type { z } from 'zod';
import { userSession } from '@/lib/supabase/server';
import { applicationOrigin } from '@/lib/auth-input';
import { demoRequested } from '@/lib/config';

type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;
/** A 503 carries a short reference the owner can find in the log. The log keeps only the reference and the
 * error code (never the message, request or row), and an unexpected code shape is not logged. */
export function reply(body: unknown, status = 200, code?: string) {
  if (status === 503 && body !== null && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
    const reference = crypto.randomUUID().slice(0, 8);
    console.warn('[api]', { reference, status, code: code && /^[A-Za-z0-9_]{1,32}$/.test(code) ? code : 'none' });
    body = { ...body, error: `${(body as { error: string }).error} Código de referência: ${reference}.`, reference };
  }
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

const messages: Record<string, [number, string]> = {
  '42501': [403, 'Você não tem permissão para isso.'],
  P0002: [404, 'Não encontrado. Confira o e-mail ou se o item ainda existe.'],
  '22023': [400, 'Dados inválidos. Confira os campos e tente novamente.'],
  '23514': [400, 'Algum campo está fora do formato permitido.'],
  '23505': [409, 'Isso já existe.'],
  '40001': [409, 'Outra pessoa alterou isto agora. Recarregue e tente de novo.'],
  PT409: [409, 'Outra sessão alterou isto agora. Recarregue e tente de novo.'],
};
export function dbError(error: { code?: string } | null) {
  const [status, message] = messages[error?.code ?? ''] ?? [503, 'Não foi possível concluir agora. Tente novamente.'];
  return reply({ error: message }, status, error?.code);
}

/** Leitura autenticada (GET). */
export async function readSession(): Promise<Session | Response> {
  if (demoRequested(process.env)) return reply({ error: 'Indisponível na demonstração.' }, 404);
  const session = await userSession();
  return session ?? reply({ error: 'Entre com sua conta para continuar.' }, 401);
}

/** Escrita autenticada: origem exata, JSON pequeno e ação validada pelo esquema. */
export async function writeRequest<T extends z.ZodType>(request: Request, schema: T, limit = 64_000): Promise<{ session: Session; body: z.infer<T> } | Response> {
  if (demoRequested(process.env)) return reply({ error: 'Indisponível na demonstração.' }, 404);
  const origin = applicationOrigin(process.env);
  if (!origin || request.headers.get('origin') !== origin) return reply({ error: 'Origem não autorizada.' }, 403);
  const session = await userSession();
  if (!session) return reply({ error: 'Entre com sua conta para continuar.' }, 401);
  if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'Formato inválido.' }, 415);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'Pedido vazio.' }, 400);
  const decoder = new TextDecoder();
  let raw = '', total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); return reply({ error: 'Conteúdo grande demais.' }, 413); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return reply({ error: 'Pedido inválido.' }, 400); }
  const result = schema.safeParse(parsed);
  if (!result.success) return reply({ error: result.error.issues[0]?.message ?? 'Dados inválidos.' }, 400);
  return { session, body: result.data };
}

/** Chama uma função do banco e responde com o resultado ou com o erro traduzido. */
export async function rpc(session: Session, name: string, params: Record<string, unknown> = {}) {
  const { data, error } = await session.client.rpc(name, params);
  return error ? dbError(error) : reply({ ok: true, data: data ?? null });
}
