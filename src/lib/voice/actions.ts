import { z } from 'zod';
import { proposedActions } from '../assistant-jobs';

/** Invalid supplied JSON must not silently trigger a billable planner or a partial mutation. */
export function voiceActionRequest(args: unknown) {
  const parsed = z.object({ instruction: z.string().trim().min(1).max(2000), actions_json: z.string().max(120_000).optional() }).safeParse(args);
  if (!parsed.success) throw new Error('O comando de voz está incompleto ou grande demais. Nenhuma alteração foi enviada.');
  if (parsed.data.actions_json === undefined) return { instruction: parsed.data.instruction };
  try {
    const actions = proposedActions.parse(JSON.parse(parsed.data.actions_json));
    return { instruction: parsed.data.instruction, actions };
  } catch {
    throw new Error('A ação estruturada está inválida. Nenhuma alteração foi enviada. Consulte os dados e envie até oito ações completas, ou peça esclarecimento à pessoa.');
  }
}
