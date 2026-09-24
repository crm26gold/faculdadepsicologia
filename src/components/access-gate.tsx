import { BookOpen, CalendarDays, Check, LockKeyhole, Sparkles, Sprout } from 'lucide-react';
import { LoginForm } from './login-form';
import styles from './login.module.css';

export function AccessGate({ configured, error = false }: { configured: boolean; error?: boolean }) {
  return <main className={styles.page}>
    <section className={styles.story} aria-label="Seu espaço de aprendizado">
      <a href="/" className={styles.brand} aria-label="Faculdade Psi — início"><span><Sprout size={27} aria-hidden="true" /></span>Faculdade <strong>Psi.</strong></a>
      <div className={styles.storyContent}><span className={styles.eyebrow}>Menos sobrecarga. Mais descobertas.</span><h2>Seu caminho.<br />Seu tempo.<br /><em>Seu jeito de aprender.</em></h2><p>Um espaço para reunir o que importa e seguir em frente, uma ideia de cada vez.</p>
        <div className={styles.illustration} aria-hidden="true"><div className={styles.orbit} /><div className={styles.sun} /><div className={styles.studyCard}><span className={styles.cardIcon}><BookOpen size={21} /></span><span>Meu próximo passo<strong>Um pouco de cada vez.</strong></span><span className={styles.check}><Check size={16} /></span><div className={styles.cardLine} /><div className={styles.cardLineShort} /><div className={styles.cardPills}><span>Minhas matérias</span><span>Meu ritmo</span></div></div><span className={styles.floatingCalendar}><CalendarDays size={22} /></span><span className={styles.floatingSpark}><Sparkles size={23} /></span></div>
      </div><p className={styles.storyFooter}>O importante não é correr. É continuar.</p>
    </section>
    <section className={styles.access} aria-labelledby="login-title"><div className={styles.loginCard}><span className={styles.lockBadge}><LockKeyhole size={15} aria-hidden="true" />Acesso pessoal · administrador</span><span className={styles.welcome}>BEM-VINDO DE VOLTA</span><h1 id="login-title">Seu espaço está aqui.</h1><p className={styles.intro}>Entre para cuidar das suas ideias,<br className={styles.desktopBreak} /> organizar a semana e continuar sua jornada.</p><LoginForm configured={configured} error={error} /><div className={styles.privateNote}><LockKeyhole size={16} aria-hidden="true" /><p>Sem cadastro público.<br /><span>Somente a conta autorizada pode acessar o sistema.</span></p></div></div><p className={styles.accessFooter}>Faculdade Psi <span>·</span> Aprender também pode ser do seu jeito.</p></section>
  </main>;
}
