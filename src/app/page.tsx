import { WorkspaceApp } from '@/components/workspace-app';
import { AccessGate } from '@/components/access-gate';
import { ownerSession } from '@/lib/supabase/server';
import { demoAllowed, demoRequested, localPreviewAllowed, oauthConfiguration as validConfiguration } from '@/lib/config';
import { applicationOrigin } from '@/lib/auth-input';

export const dynamic = 'force-dynamic';
export default async function Home() {
  if (demoRequested(process.env)) return demoAllowed(process.env) ? <WorkspaceApp mode="demo" /> : <AccessGate configured={false} />;
  if (validConfiguration(process.env)) {
    const session = await ownerSession();
    if (session) return <WorkspaceApp mode={process.env.FACULDADE_CLOUD_WORKSPACE === 'true' ? 'cloud' : 'local'} authenticated hostedPreview={process.env.VERCEL_ENV === 'preview'} />;
    return <AccessGate configured={!!applicationOrigin(process.env)} />;
  }
  if (localPreviewAllowed(process.env)) return <WorkspaceApp mode="local" />;
  // Hosted deployments always require the owner session, including previews.
  return <AccessGate configured={false} />;
}
