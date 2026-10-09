'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, FileText, FolderPlus, GraduationCap, Inbox, LockKeyhole, NotebookPen, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { activeCourses, subjectsOfCourse } from '@/lib/courses';
import { lifeAreas } from '@/lib/life';
import { noteExcerpt, notebooksOf, notesIn, parsePlace, personalNotebooks, placeFields, placeGroups, placeKey, placeName, placeOf, placeTrail, type Place } from '@/lib/notebooks';
import type { Note, Workspace } from '@/lib/workspace';
import { api } from './community/client';
import { CourseMaterial } from './course-material';

const NoteEditor = dynamic(() => import('./note-editor'), { ssr: false, loading: () => <p className="muted">Abrindo editor…</p> });
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
const when = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
const countLabel = (count: number) => count === 1 ? '1 anotação' : `${count} anotações`;

type Props = {
  data: Workspace; blocked: boolean; demo: boolean; cloud: boolean; status: string;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  place: Place | null; noteId: string;
  onPlace: (place: Place | null) => void; onNote: (id: string) => void; onManage: () => void;
};

// The notebook as a library: every subject/module already is a notebook, personal notebooks sit beside them,
// and "Para organizar" holds what has no place yet. Inside a place, a new note is born there — no questions.
export function NotesLibrary({ data, blocked, demo, cloud, status, update, place, noteId, onPlace, onNote, onManage }: Props) {
  const note = noteId ? data.notes.find(item => item.id === noteId) : undefined;
  const [fresh, setFresh] = useState('');
  if (note) return <NoteView key={note.id} {...{ data, blocked, demo, cloud, status, update, onPlace, onNote }} note={note} fresh={fresh === note.id} />;
  function create(target: Place) {
    if (blocked) return;
    const id = crypto.randomUUID();
    const value: Note = { id, title: '', content: '', updatedAt: new Date().toISOString(), ...placeFields(data, target) };
    if (update(previous => ({ ...previous, notes: [value, ...previous.notes] }))) { setFresh(id); onNote(id); }
  }
  if (place) return <PlaceView {...{ data, blocked, cloud, place, onPlace, onNote, onManage, update }} onCreate={() => create(place)} />;
  return <LibraryHome {...{ data, blocked, update, onPlace, onNote }} onCreate={() => create({ kind: 'inbox' })} />;
}

