import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { validConfiguration } from '@/lib/config';

// No user session here: every call goes to a bot_* function that checks the server secret
// and reaches only the account linked to that conversation.
export function botDatabase() {
  if (!validConfiguration(process.env)) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
