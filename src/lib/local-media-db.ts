// Client-side IndexedDB persistence for offline/local notes media (photos, class audios)

const DB_NAME = 'faculdade-psi-media-v1';
const STORE_NAME = 'media-blobs';

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB não suportado neste ambiente'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalMedia(src: string, blob: Blob | File): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, src);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.warn('Falha ao persistir mídia local no IndexedDB:', error);
  }
}

export async function getLocalMedia(src: string): Promise<Blob | null> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(src);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteLocalMedia(src: string): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(src);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore error
  }
}

/**
 * Attaches a capture-phase error listener to resolve local /api/note-media
 * URLs to IndexedDB Blobs when network requests fail (e.g. offline or local mode).
 */
export function attachLocalMediaFallback(container: HTMLElement): () => void {
  const objectUrls: string[] = [];

  const handleError = async (event: Event) => {
    const el = event.target as HTMLImageElement | HTMLAudioElement | null;
    if (!el || !(el instanceof HTMLImageElement || el instanceof HTMLAudioElement)) return;
    const initialSrc = el.getAttribute('src');
    if (!initialSrc || !initialSrc.startsWith('/api/note-media/')) return;
    if (el.dataset.localResolved === 'true') return;

    const blob = await getLocalMedia(initialSrc);
    if (blob) {
      el.dataset.localResolved = 'true';
      const objUrl = URL.createObjectURL(blob);
      objectUrls.push(objUrl);
      el.src = objUrl;
      if (el instanceof HTMLAudioElement) {
        el.load();
      }
    }
  };

  container.addEventListener('error', handleError, true);

  return () => {
    container.removeEventListener('error', handleError, true);
    objectUrls.forEach(url => URL.revokeObjectURL(url));
  };
}
