'use client';

import { useState, useEffect } from 'react';
import { Check, Clock, Plus, Sun, Sunrise, Sunset, Trash2 } from 'lucide-react';

export interface RoutineHabit {
  id: string;
  period: 'morning' | 'afternoon' | 'night';
  time: string;
  title: string;
  area: string;
  done: boolean;
}

const defaultHabits: RoutineHabit[] = [
  // Manhã
  { id: 'h-1', period: 'morning', time: '07:00', title: 'Despertar, hidratação & café revigorante', area: 'Saúde', done: true },
  { id: 'h-2', period: 'morning', time: '07:30', title: 'Revisão rápida de notas e conceitos-chave', area: 'Estudos', done: true },
  { id: 'h-3', period: 'morning', time: '08:30', title: 'Planejamento das 3 prioridades essenciais do dia', area: 'Organização', done: false },

  // Tarde
  { id: 'h-4', period: 'afternoon', time: '13:30', title: 'Bloco de foco profundo: Leitura obrigatória UNIP', area: 'Estudos', done: false },
  { id: 'h-5', period: 'afternoon', time: '15:30', title: 'Pausa para caminhada, respiração ou café', area: 'Saúde', done: false },
  { id: 'h-6', period: 'afternoon', time: '16:30', title: 'Fichamento e resumos no caderno digital', area: 'Estudos', done: false },

  // Noite
  { id: 'h-7', period: 'night', time: '19:10', title: 'Aula Presencial UNIP Psicologia', area: 'Acadêmico', done: false },
  { id: 'h-8', period: 'night', time: '22:30', title: 'Organizar mochila e compromissos de amanhã', area: 'Organização', done: false },
  { id: 'h-9', period: 'night', time: '23:00', title: 'Desconexão de telas & higiene do sono', area: 'Saúde', done: false },
];

