'use client';

import { useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil } from 'lucide-react';
import { colors, type Workspace, type Note } from '@/lib/workspace';
import { lifeAreas, itemArea } from '@/lib/life';

type Props = { data: Workspace; blocked: boolean; update: (recipe: (previous: Workspace) => Workspace) => boolean };

export function AreaSelect({ data, value, onChange, name, id, disabled = false }: { data: Workspace; value: string; onChange?: (value: string) => void; name?: string; id: string; disabled?: boolean }) {
  return <select id={id} name={name} value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} disabled={disabled}>
    <option value="">Sem área · organizar depois</option>
    {lifeAreas(data).filter((area) => !area.hidden || area.id === value).map((area) => <option key={area.id} value={area.id}>{area.name}{area.hidden ? ' (oculta)' : ''}</option>)}
  </select>;
}

export function NoteOrganization({ data, note, blocked, onChange }: { data: Workspace; note: Note; blocked: boolean; onChange: (patch: Partial<Note>) => void }) {
  return <div className="life-fields">
    <label htmlFor="note-area">Área da anotação</label><AreaSelect id="note-area" data={data} value={itemArea(note)} disabled={blocked} onChange={(areaId) => onChange({ areaId })} />
    <label htmlFor="note-notebook">Caderno da anotação</label><select id="note-notebook" value={note.notebookId ?? ''} disabled={blocked} onChange={(event) => { const book = data.notebooks?.find((item) => item.id === event.target.value); onChange({ notebookId: event.target.value, ...(book ? { areaId: book.areaId } : {}) }); }}>
      <option value="">Sem caderno</option>{data.notebooks?.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
    </select>
  </div>;
}

export function OrganizationPanel({ data, update, blocked }: Props) {
  const [editing, setEditing] = useState<{ kind: 'area' | 'notebook'; id: string } | null>(null);
  const [message, setMessage] = useState('');
  const areas = lifeAreas(data);
  const books = data.notebooks ?? [];
  const current = editing?.kind === 'area' ? areas.find((item) => item.id === editing.id) : books.find((item) => item.id === editing?.id);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name') ?? '').trim();
    if (!name) { setMessage('Informe um nome.'); return; }
    const id = editing.id || crypto.randomUUID();
    const color = String(fields.get('color')) as typeof colors[number];
    const accepted = update((previous) => {
      if (editing.kind === 'area') {
        const list = lifeAreas(previous);
        const value = { id, name, color, hidden: list.find((item) => item.id === id)?.hidden ?? false };
        return { ...previous, areas: editing.id ? list.map((item) => item.id === id ? value : item) : [...list, value] };
      }
      const value = { id, name, color, areaId: String(fields.get('area') ?? '') };
      const list = previous.notebooks ?? [];
      return { ...previous, notebooks: editing.id ? list.map((item) => item.id === id ? value : item) : [...list, value] };
    });
    if (accepted) { setEditing(null); setMessage('Organização atualizada. Confira o indicador de salvamento.'); }
  }
  function move(id: string, direction: number) {
    update((previous) => {
      const list = [...lifeAreas(previous)]; const index = list.findIndex((item) => item.id === id);
      if (index + direction < 0 || index + direction >= list.length) return previous;
      [list[index], list[index + direction]] = [list[index + direction], list[index]];
      return { ...previous, areas: list };
    });
  }
  return <section className="panel life-organization" aria-label="Organização da vida">
    <h2>Áreas da vida e cadernos</h2><p>Uma vida, uma agenda. Personalize as áreas e crie cadernos para diário, reflexões, trabalho ou qualquer assunto. Metas e projetos podem atravessar várias áreas.</p>
    <p>Ocultar uma área retira a opção de novos cadastros, sem apagar nem esconder seus registros na agenda. Cores são apenas um apoio visual.</p>
    <div className="button-row"><button className="button outline" disabled={blocked} onClick={() => setEditing({ kind: 'area', id: '' })}>Nova área</button><button className="button primary" disabled={blocked} onClick={() => setEditing({ kind: 'notebook', id: '' })}>Novo caderno</button></div>
    {editing && <form className="entry-form organization-form" key={`${editing.kind}:${editing.id}`} onSubmit={save}>
      <h3>{editing.id ? 'Editar' : 'Criar'} {editing.kind === 'area' ? 'área' : 'caderno'}</h3>
      <label htmlFor="organization-name">Nome</label><input id="organization-name" name="name" required maxLength={100} defaultValue={current?.name ?? ''} />
      {editing.kind === 'notebook' && <><label htmlFor="organization-area">Área do caderno · opcional</label><AreaSelect data={data} id="organization-area" name="area" value={books.find((book) => book.id === editing.id)?.areaId ?? ''} /></>}
      <label htmlFor="organization-color">Cor</label><select id="organization-color" name="color" defaultValue={current?.color ?? 'blue'}>{colors.map((color, index) => <option key={color} value={color}>{['Verde', 'Lilás', 'Areia', 'Azul', 'Rosa'][index]}</option>)}</select>
      <div className="button-row"><button className="button primary" disabled={blocked}>Salvar organização</button><button type="button" className="button outline" onClick={() => setEditing(null)}>Cancelar</button></div>
      {editing.kind === 'notebook' && editing.id && <small>Alterar a área do caderno não reclassifica anotações antigas automaticamente.</small>}
    </form>}
    <h3>Áreas da vida</h3><ul className="organization-list compact">{areas.map((area, index) => <li key={area.id}><span><i aria-hidden="true" className={`color-dot ${area.color}`} />{area.name}{area.hidden && <small> · oculta nos novos cadastros</small>}</span><div className="button-row"><button disabled={blocked} onClick={() => setEditing({ kind: 'area', id: area.id })} aria-label={`Editar área ${area.name}`} title="Editar"><Pencil size={16} aria-hidden="true" /></button><button disabled={blocked} onClick={() => update((previous) => ({ ...previous, areas: lifeAreas(previous).map((item) => item.id === area.id ? { ...item, hidden: !item.hidden } : item) }))} title={area.hidden ? 'Mostrar' : 'Ocultar'}>{area.hidden ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}<span className="sr-only">{area.hidden ? 'Mostrar' : 'Ocultar'} {area.name}</span></button><button disabled={blocked || index === 0} aria-label={`Mover ${area.name} para cima`} title="Mover para cima" onClick={() => move(area.id, -1)}><ChevronUp size={16} aria-hidden="true" /></button><button disabled={blocked || index === areas.length - 1} aria-label={`Mover ${area.name} para baixo`} title="Mover para baixo" onClick={() => move(area.id, 1)}><ChevronDown size={16} aria-hidden="true" /></button></div></li>)}</ul>
    <h3>Seus cadernos</h3>{!books.length && <p>Nenhum caderno ainda. Suas anotações atuais continuam disponíveis em “Sem caderno”.</p>}<ul className="organization-list">{books.map((book) => <li key={book.id}><span><i aria-hidden="true" className={`color-dot ${book.color}`} />{book.name}<small> · {areas.find((area) => area.id === book.areaId)?.name ?? 'Sem área'}</small></span><button disabled={blocked} onClick={() => setEditing({ kind: 'notebook', id: book.id })} aria-label={`Editar caderno ${book.name}`}>Editar</button></li>)}</ul>
    <p role="status">{message}</p>
  </section>;
}
