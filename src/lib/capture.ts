import type { Note } from './workspace';

export const CAPTURE_LIMIT = 10_000;
export function isUnorganized(note: Note) {
  return !note.subjectId && !note.areaId && !note.notebookId;
}
export function captureNote(text: string, id: string, now: string): Note {
  const value = text.trim();
  if (!value || value.length > CAPTURE_LIMIT) throw new Error('Escreva de 1 a 10.000 caracteres.');
  const escape = (line: string) => line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  return { id, title: value.split(/\r?\n/)[0].slice(0, 100).replace(/[\uD800-\uDBFF]$/, ''),
    subjectId: '', areaId: '', notebookId: '', updatedAt: now,
    content: value.split(/\r?\n/).map(line => `<p>${escape(line)}</p>`).join('') };
}
