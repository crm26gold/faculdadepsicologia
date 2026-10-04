import { createPrivateKey } from 'node:crypto';
import type { AiProviderId } from './catalog';

/** Validate structure before sealing; never include credential fragments in errors. */
export function credentialIssue(provider: AiProviderId, key: string): string | null {
  if (provider !== 'vertex') return /[\r\n\s]/.test(key) ? 'Cole apenas a chave, sem espaços ou quebras de linha.' : null;
  try {
    const account = JSON.parse(key);
    if (account.type !== 'service_account' || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(account.client_email ?? '') || typeof account.private_key !== 'string') throw new Error();
    const parsed = createPrivateKey(account.private_key);
    if (parsed.asymmetricKeyType !== 'rsa') throw new Error();
    return null;
  } catch { return 'Use o JSON completo de uma conta de serviço Google, com e-mail e chave RSA válidos.'; }
}
