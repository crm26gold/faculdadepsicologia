'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { addDays, dateKey, type Workspace } from '@/lib/workspace';
import { lifeAreas } from '@/lib/life';
import { courseOf } from '@/lib/courses';
import { formatFocusTime } from '@/lib/focus';

type Session = Workspace['sessions'][number];
type Props = { data: Workspace; blocked: boolean; update: (change: (previous: Workspace) => Workspace) => boolean };
const periods = [{ id: '7', label: '7 dias', days: 7 }, { id: '30', label: '30 dias', days: 30 }, { id: '90', label: '90 dias', days: 90 }, { id: 'all', label: 'Tudo', days: 0 }] as const;
const seconds = (session: Session) => session.seconds ?? session.minutes * 60;
export const formatDuration = (total: number) => {
  const minutes = Math.round(total / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}min` : ''}`;
};
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

function Breakdown({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return <section className="focus-breakdown" aria-label={title}>
    <h2>{title}</h2>
    {!rows.length ? <p className="muted">Sem registros no período.</p> : <ul>{rows.map(([label, value]) => <li key={label}>
      <span className="focus-bar-label"><strong>{label}</strong><small>{formatDuration(value)} · {Math.round(value / total * 100)}%</small></span>
      <span className="focus-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, value / rows[0][1] * 100)}%` }} /></span>
    </li>)}</ul>}
  </section>;
}

export function FocusHistory({ data, blocked, update }: Props) {
  const [period, setPeriod] = useState<(typeof periods)[number]['id']>('7');
  const today = dateKey();
  const days = periods.find((item) => item.id === period)!.days;
  const from = days ? addDays(today, 1 - days) : '';
  const sessions = data.sessions.filter((session) => !from || session.date >= from);
  const total = sessions.reduce((sum, session) => sum + seconds(session), 0);
  const activeDays = new Set(sessions.map((session) => session.date)).size;
  const group = (key: (session: Session) => string) => {
    const map = new Map<string, number>();
    for (const session of sessions) map.set(key(session), (map.get(key(session)) ?? 0) + seconds(session));
    return [...map].sort((a, b) => b[1] - a[1]);
  };
  const areas = lifeAreas(data);
  const subject = (session: Session) => data.subjects.find((item) => item.id === session.subjectId);
  const byArea = group((session) => areas.find((area) => area.id === session.areaId)?.name ?? (session.subjectId ? 'Estudos e aprendizagem' : 'Sem área'));
  const studies = sessions.filter((session) => subject(session));
  const byStudy = (() => {
    const map = new Map<string, number>();
    for (const session of studies) {
      const item = subject(session)!; const course = courseOf(data, item);
      const label = course ? `${course.name} › ${item.name}` : item.name;
      map.set(label, (map.get(label) ?? 0) + seconds(session));
    }
    return [...map].sort((a, b) => b[1] - a[1]);
  })();
  const byActivity = group((session) => session.context?.projectTitle ?? session.activity ?? 'Foco de estudo').slice(0, 8);
  const chartDays = Array.from({ length: Math.min(days || 30, 30) }, (_, index) => addDays(today, index + 1 - Math.min(days || 30, 30)));
  const perDay = new Map<string, number>();
  for (const session of data.sessions) perDay.set(session.date, (perDay.get(session.date) ?? 0) + seconds(session));
  const peak = Math.max(1, ...chartDays.map((day) => perDay.get(day) ?? 0));
  const byDate = [...new Set(sessions.map((session) => session.date))].sort().reverse();
  function remove(session: Session) {
    if (!window.confirm(`Apagar o registro "${session.activity ?? 'Foco'}" de ${formatDuration(seconds(session))}? Isso não pode ser desfeito.`)) return;
    update((previous) => ({ ...previous, sessions: previous.sessions.filter((item) => item.id !== session.id) }));
  }
  return <div className="focus-page">
    <div className="planning-nav-bar" role="group" aria-label="Período">
      {periods.map((item) => <button key={item.id} className={`planning-tab ${period === item.id ? 'active' : ''}`} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>)}
    </div>
    <div className="bento-metric-row">
      <div className="bento-metric-card"><span className="metric-label">Tempo total</span><div className="metric-value">{formatDuration(total)}</div><span className="metric-sub">{periods.find((item) => item.id === period)!.label === 'Tudo' ? 'Desde o início' : `Nos últimos ${days} dias`}</span></div>
      <div className="bento-metric-card"><span className="metric-label">Sessões</span><div className="metric-value">{sessions.length}</div><span className="metric-sub">{sessions.length ? `Média de ${formatDuration(total / sessions.length)}` : 'Nenhuma ainda'}</span></div>
      <div className="bento-metric-card"><span className="metric-label">Dias com foco</span><div className="metric-value">{activeDays}</div><span className="metric-sub">{activeDays ? `${formatDuration(total / activeDays)} por dia ativo` : 'Comece pelo cronômetro acima'}</span></div>
      <div className="bento-metric-card"><span className="metric-label">Hoje</span><div className="metric-value">{formatDuration(perDay.get(today) ?? 0)}</div><span className="metric-sub">Tempo registrado hoje</span></div>
    </div>
    <section className="focus-chart" aria-label="Tempo por dia">
      <h2>Tempo por dia</h2>
      <div className="focus-chart-bars">{chartDays.map((day) => {
        const value = perDay.get(day) ?? 0;
        return <div key={day} className="focus-chart-day" title={`${dayLabel(day)}: ${formatDuration(value)}`}>
          <span className="focus-chart-bar" style={{ height: `${value ? Math.max(4, value / peak * 100) : 0}%` }} />
          {chartDays.length <= 7 && <small>{dayLabel(day).split(',')[0]}</small>}
        </div>;
      })}</div>
      <p className="sr-only">{chartDays.map((day) => `${dayLabel(day)}: ${formatDuration(perDay.get(day) ?? 0)}`).join('; ')}</p>
    </section>
    <div className="focus-breakdowns">
      <Breakdown title="Por área da vida" rows={byArea} total={total} />
      <Breakdown title="Por curso e matéria" rows={byStudy} total={total} />
      <Breakdown title="Por atividade ou projeto" rows={byActivity} total={total} />
    </div>
    <section className="focus-log" aria-label="Registros">
      <h2>Registros</h2>
      {!byDate.length ? <p className="muted">Nenhuma sessão encerrada neste período. Use o cronômetro “Tempo e foco” acima: comece, pause quando precisar e encerre para registrar.</p> : byDate.map((day) => {
        const items = sessions.filter((session) => session.date === day).toReversed();
        return <div key={day} className="focus-log-day">
          <h3>{dayLabel(day)} <small>{formatDuration(items.reduce((sum, session) => sum + seconds(session), 0))}</small></h3>
          <ul className="focus-history">{items.map((session) => {
            const item = subject(session);
            const where = [areas.find((area) => area.id === session.areaId)?.name, item?.name, session.context?.projectTitle].filter(Boolean).join(' · ') || 'Sem área';
            return <li key={session.id}>
              <span><strong>{session.activity ?? 'Foco de estudo'}</strong><small>{where}</small></span>
              <span className="focus-log-actions">{formatFocusTime(seconds(session))}<button className="icon-button" aria-label={`Apagar registro ${session.activity ?? 'Foco'}`} disabled={blocked} onClick={() => remove(session)}><Trash2 size={15} aria-hidden="true" /></button></span>
            </li>;
          })}</ul>
        </div>;
      })}
    </section>
  </div>;
}
