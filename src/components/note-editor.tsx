'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Heading2, Undo2, Redo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

export default function NoteEditor({ content, onChange, disabled }: { content: string; onChange: (html: string) => void; disabled: boolean }) {
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false })],
    content, immediatelyRender: false,
    editorProps: { attributes: { class: 'note-prose', 'aria-label': 'Conteúdo da anotação', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' } },
    onUpdate: ({ editor }) => change.current(editor.getHTML()),
  });
  useEffect(() => { editor?.setEditable(!disabled, false); }, [disabled, editor]);
  useEffect(() => {
    // A restored backup can keep the same note id but replace its contents.
    if (editor && editor.getHTML() !== content) editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);
  if (!editor) return <div className="editor-loading">Abrindo caderno…</div>;
  const tools = [
    { name: 'Negrito', Icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { name: 'Itálico', Icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { name: 'Subtítulo', Icon: Heading2, active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { name: 'Lista', Icon: List, active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { name: 'Lista numerada', Icon: ListOrdered, active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
  ];
  return <><div className="editor-toolbar" aria-label="Formatação">
    {tools.map(({ name, Icon, active, run }) => <button key={name} className="icon-button" title={name} aria-label={name} aria-pressed={active} disabled={disabled} onClick={run}><Icon aria-hidden="true" size={17} /></button>)}
    <span className="toolbar-separator" />
    <button className="icon-button" aria-label="Desfazer" disabled={disabled} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={17} aria-hidden="true" /></button>
    <button className="icon-button" aria-label="Refazer" disabled={disabled} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={17} aria-hidden="true" /></button>
  </div><EditorContent editor={editor} /></>;
}
