'use client';
import { useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import styles from './login.module.css';

export function LoginForm({ configured, error = false }: { configured: boolean; error?: boolean }) {
  const [pending, setPending] = useState(false);
  return <form action="/auth/google" method="post" onSubmit={() => setPending(true)} className={styles.form} aria-busy={pending}>
    <p>Entre com sua conta Google. No primeiro acesso seu espaço é criado, vazio e privado. Nenhuma senha é solicitada ou armazenada.</p>
    {error && <div role="alert" className={styles.error}>Não foi possível concluir o acesso. Use uma conta Google com e-mail verificado e tente novamente.</div>}
    {!configured && <p role="status" className={styles.setupNotice}>Configuração do Google pendente. O espaço pessoal permanece fechado até a validação da conta administradora.</p>}
    <button type="submit" className={styles.submit} disabled={pending || !configured}>{pending ? <><LoaderCircle size={19} aria-hidden="true" />Conectando…</> : <>Continuar com Google <ArrowRight size={19} aria-hidden="true" /></>}</button>
    <details className={styles.help}><summary>Precisa de ajuda para entrar?</summary><p>Use a sua conta Google de sempre. Recuperação de conta e verificação em duas etapas são gerenciadas pelo Google. Recebeu um link de convite? Abra o link antes de entrar e você cai direto na sala.</p></details>
  </form>;
}
