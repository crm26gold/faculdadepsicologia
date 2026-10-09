'use client';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Info, Wrench, Zap } from 'lucide-react';
import type { Issue, IssueOption } from '@/lib/ai/issues';
import { Modal } from '../modal';

/** Each problem as one card with what it affects and a Resolver button. */
export function IssueList({ issues, onResolve }: { issues: Issue[]; onResolve: (issue: Issue) => void }) {
  if (!issues.length) return <p className="ai-issues-clear" role="status"><CheckCircle2 size={18} aria-hidden="true" /> Nada pendente: todas as conexões em uso estão funcionando.</p>;
  return <ul className="ai-issues" aria-label="O que precisa da sua atenção">{issues.map(issue => <li key={issue.id} data-level={issue.level}>
    <span className="ai-issue-icon" aria-hidden="true">{issue.level === 'warning' ? <AlertTriangle size={18} /> : <Info size={18} />}</span>
    <span className="ai-issue-text"><strong>{issue.title}</strong>{issue.affects.length > 0 && <small>Afeta: {issue.affects.join(', ')}</small>}</span>
    <button type="button" className="button outline ai-issue-go" onClick={() => onResolve(issue)}><Wrench size={15} aria-hidden="true" />Resolver</button>
  </li>)}</ul>;
}

