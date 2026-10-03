/** Optional device controls. This does not grant background microphone permission. */
export function callMediaControls(actions: { mute: () => void; end: () => void; audio: (on: boolean) => void }) {
  const media = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  if (!media) return { update: (_status: string, _muted: boolean) => {}, dispose: () => {} };
  type CallAction = MediaSessionAction | 'togglemicrophone' | 'hangup';
  // Older TypeScript DOM definitions omit these optional calling controls.
  const setHandler = media.setActionHandler.bind(media) as (name: CallAction, handler: (() => void) | null) => void;
  const supported: CallAction[] = [];
  const handlers: [CallAction, () => void][] = [['togglemicrophone', actions.mute], ['hangup', actions.end], ['stop', actions.end], ['play', () => actions.audio(true)], ['pause', () => actions.audio(false)]];
  for (const [name, callback] of handlers) try { setHandler(name, callback); supported.push(name); } catch { /* Optional actions differ across browsers. */ }
  return {
    update(status: string, muted: boolean) {
      try {
        if (typeof MediaMetadata !== 'undefined') media.metadata = new MediaMetadata({ title: 'Jornada Plena · conversa ao vivo', artist: muted ? 'Microfone desligado' : status, artwork: [{ src: '/brand/icone-512.png', sizes: '512x512', type: 'image/png' }] });
        media.playbackState = 'playing';
        const call = media as MediaSession & { setMicrophoneActive?: (active: boolean) => void };
        call.setMicrophoneActive?.(!muted);
      } catch { /* A device control must never prevent the call. */ }
    },
    dispose() {
      for (const name of supported) try { setHandler(name, null); } catch {}
      try { media.metadata = null; media.playbackState = 'none'; (media as MediaSession & { setMicrophoneActive?: (active: boolean) => void }).setMicrophoneActive?.(false); } catch {}
    },
  };
}
