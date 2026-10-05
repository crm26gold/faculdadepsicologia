import 'server-only';
import { openKey } from './crypto';
import type { AiConfig } from './providers';
import type { userSession } from '../supabase/server';
import type { AiTaskId } from './catalog';
import { botServerSecret } from '../bot/secrets';
import { configureBudgetGuard } from './budget';

export type SealedConfig = Omit<AiConfig, 'key' | 'alternatives'> & { key_ciphertext: string; alternatives?: SealedConfig[] };
/** Members' runtime is server-only; the legacy RPC remains restricted to the owner. */
export async function runtimeForSession(session: NonNullable<Awaited<ReturnType<typeof userSession>>>, task: AiTaskId) {
  let proof:string;
  try {proof=botServerSecret();}
  catch {return {data:null,error:{code:'PGRST000',message:'O cofre da IA está indisponível no servidor.',details:'',hint:''}};}
  const params = { server_secret: proof, task_id: task };
  let result = await session.client.rpc('ai_runtime_for_current', params);
  if (result.error?.code === '42501') {
    const configured = await configureBudgetGuard(session);
    if (!configured.error) result = await session.client.rpc('ai_runtime_for_current', params);
  }
  return ['PGRST202', '42883'].includes(result.error?.code ?? '') ? session.client.rpc('ai_runtime', { task_id: task }) : result;
}
/** Open only configured reserves from the database, never client-supplied credentials. */
export function runtimeConfig(runtime: SealedConfig): AiConfig {
  const configs = [runtime, ...(runtime.alternatives ?? []).slice(0, 7)]
    .flatMap(config => { try { const { key_ciphertext, alternatives: _reserves, ...metadata } = config; return [{ ...metadata, key: openKey(key_ciphertext) }]; } catch { return []; } });
  if (!configs.length) throw new Error('Não consegui abrir as chaves configuradas. Confira o cofre no painel.');
  return { ...configs[0], routing: runtime.routing, alternatives: configs.slice(1) };
}
