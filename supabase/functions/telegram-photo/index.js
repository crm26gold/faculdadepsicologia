// Service-to-service only. The private server secret is checked in Postgres before privileged storage.
export function photoHandler(config, requestFetch = fetch) {
  const answer = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  return async request => {
    if (request.method !== 'POST') return answer({ error: 'Method not allowed' }, 405);
    const secret = request.headers.get('x-jornada-server-secret') || '';
    if (!/^[a-f0-9]{64}$/.test(secret)) return answer({ error: 'Not authorized' }, 401);
    const chat = request.headers.get('x-telegram-chat') || '', update = request.headers.get('x-telegram-update') || '';
    if (!/^-?\d{1,25}$/.test(chat) || !/^\d{1,25}$/.test(update)) return answer({ error: 'Invalid reference' }, 400);
    try {
      const allowed = await requestFetch(`${config.url}/rest/v1/rpc/bot_attachment_owner`, { method: 'POST', headers: { apikey: config.service, Authorization: `Bearer ${config.service}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_secret: secret, chat, update_ref: update }), signal: AbortSignal.timeout(10_000) });
      const person = allowed.ok ? await allowed.json() : null;
      if (typeof person !== 'string' || !/^[a-f0-9-]{36}$/.test(person)) return answer({ error: 'Not authorized' }, 401);
      const declared = Number(request.headers.get('content-length') || 0);
      if (declared > 4_000_000) return answer({ error: 'Photo too large' }, 413);
      const reader = request.body?.getReader();
      if (!reader) return answer({ error: 'Empty photo' }, 400);
      const chunks = []; let length = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 4_000_000) { await reader.cancel(); return answer({ error: 'Photo too large' }, 413); } chunks.push(value); }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      // Telegram's photo field supplies JPEG; reject disguised content and arbitrary MIME types.
      if (length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return answer({ error: 'Invalid photo' }, 400);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${person}:telegram:${update}`)));
      const hex = [...digest.slice(0, 16)].map(value => value.toString(16).padStart(2, '0')).join('');
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
      const file = `${id}.jpg`;
      const stored = await requestFetch(`${config.url}/storage/v1/object/note-attachments/${person}/${file}`, { method: 'POST',
        headers: { apikey: config.service, Authorization: `Bearer ${config.service}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: bytes, signal: AbortSignal.timeout(15_000) });
      if (!stored.ok) return answer({ error: 'Could not store photo' }, 502);
      return answer({ id, src: `/api/note-media/${file}` });
    } catch { return answer({ error: 'Attachment unavailable' }, 502); }
  };
}
if (typeof Deno !== 'undefined') Deno.serve(photoHandler({ url: Deno.env.get('SUPABASE_URL'), service: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }));
