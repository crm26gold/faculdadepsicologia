import 'server-only';
import type { AiProviderId } from './catalog';
import type { AiFailureKind } from './provider-failure';
import { botDatabase } from '../supabase/bot';
import { botServerSecret } from '../bot/secrets';

// "Caiu o Google, passou para a Groq, me avisa no painel": each failed attempt in a request is reported once,
// without content, key or person. Reporting never delays or breaks the answer.
export type RouteFailure = { provider: AiProviderId; kind: AiFailureKind };
export type RouteTask = 'assistente' | 'organizar' | 'voz' | 'transcricao' | 'teste';
export async function reportFallbacks(task: RouteTask, failures: RouteFailure[], served: AiProviderId | null) {
  if (!failures.length) return;
  try {
    const db = botDatabase();
    if (!db) return;
    await db.rpc('ai_report_fallbacks', { server_secret: botServerSecret(), task_id: task, failures: failures.slice(0, 8), served });
  } catch { /* The route already answered; a missing report only hides one alert. */ }
}
