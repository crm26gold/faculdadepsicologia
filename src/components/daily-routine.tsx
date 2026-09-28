'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Check, Clock, Plus, Sunrise, Sun, Sunset, Trash2 } from 'lucide-react';
import { dateKey, type Workspace } from '@/lib/workspace';
import { calculateHabitStreak, toggleHabitDate, type RoutineHabit } from '@/lib/life-data';
import { lifeAreas } from '@/lib/life';
import { AreaSelect } from './life-organization';

export function DailyRoutine({ data, blocked, update }: { data: Workspace; blocked: boolean; update: (recipe: (previous: Workspace) => Workspace) => boolean }) {
  const habits = data.habits ?? [];
  const [today, setToday] = useState(dateKey);
  const [selectedDate, setSelectedDate] = useState('');
  const date = selectedDate || today;
  useEffect(() => { const timer = setInterval(() => setToday(dateKey()), 30_000); return () => clearInterval(timer); }, []);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [period, setPeriod] = useState<RoutineHabit['period']>('morning');
  const [time, setTime] = useState('08:00');
  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState('');
  const [message, setMessage] = useState('');
  const completed = habits.filter(h => h.completedDates.includes(date)).length;
  const progress = habits.length ? Math.round(completed / habits.length * 100) : 0;

  function save(event: FormEvent) {
    event.preventDefault();
    if (blocked) return;
    const id = editingId || crypto.randomUUID();
    const accepted = update(previous => {
      const list = previous.habits ?? [];
      const habit: RoutineHabit = { id, period, time, title: title.trim(), areaId, completedDates: list.find(h => h.id === id)?.completedDates ?? [] };
      return { ...previous, habits: editingId ? list.map(h => h.id === id ? habit : h) : [...list, habit] };
    });
    if (accepted) { setShowAdd(false); setEditingId(''); setTitle(''); setMessage('Rotina atualizada. Confira o indicador de salvamento.'); }
  }
  function schedule(habit: RoutineHabit) {
    const id = `routine:${habit.id}:${date}`;
    const accepted = update(previous => ({ ...previous, tasks: previous.tasks.some(t => t.id === id) ? previous.tasks : [...previous.tasks, { id, title: habit.title, date, time: habit.time, subjectId: '', areaId: habit.areaId, kind: 'Compromisso', minutes: 25, done: false }] }));
    if (accepted) setMessage('Compromisso disponível na agenda única (25 minutos estimados; você pode editar na agenda).');
  }
  return <fieldset className="routine-container" disabled={blocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <div className="finances-header-row"><div><h2>Minha Rotina Diária</h2><p>Hábitos por dia, conectados às suas áreas da vida.</p></div><button className="button primary" onClick={() => { setEditingId(''); setTitle(''); setShowAdd(!showAdd); }}><Plus size={16} />Novo hábito / bloco</button></div>
    <label htmlFor="routine-date">Dia da rotina</label><input id="routine-date" type="date" value={date} onChange={e => setSelectedDate(e.target.value)} /><button type="button" onClick={() => setSelectedDate('')}>Hoje</button>
    <div className="panel routine-progress-deck"><div className="routine-stats-header"><div><h3>Ritmo de {date === today ? 'Hoje' : date}: {progress}% Concluído</h3><p>{completed} de {habits.length} etapas cumpridas</p></div><span className="routine-score-badge">{completed}/{habits.length}</span></div><progress value={completed} max={Math.max(1, habits.length)} aria-label="Progresso diário" /></div>
    {message && <p role="status">{message}</p>}
    {showAdd && <form onSubmit={save} className="panel finance-form"><h3>{editingId ? 'Editar' : 'Adicionar'} hábito</h3><div className="finance-form-grid">
      <div><label htmlFor="r-period">Período</label><select id="r-period" value={period} onChange={e => setPeriod(e.target.value as RoutineHabit['period'])}><option value="morning">Manhã</option><option value="afternoon">Tarde</option><option value="night">Noite</option></select></div>
      <div><label htmlFor="r-time">Horário habitual</label><input id="r-time" type="time" required value={time} onChange={e => setTime(e.target.value)} /></div>
      <div><label htmlFor="r-title">Atividade ou Hábito</label><input id="r-title" required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div><label htmlFor="r-area">Área</label><AreaSelect id="r-area" data={data} value={areaId} onChange={setAreaId} /></div>
    </div><div className="form-footer"><button type="button" className="button outline" onClick={() => setShowAdd(false)}>Cancelar</button><button className="button primary">Salvar na rotina</button></div></form>}
    <div className="routine-columns">{([{ id: 'morning', title: 'Manhã', Icon: Sunrise }, { id: 'afternoon', title: 'Tarde', Icon: Sun }, { id: 'night', title: 'Noite', Icon: Sunset }] as const).map(section => <section key={section.id} className="panel routine-column"><div className={`routine-col-header ${section.id}`}><section.Icon size={18} /><h4>{section.title}</h4></div><ul className="routine-list">
      {habits.filter(h => h.period === section.id).toSorted((a,b) => a.time.localeCompare(b.time)).map(h => {
        const done = h.completedDates.includes(date);
        const streak = calculateHabitStreak(h.completedDates, today);
        return <li key={h.id} className={`routine-item ${done ? 'done' : ''}`}><button type="button" className="routine-check-btn" aria-pressed={done} aria-label={`Concluir hábito: ${h.title}`} onClick={() => update(previous => ({ ...previous, habits: (previous.habits ?? []).map(item => item.id === h.id ? toggleHabitDate(item, date) : item) }))}>{done && <Check size={14} />}</button><div className="routine-item-info"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="routine-item-time"><Clock size={11} />{h.time}</span>{streak > 0 && <span className="routine-streak-badge" title={`${streak} dias consecutivos cumprindo este hábito`}>🔥 {streak} {streak === 1 ? 'dia' : 'dias'}</span>}</div><strong>{h.title}</strong><span className="routine-area-tag">{lifeAreas(data).find(a => a.id === h.areaId)?.name ?? 'Sem área'}</span><button type="button" onClick={() => schedule(h)}>Adicionar à agenda</button><button type="button" aria-label={`Editar hábito: ${h.title}`} onClick={() => { setEditingId(h.id); setTitle(h.title); setPeriod(h.period); setTime(h.time); setAreaId(h.areaId); setShowAdd(true); }}>Editar</button></div><button className="icon-button danger" aria-label={`Excluir: ${h.title}`} onClick={() => { if (window.confirm('Excluir este hábito e seu histórico?')) update(previous => ({ ...previous, habits: (previous.habits ?? []).filter(item => item.id !== h.id) })); }}><Trash2 size={13} /></button></li>;
      })}
      {!habits.some(h => h.period === section.id) && <li className="routine-empty">Nenhum hábito cadastrado.</li>}
    </ul></section>)}</div>
  </fieldset>;
}