function LibraryHome({ data, blocked, update, onPlace, onNote, onCreate }: Pick<Props, 'data' | 'blocked' | 'update' | 'onPlace' | 'onNote'> & { onCreate: () => void }) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const count = (place: Place) => notesIn(data, place).length;
  const inbox = count({ kind: 'inbox' });
  const courses = [...activeCourses(data), ...(data.courses ?? []).filter(course => course.status !== 'active')];
  const areas = lifeAreas(data).filter(area => count({ kind: 'area', id: area.id }) > 0);
  const recent = data.notes.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const found = query.trim() ? data.notes.filter(item => plain(`${item.title} ${noteExcerpt(item, 2000)}`).includes(plain(query.trim()))).slice(0, 30) : [];

  function addNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name') ?? '').trim();
    if (!name) { setMessage('Dê um nome ao caderno.'); return; }
    const id = crypto.randomUUID();
    const subjectId = String(fields.get('subject') ?? '');
    if (update(previous => ({ ...previous, notebooks: [...(previous.notebooks ?? []), { id, name, areaId: subjectId ? 'studies' : String(fields.get('area') ?? ''), color: 'lavender', ...(subjectId ? { subjectId } : {}) }] }))) {
      setAdding(false); setMessage(''); onPlace({ kind: 'notebook', id });
    }
  }
  const tile = (target: Place, label: string, color?: string) => { const books = target.kind === 'subject' ? notebooksOf(data, target.id) : [];
    const total = count(target) + books.reduce((sum, book) => sum + count({ kind: 'notebook', id: book.id }), 0); const last = notesIn(data, target)[0]; return <li key={placeKey(target)}>
    <button type="button" className={`nb-tile ${color ?? ''}`} onClick={() => onPlace(target)}>
      <strong>{label}</strong><small>{countLabel(total)}{books.length ? ` · ${books.length === 1 ? '1 caderno' : `${books.length} cadernos`}` : ''}{last ? ` · ${when(last.updatedAt)}` : ''}</small>
    </button></li>; };

  return <div className="nb">
    <div className="nb-toolbar">
      <label className="nb-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar nas anotações</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nas anotações" /></label>
      <button type="button" className="button primary" disabled={blocked} onClick={onCreate}><Plus size={16} aria-hidden="true" />Nova anotação</button>
    </div>
    {query.trim() ? <section className="nb-section" aria-label="Resultados da busca">
      {found.length ? <NoteList data={data} notes={found} onNote={onNote} showPlace /> : <p className="nb-empty">Nada encontrado com “{query.trim()}”.</p>}
    </section> : <>
      <button type="button" className={`nb-inbox${inbox ? ' has' : ''}`} onClick={() => onPlace({ kind: 'inbox' })}>
        <Inbox size={22} aria-hidden="true" /><span><strong>Para organizar</strong><small>{inbox ? 'Registros soltos esperando um lugar' : 'Tudo organizado'}</small></span><b aria-label={`${inbox} sem lugar`}>{inbox}</b>
      </button>
      {courses.map(course => { const subjects = subjectsOfCourse(data, course.id); return subjects.length ? <section key={course.id} className="nb-section" aria-labelledby={`nb-course-${course.id}`}>
        <h2 id={`nb-course-${course.id}`}><GraduationCap size={17} aria-hidden="true" />{course.name}{course.status !== 'active' && <span className="tiny-tag">{course.status === 'paused' ? 'pausado' : 'concluído'}</span>}</h2>
        <ul className="nb-grid">{subjects.map(subject => tile({ kind: 'subject', id: subject.id }, subject.name, subject.color))}</ul>
      </section> : null; })}
      <section className="nb-section" aria-labelledby="nb-mine">
        <h2 id="nb-mine"><NotebookPen size={17} aria-hidden="true" />Meus cadernos</h2>
        <ul className="nb-grid">
          {personalNotebooks(data).map(book => tile({ kind: 'notebook', id: book.id }, book.name, book.color))}
          <li>{adding ? <form className="nb-tile nb-new" onSubmit={addNotebook}>
            <label htmlFor="nb-new-name">Nome do caderno</label><input id="nb-new-name" name="name" maxLength={100} placeholder="Ex.: Diário, Ideias, Trabalho" autoFocus />
            <label htmlFor="nb-new-subject">Dentro da matéria · opcional</label><select id="nb-new-subject" name="subject" defaultValue=""><option value="">Nenhuma (caderno pessoal)</option>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
            <label htmlFor="nb-new-area">Área da vida · opcional</label><select id="nb-new-area" name="area" defaultValue=""><option value="">Nenhuma</option>{lifeAreas(data).filter(area => !area.hidden).map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
            {message && <span role="alert" className="nb-error">{message}</span>}
            <span className="nb-new-actions"><button type="button" className="text-button" onClick={() => { setAdding(false); setMessage(''); }}>Cancelar</button><button className="button primary">Criar</button></span>
          </form> : <button type="button" className="nb-tile nb-add" disabled={blocked} onClick={() => setAdding(true)}><FolderPlus size={20} aria-hidden="true" /><strong>Novo caderno</strong><small>Diário, ideias, trabalho…</small></button>}</li>
        </ul>
      </section>
      {areas.length > 0 && <section className="nb-section" aria-labelledby="nb-areas">
        <h2 id="nb-areas"><BookOpen size={17} aria-hidden="true" />Áreas da vida, sem caderno</h2>
        <ul className="nb-grid">{areas.map(area => tile({ kind: 'area', id: area.id }, area.name, area.color))}</ul>
      </section>}
      {recent.length > 0 && <section className="nb-section" aria-labelledby="nb-recent"><h2 id="nb-recent"><FileText size={17} aria-hidden="true" />Recentes</h2><NoteList data={data} notes={recent} onNote={onNote} showPlace /></section>}
    </>}
  </div>;
}

