'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarPlus, Check, Clock3, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../modal';
import { api, formatDay } from './client';
import type { TimeFinder } from '@/lib/network';

const shift = (day: string, by: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + by); return date.toISOString().slice(0, 10); };
const todayInBrazil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dayShort = (day: string) => formatDay(day, { weekday: 'short', day: 'numeric' }).replace('.', '');
const dayLong = (day: string) => formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' });
const hourText = (hour: number) => `${hour}h`;
const people = (count: number) => `${count} ${count === 1 ? 'pessoa pode' : 'pessoas podem'}`;
export type Meeting = { title: string; date: string; time: string };

/** Cada hora da busca: quantos podem e quem. Quem bloqueou ou foi bloqueado conta, sem nome. */
function tally(finder: TimeFinder) {
  const slots = new Map<number, string[]>();
  for (const mark of finder.marks) for (const slot of mark.slots) slots.set(slot, [...slots.get(slot) ?? [], mark.person?.name ?? 'Alguém']);
  return slots;
}
const slotOf = (finder: TimeFinder, slot: number) => ({ day: finder.days[Math.floor(slot / 24)], hour: slot % 24 });

/** No Mural do grupo: as buscas de horário em aberto e as já marcadas. Quem está no grupo propõe e marca. */
export function TimeFinders({ space, groupName, archived, chat, creating: startCreating = false, onAddMeeting }: {
  space: string; groupName: string; archived: boolean; chat: boolean; creating?: boolean; onAddMeeting?: (meeting: Meeting) => boolean | null;
}) {
  const [list, setList] = useState<TimeFinder[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(startCreating && !archived);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setList(await api<TimeFinder[]>(`/api/network?finders=${space}`) ?? []); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir.'); }
  }, [space]);
  useEffect(() => { void load(); }, [load]);
  const replace = (next: TimeFinder | null, id: string) => setList(items => next ? items?.map(item => item.id === id ? next : item) ?? null : items?.filter(item => item.id !== id) ?? null);
  const current = list?.find(item => item.id === open) ?? null;
  return <section className="tf" aria-labelledby={`tf-${space}`}>
    <div className="section-heading"><h3 id={`tf-${space}`} className="small-heading"><Clock3 size={14} aria-hidden="true" /> Achar horário em comum</h3>
      {!archived && <button type="button" className="button outline" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Achar horário</button>}</div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {list && !list.length && <p className="muted small">Proponha alguns dias e uma faixa de horas: cada um marca quando pode e o melhor horário aparece.</p>}
    {list?.map(finder => <FinderCard key={finder.id} finder={finder} onOpen={() => setOpen(finder.id)} />)}
    {current && <FinderGrid finder={current} archived={archived} groupName={groupName} onAddMeeting={onAddMeeting}
      onChange={next => replace(next, current.id)} onClose={() => setOpen(null)} />}
    {creating && <FinderForm space={space} chat={chat} onClose={() => setCreating(false)}
      onCreated={created => { setCreating(false); setList(items => [created, ...(items ?? [])]); setOpen(created.id); }} />}
  </section>;
}

function FinderCard({ finder, onOpen }: { finder: TimeFinder; onOpen: () => void }) {
  const counts = tally(finder);
  const best = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
  const answered = finder.marks.length;
  return <article className="panel tf-card" aria-label={`Achar horário: ${finder.title}`}>
    <div>
      <strong>{finder.title}</strong>
      <small>{finder.days.length === 1 ? dayLong(finder.days[0]) : `${dayShort(finder.days[0])} a ${dayShort(finder.days.at(-1)!)}`} · {hourText(finder.from_hour)} às {hourText(finder.to_hour)}</small>
      {finder.chosen ? <p className="tf-chosen"><CalendarCheck size={16} aria-hidden="true" />Marcado: {dayLong(finder.chosen.day)}, {hourText(finder.chosen.hour)}</p>
        : <small>{answered} {answered === 1 ? 'pessoa marcou' : 'pessoas marcaram'}{best ? ` · melhor até agora: ${dayShort(slotOf(finder, best[0]).day)}, ${hourText(best[0] % 24)} (${people(best[1].length)})` : ''}</small>}
    </div>
    <button type="button" className={`button ${finder.chosen || finder.mine.length ? 'outline' : 'primary'}`} onClick={onOpen}>{finder.chosen ? 'Ver' : finder.mine.length ? 'Ver e mudar' : 'Marcar quando posso'}</button>
  </article>;
}

