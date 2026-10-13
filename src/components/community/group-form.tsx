'use client';
import { useState } from 'react';
import { BadgeCheck, Check } from 'lucide-react';
import { api } from './client';
import { groupTemplates, groupTools, normalizeTopics, readyTools, spaceColors, templateLabels, templateTools, toolLabels,
  type GroupTemplate, type GroupTool, type SpaceColor, type SpaceOverview, type Visibility } from '@/lib/community';
import { lifeAreas } from '@/lib/life';
import type { Workspace } from '@/lib/workspace';

const colorNames: Record<SpaceColor, string> = { sage: 'Azul claro', lavender: 'Lavanda', sand: 'Areia', blue: 'Azul', rose: 'Rosa' };
type Link = 'estudos' | 'area' | 'nada';
type Rules = {
  template: GroupTemplate; tools: GroupTool[]; link: Link; origin: string; topics: string; visibility: Visibility;
  approval: boolean; asksEmail: boolean; passwordOn: boolean; password: string;
};

/** De onde o grupo vem: cursos e matérias dos seus Estudos ou uma área da vida. Só o rótulo vai para o grupo. */
function originOptions(data: Workspace) {
  const studies = (data.courses ?? []).flatMap(course => {
    const base = [course.institution, course.name].filter(Boolean).join(' › ');
    return [base, ...data.subjects.filter(subject => subject.courseId === course.id).map(subject => `${base} › ${subject.name}`)];
  });
  const areas = lifeAreas(data).filter(area => !area.hidden && area.id !== 'studies').map(area => area.name);
  return { studies: [...new Set(studies)].slice(0, 60), areas };
}

