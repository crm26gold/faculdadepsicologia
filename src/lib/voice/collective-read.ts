import { z } from 'zod';

// The voice reads the collective layer through the screens' own routes, with the person's login, so a call
// sees exactly what the screens show. Administration routes answer only the general administrator.
const query = z.object({ o_que: z.enum(['inicio', 'sala', 'trabalho', 'contatos', 'contas', 'uso', 'recursos']), id: z.uuid().optional() });
const routes = { inicio: '/api/me', contatos: '/api/contacts', contas: '/api/admin', uso: '/api/admin/usage', recursos: '/api/ai/resources' } as const;

export function collectiveReadUrl(args: unknown): string {
  const parsed = query.safeParse(args);
  if (!parsed.success) throw new Error('Consulta coletiva inválida. Escolha inicio, sala, trabalho, contatos, contas, uso ou recursos.');
  const { o_que, id } = parsed.data;
  if (o_que === 'sala' || o_que === 'trabalho') {
    if (!id) throw new Error('Informe o ID. Consulte "inicio" para ver as salas e os trabalhos.');
    return `${o_que === 'sala' ? '/api/spaces' : '/api/work'}?id=${id}`;
  }
  return routes[o_que];
}

/** The start screen carries the account too; the call needs only rooms and the person's group work. */
export function collectiveReadResult(url: string, data: unknown) {
  if (url !== '/api/me' || !data || typeof data !== 'object') return data;
  const { spaces, my_parts, to_review } = data as Record<string, unknown>;
  return { spaces, my_parts, to_review };
}
