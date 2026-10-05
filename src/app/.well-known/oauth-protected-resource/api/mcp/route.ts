// RFC 9728: metadata for the resource path /api/mcp.
import { protectedResource } from '@/lib/mcp/oauth';
import { preflight, withOrigin } from '@/lib/mcp/oauth-http';

export const dynamic = 'force-dynamic';
export const GET = () => withOrigin(protectedResource);
export const OPTIONS = preflight;
