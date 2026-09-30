'use client';
import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Quote, Redo2, Strikethrough, Underline, Undo2 } from 'lucide-react';
import { sanitizeDoc, toEditorJson, type PartDoc } from '@/lib/doc';
import { safeLink } from '@/lib/note-media';

// Editor enxuto das partes: só estrutura (títulos, listas, destaque). A formatação final
// (fonte, tamanho, espaçamento) vem do padrão definido no trabalho, igual para todos.
export default function PartEditor({ value, onChange, disabled, label }: { value: PartDoc; onChange: (doc: PartDoc) => void; disabled: boolean; label: string }) {
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  const editor = useEditor({
    extensions: [StarterKit.configure({
      heading: { levels: [2, 3] }, codeBlock: false, code: false,
      link: { openOnClick: false, autolink: true, isAllowedUri: safeLink, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
    })],
    content: toEditorJson(value), immediatelyRender: false, editable: !disabled,
    editorProps: { attributes: { class: 'part-prose', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true', lang: 'pt-BR' } },
    onUpdate: ({ editor }) => change.current(sanitizeDoc(editor.getJSON())),
  });
  const state = useEditorState({ editor, selector: () => editor ? {
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), underline: editor.isActive('underline'), strike: editor.isActive('strike'),
    h2: editor.isActive('heading', { level: 2 }), h3: editor.isActive('heading', { level: 3 }),
    bullet: editor.isActive('bulletList'), ordered: editor.isActive('orderedList'), quote: editor.isActive('blockquote'),
    undo: editor.can().undo(), redo: editor.can().redo(), words: editor.getText().trim().split(/\s+/).filter(Boolean).length,
  } : null });
  useEffect(() => { editor?.setEditable(!disabled, false); }, [disabled, editor]);
  if (!editor || !state) return <div className="editor-loading">Abrindo editor…</div>;
  const tools = [
    { name: 'Negrito', Icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { name: 'Itálico', Icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { name: 'Sublinhado', Icon: Underline, active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { name: 'Tachado', Icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { name: 'Título', Icon: Heading2, active: state.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { name: 'Subtítulo', Icon: Heading3, active: state.h3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { name: 'Lista', Icon: List, active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { name: 'Lista numerada', Icon: ListOrdered, active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { name: 'Citação', Icon: Quote, active: state.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
  ];
  return <div className="part-editor">
    <div className="part-toolbar" role="group" aria-label="Formatação da parte">
      {tools.map(({ name, Icon, active, run }) => <button key={name} type="button" className="icon-button" title={name} aria-label={name} aria-pressed={active} disabled={disabled} onClick={run}><Icon size={18} aria-hidden="true" /></button>)}
      <button type="button" className="icon-button" aria-label="Desfazer" disabled={disabled || !state.undo} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={18} aria-hidden="true" /></button>
      <button type="button" className="icon-button" aria-label="Refazer" disabled={disabled || !state.redo} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={18} aria-hidden="true" /></button>
    </div>
    <EditorContent editor={editor} />
    <p className="part-editor-footer"><span>{state.words} palavras</span><span>Cole do Word ou Docs à vontade: fontes e cores são padronizadas.</span></p>
  </div>;
}
