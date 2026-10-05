import { authorizationServer } from '@/lib/mcp/oauth';
import { preflight, withOrigin } from '@/lib/mcp/oauth-http';

export const dynamic = 'force-dynamic';
export const GET = () => withOrigin(authorizationServer);
export const OPTIONS = preflight;
