'use client';

/** Chamada às rotas coletivas: GET sem corpo, POST com ação validada no servidor. */
export async function api<T = unknown>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let result: { data?: T; error?: string } = {};
  try { result = await response.json(); } catch { /* resposta sem corpo */ }
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir. Verifique a conexão e tente novamente.');
  return result.data as T;
}

export const PENDING_INVITE_KEY = 'jornada-plena:pending-invite';

export function formatDay(value: string | null, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!value) return '';
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', options);
}
