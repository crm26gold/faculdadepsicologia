import { redirect } from 'next/navigation';
import { AccessGate } from '@/components/access-gate';
import { ownerSession } from '@/lib/supabase/server';
import { demoRequested, validConfiguration } from '@/lib/config';
import { applicationOrigin } from '@/lib/auth-input';

export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (demoRequested(process.env)) redirect('/');
  if (await ownerSession()) redirect('/');
  const params = await searchParams;
  return <AccessGate error={!!params.error} configured={!!applicationOrigin(process.env) && !!validConfiguration(process.env)} />;
}
