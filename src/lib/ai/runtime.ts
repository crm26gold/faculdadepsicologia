import 'server-only';
import { openKey } from './crypto';
import type { AiConfig } from './providers';

export type SealedConfig = Omit<AiConfig, 'key' | 'alternatives'> & { key_ciphertext: string; alternatives?: SealedConfig[] };
/** Open only configured reserves from the database, never client-supplied credentials. */
export function runtimeConfig(runtime: SealedConfig): AiConfig {
  const configs = [runtime, ...(runtime.alternatives ?? []).slice(0, 2)]
    .flatMap(config => { try { const { key_ciphertext, alternatives: _reserves, ...metadata } = config; return [{ ...metadata, key: openKey(key_ciphertext) }]; } catch { return []; } });
  if (!configs.length) throw new Error('Não consegui abrir as chaves configuradas. Confira o cofre no painel.');
  return { ...configs[0], alternatives: configs.slice(1) };
}
