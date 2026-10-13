// Reduz a foto no próprio aparelho antes do envio: uma foto de celular de 4 MB viaja com algumas centenas de KB.
// GIF (animação) e arquivos que não ficariam menores seguem como estão; se o navegador não conseguir, vai o original.
export const shrinkable = (type: string) => ['image/jpeg', 'image/png', 'image/webp'].includes(type);

/** Largura e altura que cabem em `max` no lado maior, sem distorcer. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function shrinkImage(file: File, { maxSide = 2000, quality = 0.82 } = {}): Promise<File> {
  if (!shrinkable(file.type) || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return file; }
  const size = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); return file; }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  // O Safari não grava WebP pelo canvas e devolve PNG sem avisar; aí a foto vira JPEG. PNG com transparência fica como está.
  let blob = await encode('image/webp');
  if (blob?.type !== 'image/webp') blob = file.type === 'image/png' ? null : await encode('image/jpeg');
  if (!blob || blob.size >= file.size) return file;
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `${file.name.replace(/\.[^.]*$/, '') || 'foto'}.${ext}`, { type: blob.type, lastModified: file.lastModified });
}