/** Step by step: what is happening and why, the ways out, then either one confirmed action or the exact place to act. */
export function IssueGuide({ issue, position, onClose, onGo, onAct }: { issue: Issue; position?: { index: number; total: number }; onClose: () => void;
  onGo: (option: IssueOption) => void; onAct: (option: IssueOption) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<IssueOption | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const steps = ['Entender', 'Escolher', 'Resolver'];
  async function act(option: IssueOption) {
    setActing(true); setError('');
    try { await onAct(option); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não consegui concluir. Nada foi alterado além do que já aparece na tela.'); }
    finally { setActing(false); }
  }
  const pick = (option: IssueOption) => { setChoice(option); setConfirmed(false); setError(''); };
  return <Modal title="Resolver" onClose={onClose}>
    {position && position.total > 1 && <p className="ai-guide-progress muted small">Ponto {position.index} de {position.total}</p>}
    <ol className="ai-guide-steps" aria-label={`Passo ${step + 1} de ${steps.length}`}>{steps.map((label, index) => <li key={label} data-state={index < step ? 'done' : index === step ? 'current' : 'next'} aria-current={index === step ? 'step' : undefined}>
      <span aria-hidden="true">{index < step ? '✓' : index + 1}</span>{label}</li>)}</ol>
    <h3 className="ai-guide-title">{issue.title}</h3>
    {step === 0 && <div className="ai-guide-body">
      <p><strong>O que está acontecendo.</strong> {issue.what}</p>
      <p><strong>Por quê.</strong> {issue.why}</p>
      {issue.affects.length > 0 && <p className="ai-guide-affects">Afeta: {issue.affects.map(item => <span key={item}>{item}</span>)}</p>}
      <div className="button-row ai-guide-actions"><button type="button" className="button primary" onClick={() => setStep(1)}>Ver como resolver <ArrowRight size={15} aria-hidden="true" /></button></div>
    </div>}
    {step === 1 && <div className="ai-guide-body">
      <p>Escolha o caminho que combina com você:</p>
      <div className="ai-guide-options" role="radiogroup" aria-label="Como resolver">{issue.options.map(option => <button key={option.label} type="button" role="radio" aria-checked={choice === option}
        className="ai-guide-option" data-chosen={choice === option} onClick={() => pick(option)}><strong>{option.label}</strong><small>{option.detail}</small>{option.act && <em className="ai-guide-oneclick">Resolvo daqui, com sua confirmação</em>}</button>)}</div>
      <div className="button-row ai-guide-actions"><button type="button" className="button outline" onClick={() => setStep(0)}><ArrowLeft size={15} aria-hidden="true" />Voltar</button>
        <button type="button" className="button primary" disabled={!choice} onClick={() => setStep(2)}>Continuar <ArrowRight size={15} aria-hidden="true" /></button></div>
    </div>}
    {step === 2 && choice && <div className="ai-guide-body">
      <p><strong>{choice.label}.</strong> {choice.detail}</p>
      {choice.link && <p><a className="text-button" href={choice.link.href} target="_blank" rel="noopener noreferrer">{choice.link.label} <ExternalLink size={14} aria-hidden="true" /></a></p>}
      {choice.act ? <>
        {choice.act.kind === 'declare' && <label className="ai-guide-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> {choice.act.confirm}</label>}
        {error && <p className="cm-message" role="alert">{error}</p>}
        <p className="muted small">Ao confirmar, eu aplico, registro na auditoria e confiro se o aviso saiu.</p>
        <div className="button-row ai-guide-actions"><button type="button" className="button outline" disabled={acting} onClick={() => setStep(1)}><ArrowLeft size={15} aria-hidden="true" />Voltar</button>
          <button type="button" className="button primary" disabled={acting || (choice.act.kind === 'declare' && !confirmed)} onClick={() => void act(choice)}>{acting ? 'Aplicando…' : <>Fazer agora <Zap size={15} aria-hidden="true" /></>}</button>
          <button type="button" className="text-button" disabled={acting} onClick={() => onGo(choice)}>Prefiro fazer na tela</button></div>
      </> : <>
        <p className="muted small">Eu levo você ao lugar certo e destaco o campo. Nada muda até você salvar; remover pede confirmação. Depois, toque em Conferir para ver se resolveu.</p>
        <div className="button-row ai-guide-actions"><button type="button" className="button outline" onClick={() => setStep(1)}><ArrowLeft size={15} aria-hidden="true" />Voltar</button>
          <button type="button" className="button primary" onClick={() => onGo(choice)}>Ir para o lugar certo <ArrowRight size={15} aria-hidden="true" /></button></div>
      </>}
    </div>}
  </Modal>;
}

/** While the person fixes it: what they are solving and a Conferir that reads the map again. */
export function ResolvingBar({ issue, status, remaining, onCheck, onReopen, onNext, onDismiss }: { issue: Issue; status: 'working' | 'checking' | 'resolved' | 'still'; remaining: number;
  onCheck: () => void; onReopen: () => void; onNext: () => void; onDismiss: () => void }) {
  return <div className="ai-resolving" role="status" data-status={status}>
    {status === 'resolved' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Wrench size={18} aria-hidden="true" />}
    <span>{status === 'resolved' ? <><strong>Resolvido.</strong> {issue.title.split(':')[0]} não aparece mais nos avisos. {remaining ? (remaining === 1 ? 'Falta 1 ponto.' : `Faltam ${remaining} pontos.`) : 'Tudo em ordem por aqui.'}</>
      : status === 'still' ? <><strong>Ainda aparece.</strong> Confira se salvou a alteração; o guia mostra o caminho de novo.</>
      : <><strong>Resolvendo:</strong> {issue.title}</>}</span>
    <span className="ai-resolving-actions">
      {status === 'resolved' ? <>{remaining > 0 && <button type="button" className="button primary" onClick={onNext}>Próximo ponto <ArrowRight size={15} aria-hidden="true" /></button>}
        <button type="button" className={remaining ? 'text-button' : 'button outline'} onClick={onDismiss}>Fechar</button></> : <>
        {status === 'still' && <button type="button" className="text-button" onClick={onReopen}>Ver o guia</button>}
        <button type="button" className="button primary" disabled={status === 'checking'} onClick={onCheck}>{status === 'checking' ? 'Conferindo…' : 'Conferir'}</button>
        <button type="button" className="text-button" onClick={onDismiss}>Depois</button></>}
    </span>
  </div>;
}
