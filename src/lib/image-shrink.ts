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

/** Recorte quadrado do centro: a parte que aparece num avatar redondo. */
export function centerSquare(width: number, height: number) {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
}

/** Miniatura do avatar (128 px, quadrada) como data URL de até `limit` caracteres, ou null se não couber. */
export async function avatarThumbnail(file: Blob, { side = 128, limit = 16000 } = {}): Promise<string | null> {
  if (!shrinkable(file.type) || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return null; }
  const crop = centerSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = side; canvas.height = side;
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); return null; }
  context.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, side, side);
  bitmap.close();
  for (const quality of [0.8, 0.65, 0.5]) {
    let url = canvas.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= limit) return url;
  }
  return null;
}

export type PostPhoto = { data: string; mime: 'image/jpeg' | 'image/webp'; width: number; height: number; url: string };

/** Foto de publicação ou story: até 1440 px e até `limit` bytes, em WebP (JPEG no Safari). Null se não der para usar. */
export async function postPhoto(file: Blob, { limit = 300 * 1024 } = {}): Promise<PostPhoto | null> {
  if (!shrinkable(file.type) || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return null; }
  try {
    for (const [maxSide, quality] of [[1440, 0.8], [1440, 0.65], [1080, 0.6], [800, 0.55]]) {
      const size = fitWithin(bitmap.width, bitmap.height, maxSide);
      const canvas = document.createElement('canvas');
      canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      let url = canvas.toDataURL('image/webp', quality);
      if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality);
      const data = url.slice(url.indexOf(',') + 1);
      if (data.length / 4 * 3 <= limit) return { data, mime: url.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', width: size.width, height: size.height, url };
    }
    return null;
  } finally { bitmap.close(); }
}
