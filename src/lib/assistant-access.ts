import { timingSafeEqual } from 'node:crypto';
import { demoRequested } from './config';

// Transport authentication only. This does not establish which user owns a message.
export function assistantAccess(env: Record<string, string | undefined>, authorization: string | null): { status: number; error: string } | null {
  if (demoRequested(env)) return { status: 404, error: 'Assistente privado indisponível na demonstração.' };
  const secret = env.ASSISTANT_SECRET_TOKEN;
  if (!secret || secret.length < 32) return { status: 503, error: 'Integração do assistente não configurada.' };
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '');
  const provided = Buffer.from(match?.[1] ?? '');
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { status: 401, error: 'Acesso não autorizado.' };
  return null;
}