function PlaceView({ data, blocked, cloud, place, onPlace, onNote, onManage, onCreate, update }: Pick<Props, 'data' | 'blocked' | 'cloud' | 'onPlace' | 'onNote' | 'onManage' | 'update'> & { place: Place; onCreate: () => void }) {
  const notes = notesIn(data, place);
  const books = place.kind === 'subject' ? notebooksOf(data, place.id) : [];
  const [naming, setNaming] = useState(false);
  function addBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (place.kind !== 'subject') return;
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    const id = crypto.randomUUID(), subjectId = place.id;
    if (update(previous => ({ ...previous, notebooks: [...(previous.notebooks ?? []), { id, name, areaId: 'studies', color: 'lavender', subjectId }] }))) { setNaming(false); onPlace({ kind: 'notebook', id }); }
  }
  const trail = placeTrail(data, place);
  const inbox = place.kind === 'inbox';
  const subject = place.kind === 'subject' ? data.subjects.find(item => item.id === place.id) : undefined;
  return <div className="nb">
    <nav className="nb-crumbs" aria-label="Caminho"><button type="button" className="text-button" onClick={() => onPlace(null)}><ArrowLeft size={15} aria-hidden="true" />Cadernos</button>{trail.slice(0, -1).map(step => <span key={step}><ChevronRight size={13} aria-hidden="true" />{step}</span>)}</nav>
    <header className="nb-head">
      <div><h2>{inbox ? `Para organizar (${notes.length})` : placeName(data, place)}</h2><p>{inbox ? 'O que você registrou e ainda não tem lugar. Abra, escolha onde fica ou peça a sugestão da IA.' : countLabel(notes.length)}</p></div>
      <button type="button" className="button primary" disabled={blocked} onClick={onCreate}><Plus size={16} aria-hidden="true" />Nova anotação</button>
    </header>
    {place.kind === 'subject' && <section className="nb-section" aria-label="Cadernos desta matéria">
      <ul className="nb-grid">{books.map(book => { const total = notesIn(data, { kind: 'notebook', id: book.id }).length; return <li key={book.id}><button type="button" className={`nb-tile ${book.color}`} onClick={() => onPlace({ kind: 'notebook', id: book.id })}><strong>{book.name}</strong><small>{countLabel(total)}</small></button></li>; })}
        <li>{naming ? <form className="nb-tile nb-new" onSubmit={addBook}><label htmlFor="nb-subject-book">Nome do caderno</label><input id="nb-subject-book" name="name" maxLength={100} placeholder="Ex.: Caderno outubro, Resumos" autoFocus />
          <span className="nb-new-actions"><button type="button" className="text-button" onClick={() => setNaming(false)}>Cancelar</button><button className="button primary">Criar</button></span></form>
          : <button type="button" className="nb-tile nb-add" disabled={blocked} onClick={() => setNaming(true)}><FolderPlus size={20} aria-hidden="true" /><strong>Novo caderno nesta matéria</strong><small>Resumos, provas, mês a mês…</small></button>}</li>
      </ul></section>}
    {cloud && subject?.courseId && <CourseMaterial courseId={subject.courseId} subjectId={subject.id} label="Material desta matéria"
      places={[{ id: null, name: 'Material geral do curso' }, ...subjectsOfCourse(data, subject.courseId).map(item => ({ id: item.id, name: item.name }))]} />}
    {notes.length ? <NoteList data={data} notes={notes} onNote={onNote} organize={inbox} /> : <div className="nb-empty-state"><FileText size={34} aria-hidden="true" /><p>{inbox ? 'Tudo organizado. Nada esperando por aqui.' : 'Nenhuma anotação ainda. A primeira já nasce aqui dentro.'}</p></div>}
    {place.kind === 'notebook' && <button type="button" className="text-button nb-manage" onClick={onManage}>Renomear ou apagar este caderno</button>}
  </div>;
}

function NoteList({ data, notes, onNote, showPlace = false, organize = false }: { data: Workspace; notes: Note[]; onNote: (id: string) => void; showPlace?: boolean; organize?: boolean }) {
  return <ul className={`nb-list${organize ? ' notes-inbox' : ''}`}>{notes.map(item => <li key={item.id}>
    <button type="button" onClick={() => onNote(item.id)} aria-label={organize ? `Abrir e organizar: ${item.title || 'Sem título'}` : undefined}>
      <strong>{item.title || 'Sem título'}</strong>
      {noteExcerpt(item) && <span className="nb-excerpt">{noteExcerpt(item)}</span>}
      <small>{when(item.updatedAt)}{showPlace ? ` · ${placeTrail(data, placeOf(item)).slice(-1)[0]}` : ''}</small>
    </button>
  </li>)}</ul>;
}

