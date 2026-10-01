import { captureNote } from './capture';
import { saveLocalMedia } from './local-media-db';
import { mediaKind, mediaTypes } from './note-media';
import { uploadNoteMedia } from './upload-note-media';
import type { Workspace } from './workspace';

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const mediaHtml = (type: string, src: string, name: string) => ({
  image: `<p><img src="${src}" alt="${escape(name)}" width="100%"></p>`,
  video: `<p><video src="${src}" title="${escape(name)}" controls></video></p>`,
  audio: `<p><audio src="${src}" title="${escape(name)}" controls></audio></p>`,
})[mediaKind(type)];

// A retry reuses the same note and the same uploaded file instead of duplicating them.
export type CaptureDraft = { id: string; src: string };
type Options = {
  text: string; file: File | null; cloud: boolean; draft: CaptureDraft; signal?: AbortSignal;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  ensureSaved: () => Promise<void>;
};

// The text is saved first, so a failed upload never loses what the person wrote; the media is attached after.
export async function saveCapture({ text, file, cloud, draft, signal, update, ensureSaved }: Options) {
  const id = draft.id || crypto.randomUUID();
  const note = captureNote(text.trim() || file?.name || 'Nova anotação rápida', id, new Date().toISOString());
  if (!draft.id) {
    if (!update(previous => ({ ...previous, notes: [note, ...previous.notes] }))) throw new Error('Não foi possível registrar a ideia. Tente novamente.');
    draft.id = id;
  }
  await ensureSaved();
  let content = note.content;
  if (file) {
    if (cloud) {
      draft.src ||= await uploadNoteMedia(id, file, signal);
      content += mediaHtml(file.type, draft.src, file.name);
    } else {
      // Local mode keeps the real file in IndexedDB behind the same safe /api/note-media address.
      const localSrc = `/api/note-media/${crypto.randomUUID()}.${mediaTypes[file.type] || (file.type.startsWith('image/') ? 'png' : 'webm')}`;
      await saveLocalMedia(localSrc, file);
      content += mediaHtml(file.type, localSrc, file.name);
    }
  }
  if (!update(previous => ({ ...previous, notes: previous.notes.map(item => item.id === id ? { ...item, content, title: note.title, updatedAt: new Date().toISOString() } : item) }))) {
    throw new Error('Anexo enviado, mas a anotação não foi atualizada. Tente novamente.');
  }
  await ensureSaved();
  return { id, title: note.title };
}
