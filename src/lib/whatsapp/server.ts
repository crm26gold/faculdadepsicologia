import 'server-only';
import { botDatabase } from '../supabase/bot';
import { whatsappServerSecret } from '../bot/secrets';

export async function whatsappRpc(token: string, operation: string, payload: Record<string, unknown> = {}) {
  const database = botDatabase();
  if (!database) throw new Error('Conexão da Jornada não configurada.');
  return database.rpc('whatsapp_server', { server_secret: whatsappServerSecret(), bridge_token: token, operation, payload });
}
