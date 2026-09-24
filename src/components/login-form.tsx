'use client';
import { useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import styles from './login.module.css';

export function LoginForm({ configured, error = false }: { configured: boolean; error?: boolean }) {
  const [pending, setPending] = useState(false);
  return <form action="/auth/google" method="post" onSubmit={() => setPending(true)} className={styles.form} aria-busy={pending}>
    <p>Use sua conta Google autorizada. Nenhuma senha é solicitada ou armazenada por este aplicativo.</p>
    {error && <div role="alert" className={styles.error}>Não foi possível concluir o acesso. Use a conta autorizada e tente novamente. Se continuar, confira a configuração do Google.</div>}
    {!configured && <p role="status" className={styles.setupNotice}>Configuração do Google pendente. O espaço pessoal permanece fechado até a validação da conta administradora.</p>}
    <button type="submit" className={styles.submit} disabled={pending || !configured}>{pending ? <><LoaderCircle size={19} aria-hidden="true" />Conectando…</> : <>Continuar com Google <ArrowRight size={19} aria-hidden="true" /></>}</button>
    <details className={styles.help}><summary>Precisa de ajuda para entrar?</summary><p>Escolha a conta Google autorizada. A recuperação da conta e a verificação em duas etapas são gerenciadas pelo Google. Não há cadastro público nem acesso por senha neste aplicativo.</p></details>
  </form>;
}
