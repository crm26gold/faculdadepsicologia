'use client';
import { useState } from 'react';
import { Copy, Dices, Send } from 'lucide-react';
import { Modal } from './modal';
import { api } from './community/client';
import { distribute, namesFrom, shuffle, splitGroups } from '@/lib/draw';
import type { Home, SpaceOverview } from '@/lib/community';

type Mode = 'groups' | 'order' | 'tasks' | 'one';
const modes: [Mode, string][] = [['groups', 'Dividir em grupos'], ['order', 'Ordem'], ['tasks', 'Distribuir tarefas'], ['one', 'Uma pessoa']];
type Result = { lines: string[]; title: string };

/** Sortear: no aparelho, com os nomes de um grupo seu ou escritos. O resultado pode ir para a conversa do grupo. */
export function DrawTool({ home, onClose }: { home: Home | null; onClose: () => void }) {
  const groups = (home?.spaces ?? []).filter(space => !space.archived_at && space.my_role && (space.kind === 'group' || space.kind === 'class'));
  const [source, setSource] = useState<'group' | 'typed'>(groups.length ? 'group' : 'typed');
  const [group, setGroup] = useState('');
  const [loaded, setLoaded] = useState<{ id: string; names: string[]; chat: boolean } | null>(null);
  const [typed, setTyped] = useState('');
  const [mode, setMode] = useState<Mode>('groups');
  const [by, setBy] = useState<'groups' | 'size'>('groups');
  const [amount, setAmount] = useState(2);
  const [tasks, setTasks] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const me = home?.account.display_name || 'Alguém';

  async function pickGroup(id: string) {
    setGroup(id); setResult(null); setMessage('');
    if (!id) { setLoaded(null); return; }
    setBusy(true);
    try {
      const data = await api<SpaceOverview>(`/api/spaces?id=${id}`);
      const names = data.people.filter(person => person.is_direct && person.role !== 'teacher' && person.role !== 'assistant').map(person => person.display_name || 'Sem nome');
      setLoaded({ id, names, chat: data.space.kind === 'group' && !!data.space.tools?.includes('conversa') });
    } catch (reason) { setLoaded(null); setMessage(reason instanceof Error ? reason.message : 'Não foi possível abrir o grupo.'); }
    finally { setBusy(false); }
  }
  const names = source === 'group' ? loaded?.names ?? [] : namesFrom(typed);
  const taskList = namesFrom(tasks);

  function draw() {
    setMessage('');
    if (names.length < 2 && mode !== 'one') { setMessage('Precisa de pelo menos duas pessoas.'); return; }
    if (!names.length) { setMessage('Escreva pelo menos um nome.'); return; }
    if (mode === 'groups') {
      const split = splitGroups(names, by === 'groups' ? { groups: amount } : { size: amount });
      setResult({ title: `${split.length} grupos`, lines: split.map((people, index) => `Grupo ${index + 1}: ${people.join(', ')}`) });
    } else if (mode === 'order') {
      setResult({ title: 'Ordem', lines: shuffle(names).map((name, index) => `${index + 1}. ${name}`) });
    } else if (mode === 'tasks') {
      if (!taskList.length) { setMessage('Escreva as tarefas, uma por linha.'); return; }
      // Pela posição de cada pessoa: dois "Ana" continuam sendo duas pessoas.
      setResult({ title: 'Tarefas', lines: distribute(taskList, names.map((_, index) => index)).map(item => `${item.task}: ${names[item.person]}`) });
    } else setResult({ title: 'Pessoa sorteada', lines: [shuffle(names)[0]] });
  }
  const when = new Date().toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const text = result ? [`🎲 Sorteio · ${result.title}`, ...result.lines, `Feito por ${me} em ${when}`].join('\n') : '';

  return <Modal title="Sortear" onClose={onClose}><div className="entry-form draw">
    {groups.length > 0 && <fieldset className="nw-choice"><legend>Quem entra?</legend>
      <div className="nw-chips">
        <button type="button" className="nw-chip" aria-pressed={source === 'group'} onClick={() => { setSource('group'); setResult(null); }}>Pessoas de um grupo</button>
        <button type="button" className="nw-chip" aria-pressed={source === 'typed'} onClick={() => { setSource('typed'); setResult(null); }}>Escrever os nomes</button>
      </div></fieldset>}
    {source === 'group' ? <><label htmlFor="draw-group">Grupo ou sala</label>
      <select id="draw-group" value={group} onChange={event => void pickGroup(event.target.value)}>
        <option value="">Escolha…</option>{groups.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}</select>
      {loaded && <p className="muted small">{loaded.names.length} {loaded.names.length === 1 ? 'pessoa' : 'pessoas'}: {loaded.names.join(', ')}</p>}</>
      : <><label htmlFor="draw-names">Nomes, um por linha</label><textarea id="draw-names" rows={5} value={typed} onChange={event => { setTyped(event.target.value); setResult(null); }} placeholder={'Ana\nBia\nCaio'} /></>}
    <fieldset className="nw-choice"><legend>O que sortear?</legend>
      <div className="nw-chips">{modes.map(([value, label]) => <button key={value} type="button" className="nw-chip" aria-pressed={mode === value} onClick={() => { setMode(value); setResult(null); }}>{label}</button>)}</div>
    </fieldset>
    {mode === 'groups' && <div className="form-grid">
      <div><label htmlFor="draw-by">Dividir por</label><select id="draw-by" value={by} onChange={event => setBy(event.target.value as 'groups' | 'size')}>
        <option value="groups">Número de grupos</option><option value="size">Pessoas por grupo</option></select></div>
      <div><label htmlFor="draw-amount">{by === 'groups' ? 'Quantos grupos' : 'Pessoas em cada'}</label>
        <input id="draw-amount" type="number" min={by === 'groups' ? 2 : 1} max={100} value={amount} onChange={event => setAmount(Math.max(1, Math.min(100, event.target.valueAsNumber || 1)))} /></div>
    </div>}
    {mode === 'tasks' && <><label htmlFor="draw-tasks">Tarefas ou partes, uma por linha</label>
      <textarea id="draw-tasks" rows={4} value={tasks} onChange={event => setTasks(event.target.value)} placeholder={'Introdução\nMétodo\nConclusão'} />
      <p className="muted small">Cada pessoa fica com o mesmo número de tarefas, ou uma a mais.</p></>}
    <div className="button-row"><button type="button" className="button primary" disabled={busy} onClick={draw}><Dices size={16} aria-hidden="true" />{result ? 'Sortear de novo' : 'Sortear'}</button></div>
    {result && <section className="draw-result" aria-label="Resultado do sorteio" aria-live="polite">
      <strong>{result.title}</strong>
      <ul>{result.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
      <small className="muted">Sorteado no seu aparelho, com números aleatórios do sistema. Feito por {me} em {when}.</small>
      <div className="button-row">
        <button type="button" className="button outline" onClick={() => navigator.clipboard.writeText(text).then(() => setMessage('Resultado copiado.'), () => setMessage('Copie o resultado manualmente.'))}><Copy size={16} aria-hidden="true" />Copiar</button>
        {source === 'group' && loaded?.chat && <button type="button" className="button outline" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api('/api/network', { action: 'send_message', space: loaded.id, body: text.slice(0, 4000) }); setMessage('Resultado enviado na conversa do grupo.'); }
          catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível enviar.'); }
          finally { setBusy(false); }
        }}><Send size={16} aria-hidden="true" />Mandar na conversa</button>}
      </div>
    </section>}
    {message && <p className="cm-message" role="status">{message}</p>}
  </div></Modal>;
}
