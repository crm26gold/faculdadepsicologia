'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ExternalLink, Send, Unplug } from 'lucide-react';
import { api } from './community/client';

type AdminState = { channels: { channel: string; enabled: boolean; bot_username: string; has_token: boolean; token_hint: string; links: number }[]; server_ready: boolean };
type Status = { channels: { channel: string; enabled: boolean; bot_username: string; linked: boolean }[]; owner: boolean };

/** Owner panel: paste the BotFather token, the server registers the webhook and keeps the token encrypted. */
export function TelegramAdmin() {
  const [state, setState] = useState<AdminState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { try { setState(await api<AdminState>('/api/messenger?admin=1')); } catch { setHidden(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (hidden || !state) return null;
  const telegram = state.channels.find(item => item.channel === 'telegram');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const token = String(fields.get('token') ?? '').trim();
    setBusy(true); setMessage('');
    try {
      const result = await api<{ bot_username: string | null }>('/api/messenger', { action: 'save_telegram', enabled: fields.get('enabled') === 'on', token: token || null });
      (event.target as HTMLFormElement).reset();
      setMessage(result.bot_username ? `Robô @${result.bot_username} ligado. Agora conecte seu Telegram em Meu espaço.` : 'Salvo.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <section className="panel ai-settings" aria-labelledby="telegram-admin-title">
    <div className="section-heading"><h2 id="telegram-admin-title"><Send size={16} aria-hidden="true" /> Telegram</h2><span className="muted small">Só a sua conta de proprietário vê</span></div>
    <form className="ai-card" onSubmit={save}>
      <strong>{telegram?.has_token ? `Robô @${telegram.bot_username || '…'}` : 'Robô do Telegram'}{telegram?.has_token && <span className="ai-badge">{telegram.enabled ? 'Ligado' : 'Desligado'} · token …{telegram.token_hint}</span>}</strong>
      <span className="muted small">No Telegram, fale com <strong>@BotFather</strong> › /newbot › escolha um nome e um usuário terminado em “bot” › copie o token e cole aqui. O token fica cifrado; o endereço de recebimento é registrado sozinho.</span>
      <label>Token do robô<input name="token" type="password" autoComplete="off" spellCheck={false} placeholder={telegram?.has_token ? `Guardado (…${telegram.token_hint}). Cole outro para trocar.` : '123456789:AA…'} /></label>
      <label className="cm-check"><input type="checkbox" name="enabled" defaultChecked={telegram?.enabled ?? true} /> Ligado</label>
      {telegram?.has_token && <span className="muted small">{telegram.links === 1 ? '1 conversa conectada' : `${telegram.links} conversas conectadas`}</span>}
      <div className="button-row"><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
      {message && <p className="cm-message" role="status">{message}</p>}
    </form>
  </section>;
}

/** Each person links their own Telegram with a one-time code that opens the bot already filled in. */
export function TelegramLink() {
  const [status, setStatus] = useState<Status | null>(null);
  const [link, setLink] = useState<{ code: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { try { setStatus(await api<Status>('/api/messenger')); } catch { setStatus(null); } }, []);
  useEffect(() => { void load(); }, [load]);
  // While the code is open, check every few seconds whether the bot already linked this chat.
  useEffect(() => {
    if (!link) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [link, load]);
  const telegram = status?.channels.find(item => item.channel === 'telegram');
  useEffect(() => { if (telegram?.linked) setLink(null); }, [telegram?.linked]);
  if (!status?.owner) return null;
  async function run(body: Record<string, unknown>, after?: (data: unknown) => void) {
    setBusy(true); setMessage('');
    try { const data = await api('/api/messenger', body); after?.(data); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }
  return <section className="panel telegram-link" aria-labelledby="telegram-link-title">
    <h2 id="telegram-link-title"><Send size={17} aria-hidden="true" /> Telegram</h2>
    {!telegram?.enabled ? <p className="muted">O robô do Telegram ainda não foi configurado. Em Administração › Telegram, cole o token criado no @BotFather.</p>
      : telegram.linked ? <>
        <p className="telegram-ok"><CheckCircle2 size={17} aria-hidden="true" />Conectado ao @{telegram.bot_username}. Converse com ele como no Assistente: texto ou voz.</p>
        <div className="button-row">
          <a className="button outline" href={`https://t.me/${telegram.bot_username}`} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" />Abrir conversa</a>
          <button type="button" className="button outline cm-danger" disabled={busy} onClick={() => { if (window.confirm('Desconectar o Telegram? O robô deixa de mexer no seu espaço.')) void run({ action: 'unlink', channel: 'telegram' }); }}><Unplug size={15} aria-hidden="true" />Desconectar</button>
        </div>
      </> : <>
        <p className="muted">Mande mensagens, áudios e pedidos para o robô <strong>@{telegram.bot_username}</strong> e ele organiza tudo aqui, como o Assistente.</p>
        {link ? <div className="telegram-code">
          <a className="button primary" href={link.link} target="_blank" rel="noreferrer"><Send size={15} aria-hidden="true" />Abrir no Telegram e conectar</a>
          <span className="muted small">No Telegram, toque em <strong>Iniciar</strong>. Se preferir, envie para o robô: <code>/start {link.code}</code> (vale 15 minutos, uma vez).</span>
          <span className="muted small" role="status">Esperando a confirmação do Telegram…</span>
        </div> : <button type="button" className="button primary" disabled={busy} onClick={() => void run({ action: 'link_code', channel: 'telegram' }, data => setLink(data as { code: string; link: string }))}><Send size={15} aria-hidden="true" />Conectar meu Telegram</button>}
      </>}
    {message && <p className="cm-message" role="alert">{message}</p>}
  </section>;
}
