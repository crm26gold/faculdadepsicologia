'use client';
import { MobileDisclosure } from './mobile-disclosure';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import type { SelectionBookmark } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Undo2, Redo2, AlignLeft, AlignCenter, AlignRight, Highlighter, Link2, ImagePlus, Camera, AudioLines, Clapperboard, Table2, Quote, Eraser } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from './modal';
import { NoteSpelling } from './note-spelling';
import { NoteImage, NoteAudio, NoteVideo, SpellingMarks } from './note-extensions';
import { mediaKind, mediaTypes, safeLink, safeMediaSource, validMedia } from '@/lib/note-media';
import { attachLocalMediaFallback, saveLocalMedia } from '@/lib/local-media-db';

export default function NoteEditor({ content, onChange, disabled, noteId, cloud = false, demo = false }: {
  content: string; onChange: (html: string) => void; disabled: boolean; noteId: string; cloud?: boolean; demo?: boolean;
}) {
  const change = useRef(onChange);
  const insertFile = useRef<(file: File) => void>(() => {});
  const bookmark = useRef<SelectionBookmark | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkError, setLinkError] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => { change.current = onChange; }, [onChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (!demo && !cloud && canvasRef.current) {
      return attachLocalMediaFallback(canvasRef.current);
    }
  }, [content, cloud, demo]);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true, isAllowedUri: safeLink, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } } }),
      TextStyleKit, TextAlign.configure({ types: ['heading', 'paragraph'] }), Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: false } }), NoteImage, NoteAudio, NoteVideo, SpellingMarks],
    content, immediatelyRender: false,
    editorProps: {
      attributes: { class: 'note-prose', 'aria-label': 'Conteúdo da anotação', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true', lang: 'pt-BR' },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? [])[0];
        if (!file) return false;
        event.preventDefault(); bookmark.current = null; insertFile.current(file); return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const file = event.dataTransfer?.files[0];
        if (!file || moved) return false;
        event.preventDefault();
        const point = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (point) editor?.commands.setTextSelection(point.pos);
        bookmark.current = null; insertFile.current(file); return true;
      },
    },
    onUpdate: ({ editor }) => change.current(editor.getHTML()),
    onTransaction: ({ transaction }) => { if (bookmark.current) bookmark.current = bookmark.current.map(transaction.mapping); },
  });
  const state = useEditorState({ editor, selector: () => editor ? {
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), underline: editor.isActive('underline'), strike: editor.isActive('strike'),
    bulletList: editor.isActive('bulletList'), orderedList: editor.isActive('orderedList'), highlight: editor.isActive('highlight'), blockquote: editor.isActive('blockquote'),
    heading: editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : '0',
    fontSize: editor.getAttributes('textStyle').fontSize || '18px', fontFamily: editor.getAttributes('textStyle').fontFamily || 'inherit',
    table: editor.isActive('table'), image: editor.isActive('noteImage'), audio: editor.isActive('noteAudio') || editor.isActive('noteVideo'),
    undo: editor.can().undo(), redo: editor.can().redo(), words: editor.getText().trim().split(/\s+/).filter(Boolean).length,
  } : null });
  useEffect(() => { editor?.setEditable(!disabled && !busy, false); }, [disabled, busy, editor]);
  useEffect(() => {
    if (editor && editor.getHTML() !== content) editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);
  useEffect(() => {
    insertFile.current = async file => {
      if (!editor || disabled || controller.current) return;
      if (demo) { setMessage('Anexos indisponíveis na demonstração.'); return; }
      if (!validMedia(file.type, file.size)) { setMessage('Use imagem (JPG, PNG, WebP, GIF), áudio (MP3, M4A, WAV, OGG, WebM) ou vídeo (MP4, WebM, MOV), até 25 MB.'); return; }
      if (!cloud) {
        bookmark.current ??= editor.state.selection.getBookmark();
        const fileId = crypto.randomUUID();
        const ext = mediaTypes[file.type] || (file.type.startsWith('image/') ? 'png' : 'webm');
        const localSrc = `/api/note-media/${fileId}.${ext}`;
        try { await saveLocalMedia(localSrc, file); }
        catch { bookmark.current = null; setMessage('Falha ao guardar mídia local. Nada foi anexado; preserve seu arquivo e tente novamente.'); return; }
        if (!mounted.current || editor.isDestroyed) return;
        const position = bookmark.current?.resolve(editor.state.doc).from ?? editor.state.selection.from;
        editor.chain().focus().insertContentAt(position, {
          type: { image: 'noteImage', audio: 'noteAudio', video: 'noteVideo' }[mediaKind(file.type)],
          attrs: { src: localSrc, alt: file.name, title: file.name },
        }).run();
        bookmark.current = null;
        setMessage('Anexo guardado localmente no caderno.');
        return;
      }
      bookmark.current ??= editor.state.selection.getBookmark();
      const abort = new AbortController(); controller.current = abort;
      setBusy(true); setMessage('Enviando anexo privado… aguarde antes de sair desta anotação.');
      try {
        const response = await fetch('/api/note-media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noteId, type: file.type, size: file.size }), signal: abort.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível preparar o anexo.');
        if (!safeMediaSource(result.src)) throw new Error('Resposta de anexo inválida.');
        const payload = new FormData(); payload.append('cacheControl', '0'); payload.append('', file);
        const uploaded = await fetch(result.uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: payload, signal: abort.signal });
        if (!uploaded.ok) throw new Error('O envio falhou. Seu texto foi preservado; tente anexar novamente.');
        if (!mounted.current || editor.isDestroyed) return;
        const position = bookmark.current?.resolve(editor.state.doc).from ?? editor.state.selection.from;
        editor.chain().focus().insertContentAt(position, { type: { image: 'noteImage', audio: 'noteAudio', video: 'noteVideo' }[mediaKind(file.type)], attrs: { src: result.src, alt: file.name, title: file.name } }).run();
        setMessage('Anexo inserido. Aguarde o indicador de sincronização da anotação.');
      } catch (error) {
        if (mounted.current && !abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha ao enviar anexo.');
      } finally {
        controller.current = null; bookmark.current = null;
        if (mounted.current) setBusy(false);
      }
    };
  }, [editor, cloud, disabled, noteId, demo]);
  if (!editor || !state) return <div className="editor-loading">Abrindo caderno…</div>;
  const locked = disabled || busy;
  const tools = [
    { name: 'Negrito', Icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { name: 'Itálico', Icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { name: 'Sublinhado', Icon: Underline, active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { name: 'Tachado', Icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { name: 'Marca-texto', Icon: Highlighter, active: state.highlight, run: () => editor.chain().focus().toggleHighlight({ color: '#fff1a8' }).run() },
    { name: 'Lista', Icon: List, active: state.bulletList, run: () => editor.chain().focus().toggleBulletList().run() },
    { name: 'Lista numerada', Icon: ListOrdered, active: state.orderedList, run: () => editor.chain().focus().toggleOrderedList().run() },
    { name: 'Citação', Icon: Quote, active: state.blockquote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { name: 'Alinhar à esquerda', Icon: AlignLeft, run: () => editor.chain().focus().setTextAlign('left').run() },
    { name: 'Centralizar', Icon: AlignCenter, run: () => editor.chain().focus().setTextAlign('center').run() },
    { name: 'Alinhar à direita', Icon: AlignRight, run: () => editor.chain().focus().setTextAlign('right').run() },
    { name: 'Limpar formatação', Icon: Eraser, run: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
  ];
  function pick(input: HTMLInputElement | null) { bookmark.current = editor!.state.selection.getBookmark(); input?.click(); }
  function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('url') ?? '').trim();
    if (!safeLink(value)) { setLinkError('Use um endereço completo https://, http:// ou mailto:.'); return; }
    const selection = bookmark.current?.resolve(editor!.state.doc);
    if (selection) editor!.commands.setTextSelection({ from: selection.from, to: selection.to });
    if (editor!.state.selection.empty && !editor!.isActive('link')) editor!.chain().focus().insertContent({ type: 'text', text: value, marks: [{ type: 'link', attrs: { href: value } }] }).run();
    else editor!.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    bookmark.current = null; setLinkOpen(false);
  }
  return <div className="rich-notebook">
    <MobileDisclosure label="Formatação do texto">
    <div className="editor-toolbar" role="group" aria-label="Formatação">
      <select aria-label="Estilo do parágrafo" value={state.heading} disabled={locked} onChange={event => { const level = Number(event.target.value); if (level) editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run(); else editor.chain().focus().setParagraph().run(); }}><option value="0">Texto normal</option><option value="1">Título 1</option><option value="2">Subtítulo</option><option value="3">Título 3</option></select>
      <select aria-label="Fonte" value={state.fontFamily} disabled={locked} onChange={event => editor.chain().focus().setFontFamily(event.target.value).run()}><option value="inherit">DM Sans</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="monospace">Monoespaçada</option></select>
      <select aria-label="Tamanho da letra" value={state.fontSize} disabled={locked} onChange={event => editor.chain().focus().setFontSize(event.target.value).run()}>{[14,16,18,20,24,28,32].map(size => <option key={size} value={`${size}px`}>{size}</option>)}</select>
      {tools.map(({ name, Icon, active, run }) => <button key={name} className="icon-button" title={name} aria-label={name} aria-pressed={active} disabled={locked} onClick={run}><Icon size={19} aria-hidden="true" /></button>)}
      <label className="editor-color" title="Cor do texto"><span className="sr-only">Cor do texto</span><input type="color" defaultValue="#13261F" disabled={locked} onChange={event => editor.chain().focus().setColor(event.target.value).run()} /></label>
      <button className="icon-button" aria-label="Desfazer" disabled={locked || !state.undo} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={19} /></button>
      <button className="icon-button" aria-label="Refazer" disabled={locked || !state.redo} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={19} /></button>
    </div>
    </MobileDisclosure>
    <div className="editor-insert" role="group" aria-label="Inserir no documento">
      <button disabled={locked} onClick={() => { bookmark.current = editor.state.selection.getBookmark(); setLinkError(''); setLinkOpen(true); }}><Link2 size={18} />Link</button>
      <button disabled={locked} onClick={() => pick(imageInput.current)}><ImagePlus size={18} />Imagem</button>
      <button disabled={locked} onClick={() => pick(cameraInput.current)}><Camera size={18} />Fotografar</button>
      <button disabled={locked} onClick={() => pick(audioInput.current)}><AudioLines size={18} />Áudio</button>
      <button disabled={locked} onClick={() => pick(videoInput.current)}><Clapperboard size={18} />Vídeo</button>
      <button disabled={locked} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={18} />Tabela</button>
    </div>
    {!demo && <input hidden ref={imageInput} aria-label="Selecionar imagem" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; if (file) insertFile.current(file); event.target.value = ''; }} />}
    {!demo && <input hidden ref={cameraInput} aria-label="Fotografar lousa" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { const file = event.target.files?.[0]; if (file) insertFile.current(file); event.target.value = ''; }} />}
    {!demo && <input hidden ref={audioInput} aria-label="Selecionar áudio" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm" onChange={event => { const file = event.target.files?.[0]; if (file) insertFile.current(file); event.target.value = ''; }} />}
    {!demo && <input hidden ref={videoInput} aria-label="Selecionar vídeo" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { const file = event.target.files?.[0]; if (file) insertFile.current(file); event.target.value = ''; }} />}
    {state.table && <div className="editor-insert"><button disabled={locked} onClick={() => editor.chain().focus().addRowAfter().run()}>Adicionar linha</button><button disabled={locked} onClick={() => editor.chain().focus().addColumnAfter().run()}>Adicionar coluna</button><button disabled={locked} onClick={() => editor.chain().focus().deleteRow().run()}>Excluir linha</button><button disabled={locked} onClick={() => editor.chain().focus().deleteColumn().run()}>Excluir coluna</button><button disabled={locked} onClick={() => editor.chain().focus().deleteTable().run()}>Excluir tabela</button></div>}
    {state.image && <div className="editor-insert"><label>Descrição da imagem<input aria-label="Descrição da imagem" value={editor.getAttributes('noteImage').alt} disabled={locked} onChange={event => editor.commands.updateAttributes('noteImage', { alt: event.target.value })} /></label>{['50%', '75%', '100%'].map(width => <button key={width} disabled={locked} onClick={() => editor.commands.updateAttributes('noteImage', { width })}>{width}</button>)}</div>}
    {(state.image || state.audio) && <button className="text-button" disabled={locked} onClick={() => editor.chain().focus().deleteSelection().run()}>Remover bloco do documento</button>}
    {message && <p className="editor-message" role="status">{message}</p>}
    <NoteSpelling editor={editor} disabled={locked} />
    <div className="document-canvas" ref={canvasRef}><EditorContent editor={editor} /></div>
    <footer className="editor-footer"><span>{state.words} palavras</span><span>Imagens: cole, arraste ou use o botão · anexos até 25 MB (vídeos curtos)</span></footer>
    {linkOpen && <Modal title="Inserir ou editar link" onClose={() => { setLinkOpen(false); bookmark.current = null; }}><form onSubmit={saveLink}><label htmlFor="note-link">Endereço do link</label><input id="note-link" name="url" type="text" required defaultValue={editor.getAttributes('link').href || 'https://'} autoFocus />{linkError && <p role="alert">{linkError}</p>}<div className="button-row"><button className="button primary" type="submit">Salvar link</button><button className="button outline" type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false); bookmark.current = null; }}>Remover link</button></div></form></Modal>}
  </div>;
}
