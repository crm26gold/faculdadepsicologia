import 'server-only';
import { unzipSync, strFromU8 } from 'fflate';
import { materialTypes, type MaterialMime } from './types';

// Reads the text of a course material on the Jornada's own server: nothing is sent to an AI to read it. PDF page by
// page, PowerPoint slide by slide (a slide counts as a page), Word and plain text as one flow. Scanned PDFs and
// images have no text to read: they come back empty and the material is marked "sem texto".
const CHUNK = 1500;
const MAX_CHUNKS = 2000;

export type MaterialPage = { page: number | null; text: string };
export type MaterialChunk = { position: number; page: number | null; text: string };
export class MaterialError extends Error {}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (value: string) => value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (whole, code: string) => {
  if (code[0] !== '#') return entities[code.toLowerCase()] ?? whole;
  const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
  return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
});
/** The text runs of an Office XML part, one line per paragraph. */
function officeText(xml: string, run: 'w:t' | 'a:t', paragraph: 'w:p' | 'a:p') {
  return xml.split(`</${paragraph}>`).map(part => [...part.matchAll(new RegExp(`<${run}(?:\\s[^>]*)?>([^<]*)</${run}>`, 'g'))].map(match => decode(match[1])).join(''))
    .map(line => line.trim()).filter(Boolean).join('\n');
}
function zipEntries(bytes: Uint8Array, wanted: (name: string) => boolean) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new MaterialError('O arquivo não é um documento do Office válido.');
  try { return unzipSync(bytes, { filter: file => wanted(file.name) && file.originalSize <= 50 * 1024 * 1024 }); }
  catch { throw new MaterialError('Não consegui abrir este documento. Ele pode estar corrompido ou protegido por senha.'); }
}

export async function extractMaterial(bytes: Uint8Array, mime: MaterialMime): Promise<MaterialPage[]> {
  const kind = materialTypes[mime];
  if (kind === 'pdf') {
    if (strFromU8(bytes.subarray(0, 5)) !== '%PDF-') throw new MaterialError('O arquivo não é um PDF válido.');
    const { extractText } = await import('unpdf');
    try {
      const { text } = await extractText(bytes, { mergePages: false });
      return text.map((page, index) => ({ page: index + 1, text: page }));
    } catch { throw new MaterialError('Não consegui ler este PDF. Ele pode estar protegido por senha ou corrompido.'); }
  }
  if (kind === 'docx') {
    const files = zipEntries(bytes, name => name === 'word/document.xml');
    if (!files['word/document.xml']) throw new MaterialError('O arquivo não é um documento do Word válido.');
    return [{ page: null, text: officeText(strFromU8(files['word/document.xml']), 'w:t', 'w:p') }];
  }
  if (kind === 'pptx') {
    const files = zipEntries(bytes, name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const slides = Object.keys(files).map(name => ({ name, number: Number(name.match(/slide(\d+)\.xml$/)![1]) })).sort((a, b) => a.number - b.number);
    if (!slides.length) throw new MaterialError('O arquivo não é uma apresentação do PowerPoint válida.');
    return slides.map(slide => ({ page: slide.number, text: officeText(strFromU8(files[slide.name]), 'a:t', 'a:p') }));
  }
  try { return [{ page: null, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }]; }
  catch { throw new MaterialError('O arquivo de texto precisa estar em UTF-8.'); }
}

/** Searchable pieces of about 1 500 characters, cut at paragraph or sentence ends, each keeping its page. */
export function chunkMaterial(pages: MaterialPage[]): MaterialChunk[] {
  const chunks: MaterialChunk[] = [];
  for (const { page, text } of pages) {
    let rest = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    while (rest) {
      if (chunks.length >= MAX_CHUNKS) throw new MaterialError('O texto deste arquivo é longo demais. Divida em partes menores.');
      let end = rest.length;
      if (end > CHUNK) {
        const window = rest.slice(0, CHUNK);
        const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. '));
        end = cut > CHUNK / 2 ? cut + 1 : (window.lastIndexOf(' ') > CHUNK / 2 ? window.lastIndexOf(' ') : CHUNK);
      }
      const piece = rest.slice(0, end).trim();
      if (piece) chunks.push({ position: chunks.length, page, text: piece });
      rest = rest.slice(end).trim();
    }
  }
  return chunks;
}

/** Below this much text a file is treated as having none to read (a scan, a photo, empty slides). */
export const hasText = (chunks: MaterialChunk[]) => chunks.reduce((total, chunk) => total + chunk.text.length, 0) >= 20;
