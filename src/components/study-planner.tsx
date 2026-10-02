'use client';
import { useState } from 'react';
import { ArrowRight, Check, CheckCheck, Sparkles, Timer } from 'lucide-react';
import { dateKey, type Workspace } from '@/lib/workspace';
import { studySuggestions, type StudySuggestion } from '@/lib/academic';
import styles from './academic.module.css';

type Props = { data: Workspace; update: (change: (previous: Workspace) => Workspace) => void; blocked: boolean; onAgenda: () => void };
// Meu dia: até duas propostas de estudo calculadas da grade e dos prazos; nada entra na agenda sem a pessoa aceitar.
export default function StudyPlanner({ data, update, blocked, onAgenda }: Props) {
  const [message, setMessage] = useState('');
  const suggestions = studySuggestions(data, dateKey());
  function accept(item: StudySuggestion) {
    update((previous) => previous.tasks.some((task) => task.id === item.id) ? previous : { ...previous, tasks: [...previous.tasks, { id: item.id, title: item.title, subjectId: item.subjectId, date: item.date, minutes: item.minutes, kind: 'Estudo', done: false }] });
    setMessage('Bloco adicionado à agenda. Você pode editar o horário e a duração.');
  }
  return <section className={`${styles.planner} ${styles.compactPlanner}`}>
    <div className={styles.plannerHeading}><span className={styles.iconTile}><Sparkles size={22} aria-hidden="true" /></span><div><span className="eyebrow">Sugestões para você</span><h2>Um pouco de direção para hoje.</h2><p>Sugestões calculadas a partir da sua grade e dos prazos. Nada é aplicado sozinho.</p></div></div>
    <div className={styles.suggestions}>{suggestions.slice(0, 2).map((item) => <article key={item.id} className={styles.suggestion}><span className={styles.suggestionLabel}><Timer size={14} aria-hidden="true" />{item.minutes} minutos · proposta de estudo</span><h3>{item.title}</h3><p>{item.reason}</p><button className="text-button" disabled={blocked} onClick={() => accept(item)}><span aria-hidden="true">+</span>Adicionar à minha agenda</button></article>)}{suggestions.length === 0 && <div className={styles.emptySuggestion}><CheckCheck size={24} aria-hidden="true" /><p>Nenhuma nova sugestão por aqui. Seus blocos já podem estar na agenda, ou não há aulas e prazos próximos.</p><button className="text-button" onClick={onAgenda}>Ver minha agenda <ArrowRight size={15} aria-hidden="true" /></button></div>}</div>
    {message && <p className={styles.inlineNotice} role="status"><Check size={15} aria-hidden="true" />{message}</p>}
  </section>;
}
