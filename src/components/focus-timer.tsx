'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Check } from 'lucide-react';
import type { Subject } from '@/lib/workspace';

export function FocusTimer({ onComplete, disabled, request, subjects }: { onComplete: (minutes: number, subjectId: string) => boolean; disabled: boolean; request?: { id: string; subjectId: string } | null; subjects: Subject[] }) {
  const [subjectId, setSubjectId] = useState('');
  const [saveError, setSaveError] = useState('');
  const handled = useRef('');
  const [duration, setDuration] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const end = useRef(0);
  const callback = useRef(onComplete);
  useEffect(() => {
    if (!request || handled.current === request.id || disabled) return;
    handled.current = request.id;
    if (running && !window.confirm('Substituir o foco em andamento? O tempo parcial não será registrado.')) return;
    setSubjectId(request.subjectId); setDuration(25); setRemaining(25 * 60); setComplete(false); setSaveError('');
    end.current = Date.now() + 25 * 60 * 1000; setRunning(true);
  }, [request, disabled, running]);
  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { setRunning(false); if (callback.current(duration, subjectId)) setComplete(true); else setSaveError('Não foi possível registrar. Tente registrar novamente.'); }
    }, 250);
    return () => clearInterval(interval);
  }, [running, duration, subjectId]);
  function toggle() {
    if (running) { setRemaining(Math.max(0, Math.ceil((end.current - Date.now()) / 1000))); setRunning(false); }
    else { end.current = Date.now() + remaining * 1000; setRunning(true); }
  }
  return <div className="focus-card">
    <div className="section-heading"><h2>Um momento de foco</h2><span className="tiny-tag">No seu ritmo</span></div>
    <p>Uma coisa de cada vez já é um começo.</p>
    <label htmlFor="focus-subject">Matéria do foco · opcional</label><select id="focus-subject" value={subjectId} disabled={running || disabled} onChange={e => setSubjectId(e.target.value)}><option value="">Foco pessoal</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    {saveError && <p role="alert">{saveError}<button disabled={disabled} onClick={() => { if (onComplete(duration, subjectId)) { setSaveError(''); setComplete(true); } }}>Registrar sessão</button></p>}
    <div className="duration-options" aria-label="Duração do foco">{[10, 25, 45].map((minutes) => <button key={minutes} disabled={running} aria-pressed={duration === minutes} onClick={() => { setDuration(minutes); setRemaining(minutes * 60); setComplete(false); }}>{minutes} min</button>)}</div>
    <div className="timer-digits" role="timer" aria-label={`${Math.floor(remaining / 60)} minutos e ${remaining % 60} segundos`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</div>
    <div className="timer-actions"><button className="button primary" disabled={disabled || complete} onClick={toggle}>{complete ? <Check size={17} /> : running ? <Pause size={17} /> : <Play size={17} />}{complete ? 'Sessão concluída' : running ? 'Pausar' : remaining < duration * 60 ? 'Continuar' : 'Começar foco'}</button><button className="icon-button" aria-label="Reiniciar temporizador" onClick={() => { setRunning(false); setRemaining(duration * 60); setComplete(false); }}><RotateCcw size={17} aria-hidden="true" /></button></div>
    <small role="status">{complete ? 'Sessão enviada. Confira o indicador de salvamento.' : 'Pode pausar. Seu ritmo importa mais que a velocidade.'}</small>
  </div>;
}
