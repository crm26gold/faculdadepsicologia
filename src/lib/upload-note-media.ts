import { safeMediaSource, validMedia } from './note-media';

export async function uploadNoteMedia(noteId: string, file: File, signal?: AbortSignal) {
  if (!validMedia(file.type, file.size)) throw new Error('Use imagem, áudio ou vídeo compatível de até 25 MB.');
  const response = await fetch('/api/note-media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noteId, type: file.type, size: file.size }), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível preparar o anexo.');
  const src = safeMediaSource(result.src);
  if (!src) throw new Error('Resposta de anexo inválida.');
  const payload = new FormData(); payload.append('cacheControl', '0'); payload.append('', file);
  const uploaded = await fetch(result.uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: payload, signal });
  if (!uploaded.ok) throw new Error('Envio falhou. O arquivo continua selecionado; tente novamente.');
  return src;
}
