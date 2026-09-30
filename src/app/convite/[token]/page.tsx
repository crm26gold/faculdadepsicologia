import type { Metadata } from 'next';
import { InviteCapture } from '@/components/community/invite-capture';

export const metadata: Metadata = { title: 'Convite · Jornada Plena' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteCapture token={/^[A-Za-z0-9_-]{20,200}$/.test(token) ? token : ''} />;
}
