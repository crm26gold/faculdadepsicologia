import { LIVE_SOCKET, liveClientSetup } from './protocol';
import { liveCloseFailure, liveSocketFailure, type SocketDiagnostic } from './socket-failure';

export type LiveCheck = { connected: boolean; stage: 'setup' | 'transport' | 'timeout'; code?: number; diagnostic?: SocketDiagnostic };
/** No microphone, transcript, text turn or tool execution: close immediately after setupComplete. */
export async function checkGeminiSession(credentials: { token: string; model: string }, signal?: AbortSignal): Promise<LiveCheck> {
  signal?.throwIfAborted();
  return new Promise(resolve => {
    const socket = new WebSocket(`${LIVE_SOCKET}?access_token=${encodeURIComponent(credentials.token)}`);
    let settled = false;
    const finish = (result: LiveCheck) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted);
      socket.onopen = null; socket.onmessage = null; socket.onclose = null;
      // Keep the error listener while a CONNECTING socket finishes closing.
      try { socket.close(); } catch {}
      resolve(result);
    };
    const aborted = () => finish({ connected: false, stage: 'timeout' });
    const timer = setTimeout(aborted, 15_000);
    signal?.addEventListener('abort', aborted, { once: true });
    socket.onopen = () => socket.send(JSON.stringify({ setup: liveClientSetup(credentials.model) }));
    socket.onmessage = async event => {
      try {
        const value = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(await (event.data as Blob).arrayBuffer()).toString());
        if (value.setupComplete) finish({ connected: true, stage: 'setup' });
        else if (value.error) {
          const safe = await liveSocketFailure(value.error);
          finish({ connected: false, stage: 'setup', diagnostic: safe.diagnostic });
        }
      } catch { finish({ connected: false, stage: 'transport' }); }
    };
    socket.onerror = () => finish({ connected: false, stage: 'transport' });
    socket.onclose = async event => {
      const safe = await liveCloseFailure(event.code, event.reason);
      finish({ connected: false, stage: 'setup', code: event.code, diagnostic: safe.diagnostic });
    };
  });
}