function RulesFields({ rules, set, data, prefix, inClass }: { rules: Rules; set: (next: Partial<Rules>) => void; data: Workspace; prefix: string; inClass: boolean }) {
  const options = originOptions(data);
  const list = rules.link === 'estudos' ? options.studies : rules.link === 'area' ? options.areas : [];
  return <>
    <fieldset className="nw-choice"><legend>Que tipo de grupo?</legend>
      <p className="muted small">O modelo só liga as ferramentas certas. Você muda tudo depois.</p>
      <div className="nw-chips">{groupTemplates.map(item => <button key={item} type="button" className="nw-chip" aria-pressed={rules.template === item} onClick={() => set({ template: item, tools: templateTools[item] })}>{templateLabels[item]}</button>)}</div>
      <ul className="nw-tools">{groupTools.map(tool => <li key={tool}><label className="cm-check">
        <input type="checkbox" checked={rules.tools.includes(tool)} onChange={event => set({ tools: event.target.checked ? [...rules.tools, tool] : rules.tools.filter(item => item !== tool) })} />
        {toolLabels[tool]}{!readyTools.includes(tool) && <small className="muted"> · em breve</small>}
      </label></li>)}</ul>
    </fieldset>
    <fieldset className="nw-choice"><legend>Ligado a quê?</legend>
      <p className="muted small">Mostra de onde o grupo vem e ajuda as pessoas certas a encontrarem.</p>
      <div className="nw-chips">{([['estudos', 'Estudos'], ['area', 'Área da vida'], ['nada', 'Nada']] as [Link, string][]).map(([item, label]) =>
        <button key={item} type="button" className="nw-chip" aria-pressed={rules.link === item} onClick={() => set({ link: item, origin: item === 'nada' ? '' : rules.link === item ? rules.origin : '' })}>{label}</button>)}</div>
      {rules.link !== 'nada' && (list.length
        ? <><label htmlFor={`${prefix}-origin`} className="sr-only">{rules.link === 'estudos' ? 'Curso ou matéria' : 'Área da vida'}</label>
          <select id={`${prefix}-origin`} value={rules.origin} onChange={event => set({ origin: event.target.value })}>
            <option value="">Escolha…</option>{list.map(item => <option key={item} value={item}>{item}</option>)}
            {rules.origin && !list.includes(rules.origin) && <option value={rules.origin}>{rules.origin}</option>}
          </select></>
        : <p className="muted small">{rules.link === 'estudos' ? 'Cadastre seus cursos em Estudos para escolher aqui.' : 'Nenhuma área da vida visível.'}</p>)}
      <label htmlFor={`${prefix}-topics`}>#Temas · opcional, até 5</label>
      <input id={`${prefix}-topics`} value={rules.topics} onChange={event => set({ topics: event.target.value })} placeholder="#corrida #neurociência" maxLength={200} />
    </fieldset>
    <fieldset className="nw-choice"><legend>Quem vê o grupo no Networking?</legend>
      {([['public', 'Todos do Networking', 'Aparece na busca para qualquer pessoa.'],
        ...(inClass ? [['class', 'Só a sala', 'Aparece na busca só para quem é da sala.']] : []),
        ['invite', 'Só quem recebe o convite', 'Não aparece na busca. Entra pelo link, pelo QR ou por aprovação sua.']] as [Visibility, string, string][]).map(([item, label, hint]) =>
        <label key={item} className="nw-radio"><input type="radio" name={`${prefix}-visibility`} checked={rules.visibility === item} onChange={() => set({ visibility: item })} /><span>{label}<small>{hint}</small></span></label>)}
    </fieldset>
    {rules.visibility !== 'invite' && <fieldset className="nw-choice"><legend>Como se entra pela busca?</legend>
      <p className="muted small">Dá para combinar. Sem nada marcado, a entrada é livre. Quem recebe convite entra direto.</p>
      <label className="cm-check"><input type="checkbox" checked={rules.approval} onChange={event => set({ approval: event.target.checked })} /> Pedido com aprovação</label>
      <label className="cm-check"><input type="checkbox" checked={rules.passwordOn} onChange={event => set({ passwordOn: event.target.checked })} /> Senha</label>
      {rules.passwordOn && <><label htmlFor={`${prefix}-password`} className="sr-only">Senha do grupo</label>
        <input id={`${prefix}-password`} type="text" autoComplete="off" value={rules.password} onChange={event => set({ password: event.target.value })} maxLength={72} placeholder="Pelo menos 4 caracteres" /></>}
      <label className="cm-check"><input type="checkbox" checked={rules.asksEmail} onChange={event => set({ asksEmail: event.target.checked })} /> Pedir nome e e-mail</label>
      {rules.asksEmail && <p className="muted small">Antes de entrar, a pessoa é avisada de que o e-mail dela vai para quem cuida do grupo.</p>}
    </fieldset>}
  </>;
}

const rulesBody = (rules: Rules, keepPassword: boolean) => ({
  template: rules.template, tools: rules.tools, topics: normalizeTopics(rules.topics), origin: rules.link === 'nada' ? '' : rules.origin,
  visibility: rules.visibility, approval: rules.visibility !== 'invite' && rules.approval, asks_email: rules.visibility !== 'invite' && rules.asksEmail,
  password: rules.visibility === 'invite' || !rules.passwordOn ? '' : keepPassword && !rules.password ? null : rules.password,
});
function checkRules(rules: Rules, hadPassword: boolean) {
  if (rules.link !== 'nada' && !rules.origin) return 'Escolha a que o grupo se liga, ou marque Nada.';
  if (rules.visibility !== 'invite' && rules.passwordOn && !(hadPassword && !rules.password) && rules.password.length < 4) return 'A senha precisa ter pelo menos 4 caracteres.';
  return '';
}

