'use client';
import { useEffect, useState } from 'react';
import { importLegacy } from '@/lib/life-data';
import { parseWorkspace, type Workspace } from '@/lib/workspace';

export function LegacyImport({ data, blocked, update }: { data: Workspace; blocked: boolean; update: (recipe: (previous: Workspace) => Workspace) => boolean }) {
  const [raw, setRaw] = useState<{ finances: string | null; routine: string | null; profile: string | null } | null>(null);
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => { try {
    const value = { finances: localStorage.getItem('faculdade-psi:finances:v1'), routine: localStorage.getItem('faculdade-psi:routine:v1'), profile: localStorage.getItem('faculdade-psi:user-profile:v1') };
    if (Object.values(value).some(Boolean)) setRaw(value);
  } catch { setMessage('Não foi possível ler dados antigos deste navegador. Nada foi apagado.'); } }, []);
  if (data.legacyImportId) return <p>Dados antigos já importados. As cópias originais continuam neste navegador.</p>;
  if (!raw) return message ? <p role="status">{message}</p> : null;
  return <section className="panel"><h3>Recuperar dados da versão anterior</h3><p>Há Finanças, Rotina ou Perfil salvos apenas neste navegador. Eles podem incluir exemplos fictícios. Baixe e confira a cópia antes de importar para sua conta. As marcações antigas de hábitos não tinham data e não serão convertidas em conclusões de hoje.</p>
    <button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'jornada-plena-dados-antigos.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Baixar cópia dos dados antigos</button>
    <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />Conferi a cópia e estes dados são meus. Vou revisar os exemplos após a importação.</label>
    <button disabled={blocked || !reviewed} onClick={() => { try { const next = parseWorkspace(JSON.stringify(importLegacy(data, raw))); if (update(() => next)) setMessage('Importação enviada. Confira o indicador de salvamento.'); } catch { setMessage('Dados antigos incompatíveis ou acima do limite. Baixe a cópia; nada foi apagado ou substituído.'); } }}>Importar dados antigos sem substituir os atuais</button><p role="status">{message}</p>
  </section>;
}
