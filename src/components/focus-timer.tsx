'use client';
import { useEffect, useRef, useState } from 'react';
import { Clock3, Pause, Play, Square } from 'lucide-react';
import type { Workspace } from '@/lib/workspace';
import { lifeAreas } from '@/lib/life';
import { finishFocus, focusMilliseconds, formatFocusTime, pauseFocus, resumeFocus } from '@/lib/focus';
import { SubjectOptions } from './subject-options';

type Props = {
  data: Workspace; disabled: boolean; status: string; demo: boolean;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  request?: { id: string; subjectId: string } | null;
};
export function FocusTimer({ data, disabled, status, demo, update, request }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activity, setActivity] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [target, setTarget] = useState(0);
  const [now, setNow] = useState(0);
  const handled = useRef('');
  const section = useRef<HTMLElement>(null);
  const activityInput = useRef<HTMLInputElement>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focus = data.activeFocus;
  const running = focus?.segments.at(-1)?.end === null;
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [running, focus]);
  useEffect(() => {
    if (!request || handled.current === request.id) return;
    handled.current = request.id; setExpanded(true);
    requestAnimationFrame(() => section.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
    if (!request.subjectId && !focus) setFocusTick(tick => tick + 1);
    if (focus || !request.subjectId) return; // Never discard an existing activity's partial time.
    setSubjectId(request.subjectId); setAreaId('studies'); setTarget(25);
    setActivity(data.subjects.find(s => s.id === request.subjectId)?.name ?? 'Estudo');
  }, [request, focus, data.subjects]);
  useEffect(() => { if (!focusTick || !expanded) return; const timer = window.setTimeout(() => activityInput.current?.focus(), 80); return () => window.clearTimeout(timer); }, [focusTick, expanded]);
  const seconds = focus ? focusMilliseconds(focus, now || focus.segments[0].start) / 1000 : 0;
  const recent = data.sessions.slice(-20).toReversed();
  function start() {
    const timestamp = Date.now();
    const id = crypto.randomUUID();
    update(previous => previous.activeFocus ? previous : { ...previous, activeFocus: {
      id, activity: activity.trim() || 'Atividade pessoal', areaId, subjectId, targetSeconds: target * 60,
      segments: [{ start: timestamp, end: null }],
    } });
    setNow(timestamp);
  }
  return <section ref={section} className="focus-tracker" aria-label="Registro de tempo e foco">
    <div className="focus-strip">
      <button className="focus-summary" aria-expanded={expanded} aria-controls="focus-details" onClick={() => setExpanded(!expanded)}>
        <Clock3 size={20} aria-hidden="true" /><span><strong>{focus?.activity ?? 'Tempo e foco'}</strong><small>{focus ? running ? 'Em andamento' : 'Pausado' : 'Meça qualquer atividade'}</small></span>
      </button>
      <output className="focus-clock" role="timer" aria-label="Tempo registrado">{formatFocusTime(seconds)}</output>
      <div className="focus-controls">
        <button className="button primary" aria-label={running ? 'Pausar' : focus ? 'Continuar' : 'Começar foco'} disabled={disabled} onClick={() => {
          if (!focus) { start(); return; }
          const timestamp = Date.now(); setNow(timestamp);
          update(previous => !previous.activeFocus ? previous : { ...previous, activeFocus: running ? pauseFocus(previous.activeFocus, timestamp) : resumeFocus(previous.activeFocus, timestamp) });
        }}>{running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}<span className="focus-control-label">{running ? 'Pausar' : focus ? 'Continuar' : 'Começar foco'}</span></button>
        {focus && <button className="button outline" aria-label="Encerrar e registrar" disabled={disabled || seconds <= 0} onClick={() => update(previous => finishFocus(previous, Date.now()))}><Square size={16} aria-hidden="true" /><span className="focus-control-label">Encerrar e registrar</span></button>}
      </div>
    </div>
    {focus && focus.targetSeconds > 0 && <p className="focus-status">{seconds >= focus.targetSeconds ? 'Meta alcançada. Encerre quando terminar sua atividade.' : `Meta: ${focus.targetSeconds / 60} min · o tempo continua até você encerrar.`}</p>}
    <div className="focus-status">{demo ? 'Demonstração: o tempo não será salvo.' : status}{focus ? ' · Aguarde a confirmação de salvamento antes de fechar.' : ''}</div>
    <div id="focus-details" className="focus-details" hidden={!expanded}>
      {!focus && <div className="focus-fields">
        <label>O que você vai fazer?<input ref={activityInput} value={activity} maxLength={160} onChange={e => setActivity(e.target.value)} placeholder="Aula, trabalho, treino, leitura…" /></label>
        <label>Área do tempo<select value={areaId} onChange={e => setAreaId(e.target.value)}><option value="">Sem área</option>{lifeAreas(data).filter(a => !a.hidden).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Matéria do foco · opcional<select value={subjectId} onChange={e => setSubjectId(e.target.value)}><option value="">Sem matéria</option><SubjectOptions data={data} /></select></label>
        <label>Meta de tempo<select value={target} onChange={e => setTarget(Number(e.target.value))}><option value={0}>Cronômetro livre</option>{[10,25,45].map(n => <option key={n} value={n}>{n} minutos</option>)}</select></label>
      </div>}
      <p className="focus-help">O cronômetro conta também com o navegador fechado. Pause nas interrupções e encerre ao terminar. Ele mede tempo registrado, não detecta sua atenção automaticamente.</p>
      <h2>Últimos registros de tempo</h2>
      {!recent.length ? <p>Nenhuma sessão encerrada ainda.</p> : <ul className="focus-history">{recent.map(s => <li key={s.id}><span><strong>{s.activity ?? 'Foco de estudo'}</strong><small>{s.date.split('-').reverse().join('/')} · {lifeAreas(data).find(a => a.id === s.areaId)?.name ?? 'Sem área'}</small></span><span>{formatFocusTime(s.seconds ?? s.minutes * 60)}</span></li>)}</ul>}
    </div>
  </section>;
}
