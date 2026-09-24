import { demoRequested } from '@/lib/config';

// The legacy password entry point is intentionally retired.
export async function POST() {
  return new Response('Acesso por senha indisponível. Use o Google.', {
    status: demoRequested(process.env) ? 404 : 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}
