'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { weekdays } from '@/lib/academic';
import { upsertClass } from '@/lib/class-schedule';
import { classSchema, termSchema, type ClassSession, type Workspace } from '@/lib/workspace';
import { Modal } from './modal';
import styles from './academic.module.css';

type Props = {
  data: Workspace;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  blocked: boolean;
  onClose: () => void;
};

export function ScheduleSettings({ data, update, blocked, onClose }: Props) {
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const isNew = editing !== null && !data.classes.some((item) => item.id === editing.id);

  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorSummary.current?.focus());
  }

  function backToList() {
    setEditing(null); setError('');
    requestAnimationFrame(() => newButton.current?.focus());
  }

  function newClass() {
    if (blocked || data.subjects.length === 0) return;
    setEditing({ id: crypto.randomUUID(), subjectId: data.subjects[0].id, weekday: 1,
      startTime: '', intervalWeeks: 1, location: '', enabled: true });
    setError(''); setMessage('');
  }

  function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || blocked) return;
    const fields = new FormData(event.currentTarget);
    const parsed = classSchema.safeParse({ ...editing, subjectId: fields.get('subjectId'),
      weekday: Number(fields.get('weekday')), startTime: fields.get('startTime'),
      endTime: fields.get('endTime') || undefined, intervalWeeks: Number(fields.get('intervalWeeks')),
      firstDate: fields.get('firstDate') || undefined, location: fields.get('location'),
      enabled: fields.get('enabled') === 'on' });
    if (!parsed.success) { showError(parsed.error.issues[0].message); return; }
    if (!update((previous) => upsertClass(previous, parsed.data))) {
      showError('Não foi possível aplicar este horário. Confira o aviso de salvamento; o formulário foi preservado.');
      return;
    }
    setMessage(`${isNew ? 'Horário incluído' : 'Horário atualizado'}. Confira o indicador de salvamento antes de sair.`);
    backToList();
  }

  function saveTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const fields = new FormData(event.currentTarget);
    const term = termSchema.safeParse({ start: fields.get('termStart') || undefined, end: fields.get('termEnd') || undefined });
    if (!term.success) { showError(term.error.issues[0].message); return; }
    if (!update((previous) => ({ ...previous, term: term.data }))) {
      showError('Não foi possível aplicar o período. Confira o aviso de salvamento.'); return;
    }
    setError(''); setMessage('Período atualizado. Confira o indicador de salvamento antes de sair.');
  }

  return <Modal title="Minha grade de aulas" onClose={onClose}>
    <p>Cadastre suas aulas e ajuste a grade quando precisar. Datas e horários não informados não são inventados.</p>
    {error && <p ref={errorSummary} tabIndex={-1} role="alert" className="error-banner">{error}</p>}
    {message && <p role="status">{message}</p>}
    {editing ? <form onSubmit={saveClass} className="entry-form" onChange={() => setError('')}>
      <h3>{isNew ? 'Novo horário' : 'Editar horário'}</h3>
      {blocked && <p role="status">Edição pausada. Preserve seus dados e confira o aviso de salvamento.</p>}
      <fieldset disabled={blocked} className={styles.scheduleFields}>
        <legend className="sr-only">Dados do horário</legend>
        <label htmlFor="class-subject">Matéria da aula</label>
        <select autoFocus id="class-subject" name="subjectId" required defaultValue={editing.subjectId}>
          {data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <label htmlFor="class-weekday">Dia da semana</label>
        <select id="class-weekday" name="weekday" defaultValue={editing.weekday}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select>
        <div className="form-grid">
          <div><label htmlFor="class-start">Início</label><input id="class-start" name="startTime" type="time" required defaultValue={editing.startTime} /></div>
          <div><label htmlFor="class-end">Término (opcional)</label><input id="class-end" name="endTime" type="time" defaultValue={editing.endTime} /></div>
        </div>
        <label htmlFor="class-frequency">Repetir a cada quantas semanas?</label>
        <input id="class-frequency" name="intervalWeeks" type="number" min={1} max={12} required defaultValue={editing.intervalWeeks} />
        <label htmlFor="class-first">Primeira aula (opcional)</label>
        <input id="class-first" name="firstDate" type="date" defaultValue={editing.firstDate} aria-describedby="class-first-help" />
        <p id="class-first-help">Para intervalos maiores que uma semana, informe a primeira data para exibir as ocorrências. Sem ela, o horário fica cadastrado como pendente. A data deve coincidir com o dia da semana.</p>
        <label htmlFor="class-location">Local ou modalidade (opcional)</label>
        <input id="class-location" name="location" maxLength={160} defaultValue={editing.location} />
        <label className={styles.checkboxLabel}><input name="enabled" type="checkbox" defaultChecked={editing.enabled} />Mostrar esta aula na agenda</label>
      </fieldset>
      <div className="button-row"><button type="button" className="button outline" onClick={backToList}>Voltar à grade</button><button type="submit" className="button primary" disabled={blocked}>Salvar horário</button></div>
    </form> : <>
      <button ref={newButton} type="button" className="button primary" disabled={blocked || data.subjects.length === 0 || data.classes.length >= 300} onClick={newClass}><Plus size={17} aria-hidden="true" />Adicionar horário</button>
      {data.subjects.length === 0 && <p>Primeiro cadastre uma matéria na seção Matérias. Depois, volte aqui para adicionar os horários.</p>}
      {data.classes.length === 0 && data.subjects.length > 0 && <p>Nenhum horário cadastrado. Adicione sua primeira aula.</p>}
      {data.classes.length >= 300 && <p>Limite de 300 horários atingido. Você ainda pode editar os horários existentes.</p>}
      <div className={styles.scheduleList}>{data.classes.map((item) => {
        const subject = data.subjects.find((entry) => entry.id === item.subjectId);
        return <button key={item.id} className={styles.scheduleRow} disabled={blocked} onClick={() => { setEditing(item); setError(''); setMessage(''); }}>
          <span className={`${styles.scheduleTime} ${subject?.color ?? 'sage'}`}><strong>{weekdays[item.weekday].slice(0, 3)}</strong>{item.startTime}</span>
          <span><strong>{subject?.name}</strong><small>{subject?.professor ? `${subject.professor} · ` : ''}{item.intervalWeeks === 1 ? 'Toda semana' : `A cada ${item.intervalWeeks} semanas`}{item.location ? ` · ${item.location}` : ''}{!item.enabled ? ' · Pausada' : ''}{item.intervalWeeks > 1 && !item.firstDate ? ' · Data inicial a confirmar' : ''}</small></span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </button>;
      })}</div>
      <form className="entry-form" onSubmit={saveTerm}>
        <h3>Período letivo</h3><p>Opcional. Ao preencher, as aulas recorrentes ficam limitadas a estas datas. Feriados não são descontados automaticamente.</p>
        <div className="form-grid"><div><label htmlFor="term-start">Início do semestre</label><input id="term-start" name="termStart" type="date" defaultValue={data.term.start} disabled={blocked} /></div><div><label htmlFor="term-end">Fim do semestre</label><input id="term-end" name="termEnd" type="date" defaultValue={data.term.end} disabled={blocked} /></div></div>
        <button type="submit" className="button primary" disabled={blocked}>Salvar período</button>
      </form>
    </>}
  </Modal>;
}
