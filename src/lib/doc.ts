// Documento das partes de um trabalho em grupo (JSON do editor). Todo conteúdo que chega
// de outra pessoa é reconstruído aqui só com blocos e marcas permitidos: sem fontes, cores,
// estilos, HTML ou atributos soltos. Isso padroniza o texto e impede injeção entre membros.
import { safeLink } from './note-media';

export type Mark = { type: 'bold' | 'italic' | 'underline' | 'strike' } | { type: 'link'; href: string };
export type Inline = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };
export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; level: 2 | 3; content: Inline[] }
  | { type: 'bulletList' | 'orderedList'; items: Block[][] }
  | { type: 'blockquote'; content: Block[] }
  | { type: 'horizontalRule' };
export type PartDoc = { type: 'doc'; content: Block[] };

export const DOC_LIMIT = 250_000;
export const emptyDoc = (): PartDoc => ({ type: 'doc', content: [] });
const simpleMarks = new Set(['bold', 'italic', 'underline', 'strike']);
type Raw = { type?: unknown; text?: unknown; marks?: unknown; content?: unknown; attrs?: unknown; href?: unknown; level?: unknown };
const record = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value.slice(0, 2000) : []);

function marks(value: unknown): Mark[] {
  const result: Mark[] = [];
  for (const item of list(value)) {
    const mark = record(item);
    if (typeof mark.type !== 'string') continue;
    if (simpleMarks.has(mark.type)) result.push({ type: mark.type as 'bold' });
    else if (mark.type === 'link') {
      const href = String(record(mark.attrs as unknown).href ?? '');
      if (safeLink(href)) result.push({ type: 'link', href });
    }
  }
  return result;
}

function inlines(value: unknown): Inline[] {
  const result: Inline[] = [];
  for (const item of list(value)) {
    const node = record(item);
    if (node.type === 'text' && typeof node.text === 'string' && node.text) {
      const applied = marks(node.marks);
      result.push(applied.length ? { type: 'text', text: node.text, marks: applied } : { type: 'text', text: node.text });
    } else if (node.type === 'hardBreak') result.push({ type: 'hardBreak' });
  }
  return result;
}

function blocks(value: unknown, depth: number): Block[] {
  if (depth > 6) return [];
  const result: Block[] = [];
  for (const item of list(value)) {
    const node = record(item);
    switch (node.type) {
      case 'paragraph': result.push({ type: 'paragraph', content: inlines(node.content) }); break;
      case 'heading': {
        const level = Number(record(node.attrs).level) >= 3 ? 3 : 2;
        result.push({ type: 'heading', level, content: inlines(node.content) });
        break;
      }
      case 'bulletList': case 'orderedList':
        result.push({ type: node.type, items: list(node.content).filter(child => record(child).type === 'listItem').map(child => blocks(record(child).content, depth + 1)) });
        break;
      case 'blockquote': result.push({ type: 'blockquote', content: blocks(node.content, depth + 1) }); break;
      case 'horizontalRule': result.push({ type: 'horizontalRule' }); break;
      // Títulos de nível 1, código e tabelas viram parágrafos simples para manter o padrão.
      case 'codeBlock': result.push({ type: 'paragraph', content: inlines(node.content) }); break;
      default: break;
    }
  }
  return result;
}

/** Reconstrói um documento seguro a partir de qualquer entrada. Nunca lança. */
export function sanitizeDoc(value: unknown): PartDoc {
  const root = record(value);
  return { type: 'doc', content: root.type === 'doc' ? blocks(root.content, 0) : [] };
}

/** Converte o documento seguro de volta ao formato do editor (TipTap). */
export function toEditorJson(doc: PartDoc): Record<string, unknown> {
  const inline = (node: Inline) => node.type === 'hardBreak' ? { type: 'hardBreak' } : {
    type: 'text', text: node.text,
    ...(node.marks?.length ? { marks: node.marks.map(mark => mark.type === 'link' ? { type: 'link', attrs: { href: mark.href } } : { type: mark.type }) } : {}),
  };
  const block = (node: Block): Record<string, unknown> => {
    switch (node.type) {
      case 'paragraph': return { type: 'paragraph', content: node.content.map(inline) };
      case 'heading': return { type: 'heading', attrs: { level: node.level }, content: node.content.map(inline) };
      case 'bulletList': case 'orderedList': return { type: node.type, content: node.items.map(item => ({ type: 'listItem', content: item.length ? item.map(block) : [{ type: 'paragraph' }] })) };
      case 'blockquote': return { type: 'blockquote', content: node.content.map(block) };
      case 'horizontalRule': return { type: 'horizontalRule' };
    }
  };
  return { type: 'doc', content: doc.content.map(block) };
}

export function docText(doc: PartDoc): string {
  const inline = (nodes: Inline[]) => nodes.map(node => node.type === 'text' ? node.text : '\n').join('');
  const block = (node: Block): string => {
    switch (node.type) {
      case 'paragraph': case 'heading': return inline(node.content);
      case 'bulletList': case 'orderedList': return node.items.map(item => item.map(block).join('\n')).join('\n');
      case 'blockquote': return node.content.map(block).join('\n');
      case 'horizontalRule': return '';
    }
  };
  return doc.content.map(block).join('\n').trim();
}

export const wordCount = (doc: PartDoc) => docText(doc).split(/\s+/).filter(Boolean).length;
export const docIsEmpty = (doc: PartDoc) => !docText(doc);

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** HTML padronizado para copiar ao Google Docs ou imprimir. Todo texto é escapado. */
export function docToHtml(doc: PartDoc, headingOffset = 0): string {
  const inline = (nodes: Inline[]) => nodes.map(node => {
    if (node.type === 'hardBreak') return '<br>';
    let html = escapeHtml(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') html = `<strong>${html}</strong>`;
      else if (mark.type === 'italic') html = `<em>${html}</em>`;
      else if (mark.type === 'underline') html = `<u>${html}</u>`;
      else if (mark.type === 'strike') html = `<s>${html}</s>`;
      else if (mark.type === 'link' && safeLink(mark.href)) html = `<a href="${escapeHtml(mark.href)}">${html}</a>`;
    }
    return html;
  }).join('');
  const block = (node: Block): string => {
    switch (node.type) {
      case 'paragraph': return `<p>${inline(node.content)}</p>`;
      case 'heading': { const tag = `h${Math.min(6, node.level + headingOffset)}`; return `<${tag}>${inline(node.content)}</${tag}>`; }
      case 'bulletList': case 'orderedList': {
        const tag = node.type === 'bulletList' ? 'ul' : 'ol';
        return `<${tag}>${node.items.map(item => `<li>${item.map(block).join('')}</li>`).join('')}</${tag}>`;
      }
      case 'blockquote': return `<blockquote>${node.content.map(block).join('')}</blockquote>`;
      case 'horizontalRule': return '<hr>';
    }
  };
  return doc.content.map(block).join('');
}
