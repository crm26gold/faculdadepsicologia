'use client';
import { useCallback, useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { api } from './client';
import type { UsageScope, UsageState } from '@/lib/usage';

const labels: Record<UsageScope, string> = { ai: 'Pedidos de IA', live: 'Novas chamadas', upload: 'Preparações de upload', media: 'Downloads de mídia' };
const levels = { normal: 'Dentro do limite', warning: 'Atenção: consumo acima de 75%', critical: 'Consumo acima de 90%', blocked: 'Limite atingido: função pausada' };
function amount(value: number, scope: UsageScope) {
  return scope === 'media' ? `${(value / 1_000_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} GB` : value.toLocaleString('pt-BR');
}

export function UsageSettings() {
  const [state, setState] = useState<UsageState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setState(await api<UsageState>('/api/admin/usage')); }
    catch { setError('Não consegui atualizar o consumo agora. Os limites continuam sendo verificados em cada pedido.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section aria-labelledby="usage-title">
    <h3 id="usage-title"><Gauge size={15} aria-hidden="true" /> Consumo e proteção</h3>
    <p className="muted small">Limites compartilhados entre as contas, no site e nos pedidos de IA e fotos pelo Telegram. A contagem começa na ativação deste controle.</p>
    {error && <p className="cm-message" role="status">{error}</p>}
    {!state && busy && <p role="status">Consultando consumo…</p>}
    {state && <div className="ai-grid">{state.items.map(item => <div className="ai-card" key={item.scope}>
      <strong>{labels[item.scope]}</strong>
      <span className={item.level === 'normal' ? 'muted small' : 'cm-message'}>{levels[item.level]}</span>
      <span>Hoje (UTC): {amount(item.day_used, item.scope)} de {amount(item.day_limit, item.scope)}</span>
      <span>Últimos {state.window_days} dias: {amount(item.window_used, item.scope)} de {amount(item.window_limit, item.scope)}</span>
      <progress max={item.window_limit} value={Math.min(item.window_used, item.window_limit)} aria-label={`${labels[item.scope]} nos últimos ${state.window_days} dias`} style={{ width: '100%' }} />
    </div>)}</div>}
    <p className="muted small">Este painel conta reservas feitas pela Jornada. Não é a fatura dos provedores nem o egress total do Supabase. Chamadas já abertas, acessos diretos ao Storage e outros serviços têm consumo próprio. Os avisos aparecem ao consultar ou atualizar este painel.</p>
    <button type="button" className="button outline" disabled={busy} onClick={() => void load()}>{busy ? 'Atualizando…' : 'Atualizar consumo'}</button>
  </section>;
}