export function CreateGroup({ data, parent, onCreated, onCancel }: {
  data: Workspace; parent?: { id: string; name: string }; onCreated: (id: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<SpaceColor>('sage');
  const [rules, setRules] = useState<Rules>({ template: 'estudo', tools: templateTools.estudo, link: parent ? 'estudos' : 'nada', origin: '', topics: '',
    visibility: parent ? 'class' : 'invite', approval: false, asksEmail: false, passwordOn: false, password: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const problem = !name.trim() ? 'Dê um nome ao grupo.' : checkRules(rules, false);
    if (problem) { setMessage(problem); return; }
    setBusy(true); setMessage('');
    try {
      const id = await api<string>('/api/spaces', { action: 'create_group', name: name.trim(), parent: parent?.id ?? null, description: description.trim(), color, ...rulesBody(rules, false) });
      onCreated(id);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível criar.'); }
    finally { setBusy(false); }
  }
  return <section className="panel nw-form" aria-labelledby="nw-create-title">
    <h2 id="nw-create-title">{parent ? `Criar grupo em ${parent.name}` : 'Criar grupo'}</h2>
    <label htmlFor="nw-group-name">Nome do grupo</label>
    <input id="nw-group-name" value={name} onChange={event => setName(event.target.value)} maxLength={160} placeholder="Ex.: Treino 30 dias, Estudo Neuro" required />
    <label htmlFor="nw-group-description">Descrição · opcional</label>
    <textarea id="nw-group-description" rows={2} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} />
    <fieldset className="nw-choice"><legend>Cor</legend><div className="nw-chips">{spaceColors.map(item => <button key={item} type="button" className={`nw-swatch ${item}`} aria-pressed={color === item} aria-label={colorNames[item]} onClick={() => setColor(item)} />)}</div></fieldset>
    <RulesFields rules={rules} set={next => setRules(previous => ({ ...previous, ...next }))} data={data} prefix="nw-create" inClass={!!parent} />
    <p className="nw-seal-note"><BadgeCheck size={16} aria-hidden="true" />Qualquer pessoa cria. Se um professor ou líder assumir o grupo, ele ganha o selo de oficial.</p>
    {message && <p className="cm-message" role="alert">{message}</p>}
    <div className="form-footer"><button type="button" className="button outline" onClick={onCancel}>Cancelar</button>
      <button type="button" className="button primary" disabled={busy} onClick={submit}>Criar grupo <Check size={16} aria-hidden="true" /></button></div>
  </section>;
}

/** Regras de um grupo que já existe; nome, descrição e cor seguem no formulário de sempre. */
export function GroupRules({ overview, data, busy, onSave }: {
  overview: SpaceOverview; data: Workspace; busy: boolean; onSave: (body: Record<string, unknown>) => void;
}) {
  const space = overview.space;
  const options = originOptions(data);
  const hadPassword = !!space.has_password;
  const [rules, setRules] = useState<Rules>({
    template: space.template ?? 'livre', tools: space.tools ?? [], topics: (space.topics ?? []).map(topic => `#${topic}`).join(' '),
    link: !space.origin ? 'nada' : options.areas.includes(space.origin) ? 'area' : 'estudos', origin: space.origin ?? '',
    visibility: space.visibility ?? 'invite', approval: !!space.join_approval, asksEmail: !!space.join_asks_email, passwordOn: hadPassword, password: '',
  });
  const [message, setMessage] = useState('');
  return <div className="nw-form">
    <RulesFields rules={rules} set={next => setRules(previous => ({ ...previous, ...next }))} data={data} prefix="nw-settings" inClass={!!space.parent_id} />
    {hadPassword && rules.passwordOn && rules.visibility !== 'invite' && <p className="muted small">Deixe a senha em branco para manter a atual.</p>}
    {message && <p className="cm-message" role="alert">{message}</p>}
    <div className="form-footer"><button type="button" className="button primary" disabled={busy} onClick={() => {
      const problem = checkRules(rules, hadPassword);
      if (problem) { setMessage(problem); return; }
      setMessage(''); onSave({ action: 'update_group', space: space.id, ...rulesBody(rules, hadPassword) });
    }}>Salvar regras</button></div>
  </div>;
}
