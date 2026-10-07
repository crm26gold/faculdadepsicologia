'use client';
import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { restoreFromTrash, trashSections, trashTitle, type TrashRow } from '@/lib/trash';
import type { Workspace } from '@/lib/workspace';

// What was deleted in the last 30 days, by the screen or by any assistant. Restore puts it back in its
// place; "Excluir de vez" asks once more before removing it for good.
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

export function TrashPanel({ update, blocked }: { update: (change: (previous: Workspace) => Workspace) => boolean; blocked: boolean }) {
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/trash', { cache: 'no-store' });
      const answer = await response.json() as { data?: TrashRow[]; error?: string };
      if (!response.ok) throw new Error(answer.error);
      setRows(answer.data ?? []);
    } catch { setRows([]); setMessage('Não consegui abrir a lixeira agora.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function restore(row: TrashRow) {
    if (blocked) return;
    let problem = '';
    const accepted = update(previous => { try { return restoreFromTrash(previous, row); } catch (error) { problem = error instanceof Error ? error.message : 'Não consegui restaurar.'; return previous; } });
    if (problem || !accepted) { setMessage(problem || 'Não consegui restaurar agora.'); return; }
    setRows(previous => previous?.filter(item => item.id !== row.id) ?? null);
    setMessage(`Restaurado: ${trashTitle(row)} (${trashSections[row.collection]}).`);
  }
  async function purge(row: TrashRow) {
    const response = await fetch('/api/trash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'purge', id: row.id }) });
    setConfirming('');
    if (!response.ok) { setMessage('Não consegui excluir de vez agora.'); return; }
    setRows(previous => previous?.filter(item => item.id !== row.id) ?? null);
    setMessage(`Excluído de vez: ${trashTitle(row)}.`);
  }

  return <section className="panel trash-panel" aria-labelledby="trash-title">
    <h3 id="trash-title">Lixeira</h3>
    <p className="muted small">O que for excluído, por você ou por um assistente, fica aqui por 30 dias, até 2 MB por conta. Os mais antigos saem primeiro.</p>
    {message && <p className="cm-message" role="status">{message}</p>}
    {rows === null ? <p className="muted small">Abrindo a lixeira…</p> : rows.length === 0 ? <p className="muted small">A lixeira está vazia.</p>
      : <ul className="trash-list">{rows.map(row => <li key={row.id}>
        <div><strong>{trashTitle(row)}</strong><span className="muted small">{trashSections[row.collection]} · excluído em {day(row.deleted_at)}</span></div>
        <div className="button-row">
          <button type="button" className="button outline" disabled={blocked} onClick={() => restore(row)}><RotateCcw size={14} aria-hidden="true" />Restaurar</button>
          {confirming === row.id
            ? <button type="button" className="button danger" onClick={() => void purge(row)}>Confirmar exclusão definitiva</button>
            : <button type="button" className="text-button cm-danger" onClick={() => setConfirming(row.id)}><Trash2 size={14} aria-hidden="true" />Excluir de vez</button>}
        </div>
      </li>)}</ul>}
  </section>;
}