function NoteView({ data, blocked, demo, cloud, status, update, onPlace, onNote, note, fresh }: Pick<Props, 'data' | 'blocked' | 'demo' | 'cloud' | 'status' | 'update' | 'onPlace' | 'onNote'> & { note: Note; fresh: boolean }) {
  const place = placeOf(note);
  const groups = useMemo(() => placeGroups(data), [data]);
  const [suggestion, setSuggestion] = useState<{ key: string; reason: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [problem, setProblem] = useState('');
  const title = useRef<HTMLInputElement>(null);
  useEffect(() => { if (fresh) title.current?.focus(); }, [fresh]);
  const edit = (patch: Partial<Note>) => update(previous => ({ ...previous, notes: previous.notes.map(item => item.id === note.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) }));
  const back = () => { onNote(''); onPlace(place); };
  function move(key: string) { edit(placeFields(data, parsePlace(key))); setSuggestion(null); }
  async function suggest() {
    setThinking(true); setProblem(''); setSuggestion(null);
    try {
      const options = groups.flatMap(group => group.options.map(option => ({ key: option.key, label: `${group.label} › ${option.label}` })));
      const result = await api<{ configured: boolean; key?: string; reason?: string }>('/api/ai/organize', { title: note.title, text: noteExcerpt(note, 2000), options });
      if (!result.configured) setProblem('A IA ainda não está ligada. Em Administração › Inteligência artificial, configure a tarefa “Conversa do assistente” ou “Organizar registros”.');
      else if (!result.key || result.key === 'inbox') setProblem('A IA não achou um lugar claro. Escolha você mesmo em “Onde fica”.');
      else setSuggestion({ key: result.key, reason: result.reason ?? '' });
    } catch (error) { setProblem(error instanceof Error ? error.message : 'A IA não respondeu agora.'); }
    finally { setThinking(false); }
  }
  function remove() {
    if (blocked || !window.confirm(`Excluir a anotação "${note.title || 'Sem título'}"? Não dá para desfazer.`)) return;
    // Private attachments stay in storage until the account is deleted; the note itself is gone.
    if (update(previous => ({ ...previous, notes: previous.notes.filter(item => item.id !== note.id) }))) back();
  }
  const siblings = notesIn(data, place).filter(item => item.id !== note.id).slice(0, 12);

  return <section id="note-editor-area" className="nb-editor">
    <aside className="nb-aside" aria-label={`Outras anotações em ${placeName(data, place)}`}>
      <button type="button" className="text-button" onClick={back} aria-label={`Voltar para ${placeName(data, place)}`}><ArrowLeft size={15} aria-hidden="true" />{placeName(data, place)}</button>
      {siblings.length > 0 && <NoteList data={data} notes={siblings} onNote={onNote} />}
    </aside>
    <div className="note-paper">
      <nav className="nb-crumbs nb-crumbs-note" aria-label="Caminho"><button type="button" className="text-button" onClick={back} aria-label={`Voltar para ${placeName(data, place)}`}><ArrowLeft size={15} aria-hidden="true" />{placeName(data, place)}</button></nav>
      <div className="note-meta"><span><LockKeyhole size={13} aria-hidden="true" />{demo ? 'Exemplo temporário' : 'Só você vê'}</span><span role="status">{status}</span></div>
      <label htmlFor="note-title" className="sr-only">Título da anotação</label>
      <input ref={title} id="note-title" className="note-title-input" value={note.title} maxLength={160} disabled={blocked} onChange={event => edit({ title: event.target.value })} placeholder="Sem título" />
      <div className={`nb-place${place.kind === 'inbox' ? ' loose' : ''}`}>
        <label htmlFor="note-place">Onde fica</label>
        <select id="note-place" value={placeKey(place)} disabled={blocked} onChange={event => move(event.target.value)}>
          {groups.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</optgroup>)}
        </select>
        {cloud && !demo && <button type="button" className="button outline nb-ai" disabled={blocked || thinking} onClick={() => void suggest()}><Sparkles size={15} aria-hidden="true" />{thinking ? 'Pensando…' : 'Sugerir lugar com IA'}</button>}
        {suggestion && <div className="nb-suggestion" role="status"><p><strong>Sugestão:</strong> {placeTrail(data, parsePlace(suggestion.key)).join(' › ')}{suggestion.reason ? ` — ${suggestion.reason}` : ''}</p><span><button type="button" className="button primary" onClick={() => move(suggestion.key)}>Mover para lá</button><button type="button" className="text-button" onClick={() => setSuggestion(null)}>Agora não</button></span></div>}
        {problem && <p className="nb-problem" role="alert">{problem}</p>}
      </div>
      <NoteEditor demo={demo} noteId={note.id} cloud={cloud} content={note.content} disabled={blocked} onChange={content => edit({ content })} />
      <button type="button" className="text-button nb-delete" disabled={blocked} onClick={remove}><Trash2 size={15} aria-hidden="true" />Excluir anotação</button>
    </div>
  </section>;
}
