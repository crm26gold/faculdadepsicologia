'use client';
import { useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, CheckCheck, CloudOff, Link2, Sparkles, Timer } from 'lucide-react';
import { dateKey, type Workspace } from '@/lib/workspace';
import { studySuggestions, type StudySuggestion } from '@/lib/academic';
import styles from './academic.module.css';

type Props = { data: Workspace; update: (change: (previous: Workspace) => Workspace) => void; blocked: boolean; compact?: boolean; onAgenda: () => void };
export default function StudyPlanner({ data, update, blocked, compact = false, onAgenda }: Props) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const suggestions = studySuggestions(data, dateKey()).filter((item) => !subject || item.subjectId === subject);
  function accept(item: StudySuggestion) {
    update((previous) => previous.tasks.some((task) => task.id === item.id) ? previous : { ...previous, tasks: [...previous.tasks, { id: item.id, title: item.title, subjectId: item.subjectId, date: item.date, minutes: item.minutes, kind: 'Estudo', done: false }] });
    setMessage('Bloco adicionado à agenda. Você pode editar o horário e a duração.');
  }
  return <section className={`${styles.planner} ${compact ? styles.compactPlanner : ''}`}>
    <div className={styles.plannerHeading}><span className={styles.iconTile}><Sparkles size={22} aria-hidden="true" /></span><div><span className="eyebrow">Planejador local · você decide</span><h2>{compact ? 'Um pouco de direção para hoje.' : 'Transforme a semana em pequenos passos.'}</h2><p>Sugestões calculadas a partir da sua grade e dos prazos. Nada é aplicado sozinho.</p></div></div>
    {!compact && <div className={styles.filterRow}><label htmlFor="planner-subject">Focar em uma matéria</label><select id="planner-subject" value={subject} onChange={(event) => setSubject(event.target.value)}><option value="">Visão geral</option>{data.subjects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>}
    <div className={styles.suggestions}>{suggestions.slice(0, compact ? 2 : 3).map((item) => <article key={item.id} className={styles.suggestion}><span className={styles.suggestionLabel}><Timer size={14} aria-hidden="true" />{item.minutes} minutos · proposta de estudo</span><h3>{item.title}</h3><p>{item.reason}</p><button className="text-button" disabled={blocked} onClick={() => accept(item)}><PlusSign />Adicionar à minha agenda</button></article>)}{suggestions.length === 0 && <div className={styles.emptySuggestion}><CheckCheck size={24} aria-hidden="true" /><p>Nenhuma nova sugestão por aqui. Seus blocos já podem estar na agenda, ou não há aulas e prazos próximos para esta matéria.</p><button className="text-button" onClick={onAgenda}>Ver minha agenda <ArrowRight size={15} aria-hidden="true" /></button></div>}</div>
    {message && <p className={styles.inlineNotice} role="status"><Check size={15} aria-hidden="true" />{message}</p>}
    {!compact && <><div className={styles.aiBoundary}><Sparkles size={20} aria-hidden="true" /><div><strong>IA generativa ainda não conectada.</strong><p>Este planejador usa regras locais, não um modelo de IA. Suas notas não são enviadas a terceiros. Assistentes por matéria, análise dos materiais e sugestões por IA precisam de API, limite de consumo e permissões de acesso.</p></div></div><div className={styles.studyStats}><span><BookOpen size={19} aria-hidden="true" /><strong>{data.subjects.length}</strong> matérias organizadas</span><span><CalendarDays size={19} aria-hidden="true" /><strong>{data.tasks.filter((item) => !item.done).length}</strong> próximos passos</span><span><CloudOff size={19} aria-hidden="true" />Sem envio de notas à IA</span></div><IntegrationHub onAgenda={onAgenda} /></>}
  </section>;
}
function PlusSign() { return <span aria-hidden="true">+</span>; }
export function IntegrationHub({ onAgenda }: { onAgenda: () => void }) {
  const [expanded, setExpanded] = useState('');
  const items = [
    { id: 'calendar', name: 'Google Agenda, Outlook e Apple', status: 'Exportação .ics disponível', text: 'Leve os eventos do período selecionado para outro calendário. Importação manual, sem sincronização de volta.', permission: 'Já funciona: exportar um arquivo da agenda. Sincronização automática exigirá OAuth e autorização específica para ler/escrever eventos.' },
    { id: 'drive', name: 'Google Drive e materiais', status: 'Conexão pendente', text: 'Uma biblioteca por matéria para PDFs, resumos e materiais escolhidos por você.', permission: 'Próxima etapa: conectar sua conta e selecionar quais arquivos poderão ser lidos. Nenhum acesso ao Drive foi ativado.' },
    { id: 'teams', name: 'Teams, Outlook e UNIP', status: 'Acesso institucional a avaliar', text: 'Trazer atividades e avisos, quando a instituição disponibilizar acesso permitido.', permission: 'Depende de APIs, autorização da conta institucional e eventuais políticas da UNIP. Não está conectado e não vamos presumir acesso.' },
    { id: 'ai', name: 'Assistentes por matéria', status: 'API de IA pendente', text: 'Organização e estudo com referências ao material de cada disciplina.', permission: 'Necessita chave no servidor, orçamento, isolamento por matéria e consentimento para enviar conteúdo. Ainda não analisa suas notas com IA.' },
  ];
  return <section className={styles.integrationHub}><div className="section-heading"><div><span className="eyebrow">Um espaço que pode crescer</span><h2>Suas conexões, com clareza.</h2></div><Link2 size={22} aria-hidden="true" /></div><div className={styles.integrationGrid}>{items.map((item) => <article className={styles.integrationCard} key={item.id}><span className={`${styles.connectionStatus} ${item.id === 'calendar' ? styles.available : ''}`}>{item.status}</span><h3>{item.name}</h3><p>{item.text}</p><button className="text-button" aria-expanded={expanded === item.id} aria-controls={`integration-${item.id}`} onClick={() => setExpanded(expanded === item.id ? '' : item.id)}>Como funciona <ArrowRight size={14} aria-hidden="true" /></button><p id={`integration-${item.id}`} hidden={expanded !== item.id} className={styles.permissionNote}>{item.permission}</p>{item.id === 'calendar' && <button className="button outline" onClick={onAgenda}>Abrir agenda para exportar</button>}</article>)}</div></section>;
}