/** A grade: dias nas colunas, horas nas linhas. A cor mostra quantos podem; o ✓, as suas horas. */
function FinderGrid({ finder, archived, groupName, onAddMeeting, onChange, onClose }: {
  finder: TimeFinder; archived: boolean; groupName: string; onAddMeeting?: (meeting: Meeting) => boolean | null;
  onChange: (next: TimeFinder | null) => void; onClose: () => void;
}) {
  const [mine, setMine] = useState(new Set(finder.mine));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const counts = useMemo(() => tally(finder), [finder]);
  const total = Math.max(1, finder.marks.length);
  const hours = Array.from({ length: finder.to_hour - finder.from_hour }, (_, index) => finder.from_hour + index);
  const editable = !finder.chosen && !archived;
  const changed = editable && (mine.size !== finder.mine.length || finder.mine.some(slot => !mine.has(slot)));
  const best = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]).slice(0, 3);
  const toggle = (slots: number[], on: boolean) => setMine(value => { const next = new Set(value); for (const slot of slots) if (on) next.add(slot); else next.delete(slot); return next; });
  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage('');
    try { const next = await api<TimeFinder | null>('/api/network', body); onChange(next); setMessage(done); return next; }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); return undefined; }
    finally { setBusy(false); }
  }
  return <Modal title={finder.title} className="tf-modal" onClose={onClose}>
    <div className="tf-body">
      {finder.chosen ? <div className="tf-chosen big"><CalendarCheck size={20} aria-hidden="true" /><span>Marcado: <strong>{dayLong(finder.chosen.day)}, {hourText(finder.chosen.hour)}</strong></span>
        {onAddMeeting && <button type="button" className="button outline" onClick={() => {
          const added = onAddMeeting({ title: `${finder.title} · ${groupName}`, date: finder.chosen!.day, time: `${String(finder.chosen!.hour).padStart(2, '0')}:00` });
          setMessage(added === null ? 'Não foi possível pôr na agenda agora.' : added ? 'Está na sua agenda.' : 'Já estava na sua agenda.');
        }}><CalendarPlus size={16} aria-hidden="true" />Pôr na minha agenda</button>}</div>
        : <p className="muted small">{editable ? 'Toque nas horas em que você pode e salve. Quanto mais escura, mais gente pode.' : 'O grupo está arquivado: dá só para ver.'}</p>}
      <div className="tf-grid" role="group" aria-label="Horas de cada dia" style={{ gridTemplateColumns: `3rem repeat(${finder.days.length}, minmax(2.6rem, 1fr))` }}>
        <span aria-hidden="true" />
        {finder.days.map((day, column) => {
          const slots = hours.map(hour => column * 24 + hour);
          const all = slots.every(slot => mine.has(slot));
          return editable ? <button key={day} type="button" className="tf-day" aria-pressed={all} aria-label={`${dayLong(day)}: ${all ? 'desmarcar' : 'marcar'} o dia todo`}
            onClick={() => toggle(slots, !all)}>{dayShort(day)}</button> : <span key={day} className="tf-day">{dayShort(day)}</span>;
        })}
        {hours.map(hour => [<span key={`h${hour}`} className="tf-hour">{hourText(hour)}</span>, ...finder.days.map((day, column) => {
          const slot = column * 24 + hour, who = counts.get(slot) ?? [], level = Math.ceil(who.length / total * 4), chosen = finder.chosen?.day === day && finder.chosen.hour === hour;
          const label = `${dayLong(day)}, ${hourText(hour)}: ${mine.has(slot) ? 'você pode; ' : ''}${who.length ? people(who.length) : 'ninguém marcou'}`;
          return editable ? <button key={slot} type="button" className={`tf-cell lv${level}`} aria-pressed={mine.has(slot)} aria-label={label} onClick={() => toggle([slot], !mine.has(slot))}>
            {mine.has(slot) && <Check size={14} aria-hidden="true" />}</button>
            : <span key={slot} className={`tf-cell lv${level}${chosen ? ' chosen' : ''}`} role="img" aria-label={label}>{mine.has(slot) && <Check size={14} aria-hidden="true" />}</span>;
        })])}
      </div>
      {editable && <div className="form-footer">
        <button type="button" className="button primary" disabled={busy || !changed} onClick={() => send({ action: 'finder_mark', finder: finder.id, slots: [...mine].sort((a, b) => a - b) }, 'Suas horas foram salvas.')}>Salvar minhas horas</button>
      </div>}
      {best.length > 0 && <><h3 className="small-heading">Melhores horários</h3><ol className="tf-best">{best.map(([slot, who]) => {
        const { day, hour } = slotOf(finder, slot);
        return <li key={slot}><span><strong>{dayLong(day)}, {hourText(hour)}</strong><small>{people(who.length)}: {who.join(', ')}</small></span>
          {finder.can_manage && editable && <button type="button" className="button outline" disabled={busy} onClick={() => {
            if (window.confirm(`Marcar ${dayLong(day)}, ${hourText(hour)} para o grupo? Depois disso as horas não mudam mais.`)) void send({ action: 'finder_manage', finder: finder.id, day, hour }, 'Horário marcado.');
          }}>Marcar este</button>}</li>;
      })}</ol></>}
      {finder.can_manage && !archived && <button type="button" className="text-button cm-danger" disabled={busy} onClick={async () => {
        if (window.confirm(`Apagar “${finder.title}” e as horas que todos marcaram?`) && await send({ action: 'finder_manage', finder: finder.id, remove: true }, '') !== undefined) onClose();
      }}><Trash2 size={14} aria-hidden="true" />Apagar esta busca</button>}
      {message && <p className="cm-message" role="status">{message}</p>}
    </div>
  </Modal>;
}

