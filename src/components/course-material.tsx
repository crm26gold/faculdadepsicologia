'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FileText, FolderInput, Library, RotateCcw, Trash2, Upload } from 'lucide-react';
import { api } from './community/client';
import { MATERIAL_FILE_LIMIT, materialMime } from '@/lib/materials/types';

// Material of a course (general) or of one of its subjects or modules: files the Jornada reads, written texts and
// "o que a IA precisa saber". Kept in the account's own storage, never shown to groups or the administration.
type Item = { id: string; course_id: string; subject_id: string | null; kind: 'arquivo' | 'texto' | 'contexto'; title: string; body?: string | null;
  preview?: string | null; mime: string | null; size: number; pages: number | null; status: 'processando' | 'pronto' | 'sem_texto' | 'falhou';
  problem: string; created_at: string; deleted_at: string | null };
type State = { items: Item[]; used: number; limit: number };
type Sending = { key: string; name: string; step: string; error?: boolean };

const megabytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '').replace('.', ',')} MB`;
const kinds: Record<string, string> = { 'application/pdf': 'PDF', 'text/plain': 'Texto', 'text/markdown': 'Texto',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint' };
const statusLabel: Record<Item['status'], string> = { processando: 'lendo…', pronto: 'pronto para a IA', sem_texto: 'sem texto para ler', falhou: 'não deu para ler' };

export function CourseMaterial({ courseId, subjectId, places, label }: { courseId: string; subjectId: string | null; places: { id: string | null; name: string }[]; label: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState<Sending[]>([]);
  const [writing, setWriting] = useState(false);
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try { const next = await api<State>(`/api/materiais?curso=${encodeURIComponent(courseId)}`); setState(next); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não consegui carregar o material.'); }
  }, [courseId]);
  useEffect(() => { void load(); }, [load]);
  const here = state?.items.filter(item => item.subject_id === subjectId) ?? [];
  const saved = here.find(item => item.kind === 'contexto' && !item.deleted_at);
  useEffect(() => { setContext(saved?.body ?? ''); }, [saved?.id, saved?.body]);
  if (error && !state) return <section className="panel course-material" aria-label={label}><p className="cm-message" role="alert">{error}</p></section>;
  if (!state) return null;
  const items = here.filter(item => item.kind !== 'contexto' && !item.deleted_at);
  const trash = here.filter(item => item.kind !== 'contexto' && item.deleted_at);

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage('');
    try { await api('/api/materiais', body); await load(); setMessage(done); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }
  async function send(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    setSending(list.map((file, index) => ({ key: `${index}-${file.name}`, name: file.name, step: 'na fila' })));
    const step = (index: number, text: string, failed = false) => setSending(previous => previous.map((item, position) => position === index ? { ...item, step: text, error: failed } : item));
    for (const [index, file] of list.entries()) {
      const mime = materialMime(file.name, file.type);
      if (!mime) { step(index, 'formato não lido ainda (use PDF, Word, PowerPoint ou texto)', true); continue; }
      if (file.size > MATERIAL_FILE_LIMIT) { step(index, 'passa de 25 MB', true); continue; }
      try {
        step(index, 'enviando…');
        const prepared = await api<{ id: string; uploadUrl: string; mime: string }>('/api/materiais', { action: 'prepare', course_id: courseId, subject_id: subjectId, name: file.name, type: mime, size: file.size });
        const uploaded = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': prepared.mime, 'x-upsert': 'false' }, body: file });
        if (!uploaded.ok) throw new Error('O envio do arquivo falhou. Tente de novo.');
        step(index, 'lendo o texto…');
        const result = await api<Item>('/api/materiais', { action: 'process', id: prepared.id });
        step(index, result.status === 'pronto' ? 'pronto' : statusLabel[result.status], result.status === 'falhou');
      } catch (reason) { step(index, reason instanceof Error ? reason.message : 'Não foi possível enviar.', true); }
    }
    if (input.current) input.current.value = '';
    await load();
    // What went through is already in the list; only problems stay on screen.
    setSending(previous => previous.filter(item => item.error));
  }
  async function write(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget), form = event.currentTarget;
    await act({ action: 'text', course_id: courseId, subject_id: subjectId, title: String(fields.get('title') ?? '').trim(), text: String(fields.get('text') ?? '').trim() }, 'Texto guardado.');
    form.reset(); setWriting(false);
  }
  async function open(item: Item) {
    if (opened[item.id] !== undefined) { setOpened(({ [item.id]: _closed, ...rest }) => rest); return; }
    try { const full = await api<Item>(`/api/materiais?id=${item.id}`); setOpened(previous => ({ ...previous, [item.id]: full.body ?? '' })); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não consegui abrir o texto.'); }
  }
  const placeName = (id: string | null) => places.find(place => place.id === id)?.name ?? 'Material geral do curso';

  return <section className="panel course-material" aria-labelledby={`material-${subjectId ?? courseId}`}>
    <header className="course-material-head">
      <h2 id={`material-${subjectId ?? courseId}`}><Library size={18} aria-hidden="true" />{label}</h2>
      <span className="muted small">{megabytes(state.used)} de {megabytes(state.limit)} usados na conta</span>
    </header>
    <p className="muted small">O que você guarda aqui fica só na sua conta. A Jornada lê o texto de PDF, Word e PowerPoint para a IA estudar com você; foto e arquivo escaneado ficam guardados, mas ainda sem leitura.</p>

    <form className="course-material-context" onSubmit={event => { event.preventDefault(); void act({ action: 'context', course_id: courseId, subject_id: subjectId, text: context.trim() }, context.trim() ? 'Guardado. A IA vai levar isso em conta.' : 'Removido.'); }}>
      <label htmlFor={`context-${subjectId ?? courseId}`}>O que a IA precisa saber</label>
      <textarea id={`context-${subjectId ?? courseId}`} value={context} maxLength={4000} rows={3} onChange={event => setContext(event.target.value)}
        placeholder={subjectId ? 'Ex.: a professora cobra a parte prática; a prova é dissertativa.' : 'Ex.: graduação na UNIP, 2º semestre; aulas à noite.'} />
      <button className="button outline" disabled={busy || context.trim() === (saved?.body ?? '').trim()}>Salvar</button>
    </form>

    <div className="button-row">
      <input ref={input} type="file" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md,application/pdf,text/plain,text/markdown" onChange={event => void send(event.target.files)} aria-label="Escolher arquivos" />
      <button type="button" className="button primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} aria-hidden="true" />Enviar arquivos</button>
      <button type="button" className="button outline" disabled={busy} onClick={() => setWriting(value => !value)}><FileText size={16} aria-hidden="true" />Escrever texto</button>
    </div>
    {writing && <form className="ai-card course-material-write" onSubmit={write}>
      <label>Título<input name="title" required maxLength={200} placeholder="Ex.: Plano de ensino, Orientações do TCC" /></label>
      <label>Texto<textarea name="text" required maxLength={20000} rows={6} placeholder="Cole aqui o texto que a IA deve conhecer." /></label>
      <div className="button-row"><button className="button primary" disabled={busy}>Guardar</button><button type="button" className="text-button" onClick={() => setWriting(false)}>Cancelar</button></div>
    </form>}
    {sending.length > 0 && <ul className="course-material-sending" aria-live="polite">{sending.map(item => <li key={item.key} data-error={item.error ? 'true' : undefined}><strong>{item.name}</strong><span>{item.step}</span></li>)}</ul>}

    {items.length ? <ul className="course-material-list">{items.map(item => <li key={item.id}>
      <div>
        <strong>{item.title}</strong>
        <span className="muted small">{[item.kind === 'texto' ? 'Texto escrito' : kinds[item.mime ?? ''] ?? 'Arquivo', item.size ? megabytes(item.size) : null,
          item.pages ? `${item.pages} ${item.mime?.includes('presentation') ? 'slides' : 'páginas'}` : null, statusLabel[item.status]].filter(Boolean).join(' · ')}</span>
        {item.problem && <span className="small course-material-problem">{item.problem}</span>}
        {opened[item.id] !== undefined && <p className="course-material-body">{opened[item.id]}</p>}
      </div>
      <div className="button-row">
        {item.kind === 'arquivo' ? <a className="text-button" href={`/api/materiais?arquivo=${item.id}`} target="_blank" rel="noreferrer">Abrir</a>
          : <button type="button" className="text-button" onClick={() => void open(item)}>{opened[item.id] !== undefined ? 'Fechar' : 'Ler'}</button>}
        {places.length > 1 && <label className="course-material-move"><FolderInput size={15} aria-hidden="true" /><span className="sr-only">Mover {item.title} para</span>
          <select value={item.subject_id ?? ''} disabled={busy} onChange={event => void act({ action: 'edit', id: item.id, course_id: courseId, subject_id: event.target.value || null }, `Movido para ${placeName(event.target.value || null)}.`)}>
            {places.map(place => <option key={place.id ?? ''} value={place.id ?? ''}>{place.name}</option>)}
          </select></label>}
        <button type="button" className="text-button cm-danger" disabled={busy} onClick={() => void act({ action: 'delete', id: item.id }, `“${item.title}” foi para a lixeira (30 dias).`)}><Trash2 size={15} aria-hidden="true" />Excluir</button>
      </div>
    </li>)}</ul> : <p className="muted">Nada guardado aqui ainda. Envie o plano de ensino, os slides ou os textos que você recebeu.</p>}

    {trash.length > 0 && <details className="course-material-trash"><summary>Lixeira ({trash.length})</summary><ul className="course-material-list">{trash.map(item => <li key={item.id}>
      <div><strong>{item.title}</strong><span className="muted small">Apaga de vez 30 dias depois de excluído</span></div>
      <div className="button-row">
        <button type="button" className="text-button" disabled={busy} onClick={() => void act({ action: 'restore', id: item.id }, `“${item.title}” voltou.`)}><RotateCcw size={15} aria-hidden="true" />Restaurar</button>
        <button type="button" className="text-button cm-danger" disabled={busy} onClick={() => { if (window.confirm(`Apagar “${item.title}” de vez? Não dá para desfazer.`)) void act({ action: 'erase', id: item.id }, 'Apagado de vez.'); }}>Apagar de vez</button>
      </div>
    </li>)}</ul></details>}
    {message && <p className="cm-message" role="status">{message}</p>}
  </section>;
}
