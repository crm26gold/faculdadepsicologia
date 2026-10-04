'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Settings2, Sparkles, type LucideIcon } from 'lucide-react';

export type WorkspaceView = 'today' | 'community' | 'studies' | 'notes' | 'agenda' | 'focus' | 'planning' | 'finances' | 'routine' | 'flashcards' | 'assistant' | 'contacts' | 'admin' | 'settings';
export type WorkspaceNavItem = { id: WorkspaceView; label: string; Icon: LucideIcon; badge?: string | number };
type NavigationProps = {
  items: readonly WorkspaceNavItem[];
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  collapsed?: boolean;
  onToggle?: () => void;
  mobile?: boolean;
  name: string;
  email: string;
  photo?: string;
  status: string;
  modeLabel: string;
};

const groups: { label: string; ids: WorkspaceView[] }[] = [
  { label: 'Sua jornada', ids: ['today', 'agenda', 'focus', 'routine', 'planning', 'finances'] },
  { label: 'Aprender e criar', ids: ['studies', 'notes', 'flashcards'] },
  { label: 'Conectar', ids: ['assistant', 'community', 'contacts', 'admin'] },
];

export function WorkspaceNavigation({ items, view, onNavigate, collapsed = false, onToggle, mobile = false, name, email, photo, status, modeLabel }: NavigationProps) {
  const id = useId();
  const reduced = useReducedMotion();
  const [folded, setFolded] = useState<string[]>([]);
  const active = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const group = groups.find((item) => item.ids.includes(view));
    if (group) setFolded((previous) => previous.includes(group.label) ? previous.filter((label) => label !== group.label) : previous);
  }, [view]);

  useEffect(() => {
    if (!menu.current || !active.current || !menu.current.contains(active.current)) return;
    const bounds = menu.current.getBoundingClientRect();
    const item = active.current.getBoundingClientRect();
    const offset = item.top < bounds.top ? item.top - bounds.top - 4 : item.bottom > bounds.bottom ? item.bottom - bounds.bottom + 4 : 0;
    if (offset) menu.current.scrollBy({ top: offset, behavior: 'instant' });
  }, [view, collapsed, folded]);

  function itemButton(item: WorkspaceNavItem) {
    const selected = view === item.id;
    return <motion.button key={item.id} ref={selected ? active : undefined} type="button"
      className={`nav-item ${selected ? 'active' : ''}`} aria-current={selected ? 'page' : undefined}
      aria-label={item.label} title={collapsed ? item.label : undefined}
      onClick={() => onNavigate(item.id)} whileTap={reduced ? undefined : { scale: 0.98 }}>
      {selected && <motion.span className="nav-active-surface" layoutId={`${id}-selected`} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38 }} aria-hidden="true" />}
      <item.Icon size={18} strokeWidth={1.65} aria-hidden="true" />
      <span className="nav-label">{item.label}</span>
      {item.badge !== undefined && <span className="nav-chip">{item.badge}</span>}
      {selected && !collapsed && <span className="nav-selected-dot" aria-hidden="true" />}
    </motion.button>;
  }

  return <LayoutGroup id={id}>
    <div className="sidebar-header">
      <div className="sidebar-brand-row">
        <button type="button" className="brand" onClick={() => onNavigate('today')} aria-label="Jornada Plena — início" title={collapsed ? 'Jornada Plena — início' : undefined}>
          <span className="brand-icon"><img src="/brand/simbolo.svg" alt="" width={40} height={40} /></span>
          <span className="brand-text">Jornada Plena<small>Um espaço para florescer</small></span>
        </button>
        {!mobile && !collapsed && <button type="button" className="sidebar-toggle icon-button" onClick={onToggle} aria-label="Recolher navegação" aria-expanded="true" title="Recolher navegação"><PanelLeftClose size={16} aria-hidden="true" /></button>}
      </div>
      {!mobile && collapsed && <button type="button" className="sidebar-toggle icon-button" onClick={onToggle} aria-label="Expandir navegação" aria-expanded="false" title="Expandir navegação"><PanelLeftOpen size={18} aria-hidden="true" /></button>}
      {!collapsed && <div className="sidebar-space-label"><span className="space-status-dot" /><span>{modeLabel}</span></div>}
    </div>
    <nav ref={menu} aria-label="Principal" className="workspace-navigation">
      {groups.map((group) => {
        const members = group.ids.flatMap((key) => items.find((item) => item.id === key) ?? []);
        if (!members.length) return null;
        const isFolded = folded.includes(group.label);
        const containsActive = group.ids.includes(view);
        return <div className="navigation-group" key={group.label}>
          {!collapsed && <button type="button" className="navigation-group-toggle" aria-label={group.label} aria-expanded={!isFolded} aria-controls={`${id}-${group.ids[0]}`} onClick={() => setFolded((previous) => isFolded ? previous.filter((value) => value !== group.label) : [...previous, group.label])}>
            <span>{group.label}</span>{containsActive && isFolded ? <span className="nav-group-current">{items.find((item) => item.id === view)?.label}</span> : null}<ChevronDown size={12} aria-hidden="true" />
          </button>}
          <div id={`${id}-${group.ids[0]}`}><AnimatePresence initial={false}>
            {(collapsed || !isFolded) && <motion.div className="navigation-group-items" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
              {members.map(itemButton)}
            </motion.div>}
          </AnimatePresence></div>
        </div>;
      })}
    </nav>
    <div className="sidebar-bottom">
      {!collapsed && <button type="button" className="sidebar-assistant-shortcut" onClick={() => onNavigate('assistant')}><span><Sparkles size={16} aria-hidden="true" /></span><div><strong>Uma ideia por vez</strong><small>Abra o assistente</small></div><ChevronRight size={14} aria-hidden="true" /></button>}
      {itemButton({ id: 'settings', label: 'Meu espaço', Icon: Settings2 })}
      <button type="button" className="sidebar-user-card" onClick={() => onNavigate('settings')} aria-label="Abrir meu perfil" title={collapsed ? name : undefined}>
        <span className="user-avatar-badge" aria-hidden="true">{photo ? <img src={photo} alt="" /> : name.slice(0, 1) || 'P'}</span>
        <span className="user-meta-info"><strong>{name}</strong><span title={email}>{email || 'Meu perfil e preferências'}</span></span>
        {!collapsed && <ChevronRight size={13} aria-hidden="true" />}
      </button>
      {!collapsed && <span className="sidebar-sync-status">{status}</span>}
    </div>
  </LayoutGroup>;
}