/** Propor: os próximos 21 dias como opção (até 7) e a faixa de horas. Pode avisar na conversa do grupo. */
function FinderForm({ space, chat, onClose, onCreated }: { space: string; chat: boolean; onClose: () => void; onCreated: (created: TimeFinder) => void }) {
  const today = todayInBrazil();
  const options = Array.from({ length: 21 }, (_, index) => shift(today, index));
  const [days, setDays] = useState<string[]>([]);
  const [from, setFrom] = useState(18);
  const [to, setTo] = useState(22);
  const [notify, setNotify] = useState(chat);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <Modal title="Achar horário em comum" onClose={onClose}><form className="entry-form" onSubmit={async event => {
    event.preventDefault(); const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (!days.length) { setMessage('Escolha pelo menos um dia.'); return; }
    setBusy(true); setMessage('');
    try {
      const created = await api<TimeFinder>('/api/network', { action: 'finder_create', space, title, days, from, to });
      if (notify) await api('/api/network', { action: 'send_message', space, body: `📅 ${created.title}: marquei alguns dias para achar um horário. Marque quando você pode em Mural › Achar horário.` }).catch(() => null);
      onCreated(created);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível criar.'); }
    finally { setBusy(false); }
  }}>
    <label htmlFor="tf-title">Para quê?</label><input id="tf-title" name="title" required maxLength={120} placeholder="Ex.: Reunião do trabalho" />
    <fieldset className="nw-choice"><legend>Quais dias? (até 7)</legend>
      <div className="nw-chips">{options.map((day, index) => <button key={day} type="button" className="nw-chip" aria-pressed={days.includes(day)}
        disabled={!days.includes(day) && days.length >= 7} onClick={() => setDays(list => list.includes(day) ? list.filter(item => item !== day) : [...list, day].sort())}>
        {index === 0 ? 'Hoje' : index === 1 ? 'Amanhã' : dayShort(day)}</button>)}</div>
    </fieldset>
    <div className="form-grid">
      <div><label htmlFor="tf-from">Das</label><select id="tf-from" value={from} onChange={event => { const value = Number(event.target.value); setFrom(value); if (to <= value) setTo(value + 1); }}>
        {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hourText(hour)}</option>)}</select></div>
      <div><label htmlFor="tf-to">Até</label><select id="tf-to" value={to} onChange={event => setTo(Number(event.target.value))}>
        {Array.from({ length: 24 - from }, (_, index) => from + index + 1).map(hour => <option key={hour} value={hour}>{hourText(hour)}</option>)}</select></div>
    </div>
    {chat && <label className="cm-check"><input type="checkbox" checked={notify} onChange={event => setNotify(event.target.checked)} /> Avisar na conversa do grupo</label>}
    {message && <p className="cm-message" role="alert">{message}</p>}
    <div className="form-footer"><button className="button primary" disabled={busy}>Criar</button></div>
  </form></Modal>;
}
