'use client';
import { useState } from 'react';
import { BarChart3, CalendarClock, ChevronRight, Dices, Layers, Plus, Trophy, Type, type LucideIcon } from 'lucide-react';
import { Modal } from './modal';
import { DrawTool } from './draw-tool';
import type { Home, SpaceSummary } from '@/lib/community';

type Section = 'Estudos' | 'Grupo' | 'Vida';
type ToolId = 'flashcards' | 'challenge' | 'poll' | 'finder' | 'draw' | 'card';
type GroupTool = 'challenge' | 'poll' | 'finder';
type Tool = { id: ToolId; section: Section; title: string; text: string; Icon: LucideIcon; life: boolean; group: boolean; cloud?: boolean };

/** Só entra aqui o que já funciona; cada ferramenta nova aparece quando chegar. */
const tools: Tool[] = [
  { id: 'flashcards', section: 'Estudos', title: 'Flashcards', text: 'Cartões de pergunta e resposta com revisão espaçada.', Icon: Layers, life: true, group: false },
  { id: 'challenge', section: 'Grupo', title: 'Desafio', text: 'Feito ou não, ou quantidade (páginas, km, copos), com sequência e medalha.', Icon: Trophy, life: false, group: true, cloud: true },
  { id: 'poll', section: 'Grupo', title: 'Enquete', text: 'Uma pergunta, até 10 opções e voto secreto.', Icon: BarChart3, life: false, group: true, cloud: true },
  { id: 'finder', section: 'Grupo', title: 'Achar horário em comum', text: 'Cada um marca quando pode; o melhor horário aparece.', Icon: CalendarClock, life: false, group: true, cloud: true },
  { id: 'draw', section: 'Grupo', title: 'Sortear', text: 'Grupos, ordem de apresentação, tarefas ou uma pessoa, de forma justa.', Icon: Dices, life: true, group: true },
  { id: 'card', section: 'Vida', title: 'Card de texto', text: 'Sua frase vira um card colorido para publicar no Networking.', Icon: Type, life: true, group: true, cloud: true },
];
const sections: Section[] = ['Estudos', 'Grupo', 'Vida'];
const pickTitle: Record<GroupTool, string> = { challenge: 'Desafio', poll: 'Enquete', finder: 'Achar horário' };

/** Onde cada ferramenta de grupo funciona: a mesma regra das abas do grupo e do banco. */
export function placesFor(tool: GroupTool, spaces: SpaceSummary[]) {
  return spaces.filter(space => !space.archived_at && (tool === 'poll'
    ? !!space.can_lead && (space.kind !== 'group' || !space.tools || space.tools.includes('enquetes'))
    : space.kind === 'group' && !!space.my_role && !!space.tools?.includes(tool === 'challenge' ? 'checkin' : 'encontros')));
}

/** A Caixa de ferramentas: o que pega um conteúdo e faz algo com ele, para usar na sua vida ou num grupo.
 * Foco, agenda, hábitos e material ficam nos lugares deles. Sem conta na nuvem, só as ferramentas da vida pessoal. */
export function Toolbox({ home, onOpenFlashcards, onOpenSpace, onCompose, onCreateGroup }: {
  home: Home | null; onOpenFlashcards: () => void; onCompose: () => void; onCreateGroup: () => void;
  onOpenSpace: (id: string, tab: 'challenges' | 'board', start: GroupTool) => void;
}) {
  const [picking, setPicking] = useState<GroupTool | null>(null);
  const [drawing, setDrawing] = useState(false);
  const available = tools.filter(tool => !tool.cloud || !!home);
  const spaces = home?.spaces ?? [];
  const nameOf = (id: string | null) => spaces.find(space => space.id === id)?.name;
  function open(tool: ToolId) {
    if (tool === 'flashcards') return onOpenFlashcards();
    if (tool === 'card') return onCompose();
    if (tool === 'draw') return setDrawing(true);
    const places = placesFor(tool, spaces);
    if (places.length === 1) return go(tool, places[0].id);
    setPicking(tool);
  }
  function go(tool: GroupTool, space: string) {
    setPicking(null);
    onOpenSpace(space, tool === 'challenge' ? 'challenges' : 'board', tool);
  }
  const places = picking ? placesFor(picking, spaces) : [];
  return <section className="tb" aria-label="Ferramentas">
    {sections.map(section => {
      const items = available.filter(tool => tool.section === section);
      if (!items.length) return null;
      return <div key={section} className="tb-section">
        <h2 className="small-heading">{section}</h2>
        <div className="tb-grid">{items.map(tool => <button key={tool.id} type="button" className="tb-tool" onClick={() => open(tool.id)}>
          <span className="tb-icon" aria-hidden="true"><tool.Icon size={20} /></span>
          <strong>{tool.title}</strong>
          <span className="tb-text">{tool.text}</span>
          <span className="tb-where">{[tool.life && 'Na sua vida', tool.group && 'Num grupo'].filter(Boolean).join(' · ')}</span>
        </button>)}</div>
      </div>;
    })}
    <p className="muted small">Foco, agenda, hábitos e material do curso continuam nos lugares deles. As ferramentas daqui usam esses dados quando você pede.</p>
    {drawing && <DrawTool home={home} onClose={() => setDrawing(false)} />}
    {picking && <Modal title={`${pickTitle[picking]} em qual grupo?`} onClose={() => setPicking(null)}>
      {places.length ? <ul className="tb-places">{places.map(space => <li key={space.id}>
        <button type="button" onClick={() => go(picking, space.id)}>
          <span><strong>{space.name}</strong><small>{space.kind === 'group' ? nameOf(space.parent_id) ?? 'Grupo' : space.kind === 'class' ? 'Sala' : 'Instituição'}</small></span>
          <ChevronRight size={16} aria-hidden="true" />
        </button></li>)}</ul>
        : <p className="muted">{picking === 'challenge'
          ? 'Nenhum grupo seu está com Desafios ligado. Quem cuida do grupo liga em Configurar › Regras do grupo, ou crie um grupo com o modelo Desafio.'
          : picking === 'finder'
          ? 'Nenhum grupo seu está com Encontros ligado. Quem cuida do grupo liga em Configurar › Regras do grupo.'
          : 'A enquete é feita por quem conduz o grupo ou a sala (dono, líder ou professor). Crie um grupo para fazer a sua.'}</p>}
      <div className="form-footer"><button type="button" className="button outline" onClick={() => { setPicking(null); onCreateGroup(); }}><Plus size={16} aria-hidden="true" />Criar um grupo</button></div>
    </Modal>}
  </section>;
}