export function DailyRoutine({ demo }: { demo: boolean }) {
  const [habits, setHabits] = useState<RoutineHabit[]>(() => {
    if (demo) return defaultHabits;
    try {
      const saved = localStorage.getItem('faculdade-psi:routine:v1');
      return saved ? JSON.parse(saved) : defaultHabits;
    } catch {
      return defaultHabits;
    }
  });

  const [showAdd, setShowAdd] = useState(false);
  const [period, setPeriod] = useState<'morning' | 'afternoon' | 'night'>('morning');
  const [time, setTime] = useState('08:00');
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('Estudos');

  useEffect(() => {
    if (demo) return;
    try {
      localStorage.setItem('faculdade-psi:routine:v1', JSON.stringify(habits));
    } catch {
      // Safely ignore storage errors
    }
  }, [habits, demo]);

  const completedCount = habits.filter(h => h.done).length;
  const progressPercent = habits.length ? Math.round((completedCount / habits.length) * 100) : 0;

  function toggleHabit(id: string) {
    setHabits(habits.map(h => (h.id === id ? { ...h, done: !h.done } : h)));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const newHabit: RoutineHabit = {
      id: crypto.randomUUID(),
      period,
      time,
      title: title.trim(),
      area,
      done: false,
    };

    setHabits([...habits, newHabit]);
    setTitle('');
    setShowAdd(false);
  }

  function handleDelete(id: string) {
    setHabits(habits.filter(h => h.id !== id));
  }

  const morningHabits = habits.filter(h => h.period === 'morning');
  const afternoonHabits = habits.filter(h => h.period === 'afternoon');
  const nightHabits = habits.filter(h => h.period === 'night');

  return (
    <div className="routine-container">
      <div className="finances-header-row">
        <div>
          <h2>Minha Rotina Diária</h2>
          <p>Estruture seu ritmo matinal, vespertino e noturno com clareza e previsibilidade.</p>
        </div>
        <button className="button primary" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={16} aria-hidden="true" />
          {showAdd ? 'Fechar formulário' : 'Novo hábito / bloco'}
        </button>
      </div>

      {/* PROGRESS TRACKER */}
      <div className="panel routine-progress-deck">
        <div className="routine-stats-header">
          <div>
            <h3>Ritmo de Hoje: {progressPercent}% Concluído</h3>
            <p>{completedCount} de {habits.length} etapas cumpridas com sucesso</p>
          </div>
          <span className="routine-score-badge">{completedCount}/{habits.length}</span>
        </div>
        <div className="routine-bar-track">
          <div className="routine-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* ADD HABIT MODAL/PANEL */}
      {showAdd && (
        <form onSubmit={handleAdd} className="panel finance-form">
          <h3>Adicionar Bloco à Rotina</h3>
          <div className="finance-form-grid">
            <div>
              <label htmlFor="r-period">Período</label>
              <select id="r-period" value={period} onChange={e => setPeriod(e.target.value as any)}>
                <option value="morning">Manhã (06h - 12h)</option>
                <option value="afternoon">Tarde (12h - 18h)</option>
                <option value="night">Noite (18h - 23h)</option>
              </select>
            </div>
            <div>
              <label htmlFor="r-time">Horário habitual</label>
              <input id="r-time" type="time" value={time} onChange={e => setTime(e.target.value)} required />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label htmlFor="r-title">Atividade ou Hábito</label>
              <input
                id="r-title"
                type="text"
                placeholder="Ex.: Revisar fichamentos de psicologia..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="r-area">Área</label>
              <select id="r-area" value={area} onChange={e => setArea(e.target.value)}>
                <option value="Estudos">Estudos</option>
                <option value="Saúde">Saúde & Bem-estar</option>
                <option value="Acadêmico">Acadêmico / UNIP</option>
                <option value="Organização">Organização</option>
                <option value="Lazer">Lazer & Pausa</option>
              </select>
            </div>
          </div>
          <div className="form-footer" style={{ marginTop: '14px' }}>
            <button type="button" className="button outline" onClick={() => setShowAdd(false)}>Cancelar</button>
            <button type="submit" className="button primary">Salvar na rotina</button>
          </div>
        </form>
      )}

      {/* ROUTINE PERIODS */}
      <div className="routine-columns">
        {/* MANHÃ */}
        <section className="panel routine-column">
          <div className="routine-col-header morning">
            <Sunrise size={18} />
            <div>
              <h4>Manhã</h4>
              <small>Despertar & Ativação (06h - 12h)</small>
            </div>
          </div>
          <ul className="routine-list">
            {morningHabits.map(h => (
              <li key={h.id} className={`routine-item ${h.done ? 'done' : ''}`}>
                <button
                  type="button"
                  className="routine-check-btn"
                  onClick={() => toggleHabit(h.id)}
                  aria-label={`Concluir hábito: ${h.title}`}
                >
                  {h.done ? <Check size={14} /> : null}
                </button>
                <div className="routine-item-info">
                  <span className="routine-item-time"><Clock size={11} /> {h.time}</span>
                  <strong>{h.title}</strong>
                  <span className="routine-area-tag">{h.area}</span>
                </div>
                <button
                  className="icon-button danger"
                  onClick={() => handleDelete(h.id)}
                  aria-label={`Excluir: ${h.title}`}
                  title="Excluir hábito"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {!morningHabits.length && <li className="routine-empty">Nenhum bloco matinal cadastrado.</li>}
          </ul>
        </section>

        {/* TARDE */}
        <section className="panel routine-column">
          <div className="routine-col-header afternoon">
            <Sun size={18} />
            <div>
              <h4>Tarde</h4>
              <small>Foco & Aprofundamento (12h - 18h)</small>
            </div>
          </div>
          <ul className="routine-list">
            {afternoonHabits.map(h => (
              <li key={h.id} className={`routine-item ${h.done ? 'done' : ''}`}>
                <button
                  type="button"
                  className="routine-check-btn"
                  onClick={() => toggleHabit(h.id)}
                  aria-label={`Concluir hábito: ${h.title}`}
                >
                  {h.done ? <Check size={14} /> : null}
                </button>
                <div className="routine-item-info">
                  <span className="routine-item-time"><Clock size={11} /> {h.time}</span>
                  <strong>{h.title}</strong>
                  <span className="routine-area-tag">{h.area}</span>
                </div>
                <button
                  className="icon-button danger"
                  onClick={() => handleDelete(h.id)}
                  aria-label={`Excluir: ${h.title}`}
                  title="Excluir hábito"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {!afternoonHabits.length && <li className="routine-empty">Nenhum bloco vespertino cadastrado.</li>}
          </ul>
        </section>

        {/* NOITE */}
        <section className="panel routine-column">
          <div className="routine-col-header night">
            <Sunset size={18} />
            <div>
              <h4>Noite</h4>
              <small>Aulas & Desaceleração (18h - 23h)</small>
            </div>
          </div>
          <ul className="routine-list">
            {nightHabits.map(h => (
              <li key={h.id} className={`routine-item ${h.done ? 'done' : ''}`}>
                <button
                  type="button"
                  className="routine-check-btn"
                  onClick={() => toggleHabit(h.id)}
                  aria-label={`Concluir hábito: ${h.title}`}
                >
                  {h.done ? <Check size={14} /> : null}
                </button>
                <div className="routine-item-info">
                  <span className="routine-item-time"><Clock size={11} /> {h.time}</span>
                  <strong>{h.title}</strong>
                  <span className="routine-area-tag">{h.area}</span>
                </div>
                <button
                  className="icon-button danger"
                  onClick={() => handleDelete(h.id)}
                  aria-label={`Excluir: ${h.title}`}
                  title="Excluir hábito"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {!nightHabits.length && <li className="routine-empty">Nenhum bloco noturno cadastrado.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
