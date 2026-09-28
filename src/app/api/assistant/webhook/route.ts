import { NextResponse } from 'next/server';
import { assistantAccess } from '@/lib/assistant-access';

export async function POST(request: Request) {
  const denied = assistantAccess(process.env, request.headers.get('authorization'));
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status, headers: { 'Cache-Control': 'no-store' } });
  // A transport secret is not a verified user/phone binding. Fail closed until
  // that binding, durable idempotency and atomic writes are configured.
  return NextResponse.json({
    success: false,
    persisted: false,
    error: 'Vinculação do remetente e processamento persistente ainda não configurados. Nenhum dado foi alterado. Use o aplicativo para registrar.',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
