import type { ReactNode } from 'react';
import type { Block, Inline, PartDoc } from '@/lib/doc';
import { safeLink } from '@/lib/note-media';

// Renderização em React do documento já saneado: nenhum HTML de terceiros é injetado.
function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === 'hardBreak') return <br key={index} />;
    let content: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') content = <strong>{content}</strong>;
      else if (mark.type === 'italic') content = <em>{content}</em>;
      else if (mark.type === 'underline') content = <u>{content}</u>;
      else if (mark.type === 'strike') content = <s>{content}</s>;
      else if (mark.type === 'link' && safeLink(mark.href)) content = <a href={mark.href} target="_blank" rel="noopener noreferrer">{content}</a>;
    }
    return <span key={index}>{content}</span>;
  });
}

function block(node: Block, key: number, offset: number): ReactNode {
  switch (node.type) {
    case 'paragraph': return <p key={key}>{inline(node.content)}</p>;
    case 'heading': return node.level + offset <= 3 ? <h3 key={key}>{inline(node.content)}</h3> : <h4 key={key}>{inline(node.content)}</h4>;
    case 'bulletList': return <ul key={key}>{node.items.map((item, index) => <li key={index}>{item.map((child, childIndex) => block(child, childIndex, offset))}</li>)}</ul>;
    case 'orderedList': return <ol key={key}>{node.items.map((item, index) => <li key={index}>{item.map((child, childIndex) => block(child, childIndex, offset))}</li>)}</ol>;
    case 'blockquote': return <blockquote key={key}>{node.content.map((child, index) => block(child, index, offset))}</blockquote>;
    case 'horizontalRule': return <hr key={key} />;
  }
}

export function DocView({ doc, offset = 0, empty = 'Ainda sem texto.' }: { doc: PartDoc; offset?: number; empty?: string }) {
  if (!doc.content.length) return <p className="muted">{empty}</p>;
  return <>{doc.content.map((node, index) => block(node, index, offset))}</>;
}
