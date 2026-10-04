'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { ArrowDown, ArrowDownRight, ArrowRight, BookOpen, Check, Compass, Menu, Sparkles, Sun, Waves } from 'lucide-react';
import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MagneticLink } from './magnetic-link';
import { SmoothScroll } from './smooth-scroll';
import styles from './landing.module.css';

const JourneyScene = dynamic(() => import('./journey-scene'), { ssr: false });

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/jornada" className={styles.brand} aria-label="Jornada Plena, início">
      <Image src="/brand/simbolo.svg" alt="" width={44} height={44} priority={!compact} />
      <span>Jornada Plena<span className={styles.brandCaption}>Seu tempo. Seu caminho.</span></span>
    </a>
  );
}

function JourneyOrb() {
  const root = useRef<HTMLDivElement>(null);
  const visible = useInView(root, { margin: '120px' });
  const reduced = useReducedMotion();
  const [capable, setCapable] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => { setFailed(true); setReady(false); }, []);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)');
    const update = () => setCapable(desktop.matches);
    update();
    desktop.addEventListener('change', update);
    return () => desktop.removeEventListener('change', update);
  }, []);

  const use3D = capable && visible && reduced === false && !failed;

  return (
    <div ref={root} className={styles.orbStage} aria-hidden="true" data-scene-ready={use3D && ready}>
      <div className={styles.orbHalo} />
      <div className={styles.orbitFallback}>
        <div className={styles.orbitOuter} /><div className={styles.orbitInner} /><div className={styles.orbCore} />
      </div>
      {use3D ? <div className={styles.canvas}><JourneyScene onReady={onReady} onFailure={onFailure} /></div> : null}
      <div className={styles.orbIdentity}><Image src="/brand/simbolo.svg" alt="" width={114} height={114} /></div>
      <div className={`${styles.floatingCard} ${styles.intentionCard}`}>
        <span className={styles.cardIcon}><Sun size={19} strokeWidth={1.5} /></span>
        <span className={styles.cardMeta}>UM LEMBRETE PARA HOJE</span>
        <strong>Seu ritmo importa.</strong>
        <span className={styles.cardLine} />
        <span className={styles.cardSmall}>Um passo de cada vez também é progresso.</span>
      </div>
      <div className={`${styles.floatingCard} ${styles.balanceCard}`}>
        <span className={styles.balanceCheck}><Check size={17} strokeWidth={2} /></span>
        <div><span className={styles.cardMeta}>MAIS ESPAÇO PARA</span><strong>O que faz sentido.</strong></div>
      </div>
      <div className={styles.orbitLabel}><span /> IDEIAS · ROTINA · PROPÓSITO</div>
    </div>
  );
}

function Header() {
  const menu = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => { if (menu.current) menu.current.open = false; };

  return (
    <header className={styles.header}>
      <div className={styles.navShell}>
        <Brand />
        <nav aria-label="Navegação principal" className={styles.desktopNav}>
          <a href="#essencia">A essência</a><a href="#possibilidades">Seu espaço</a>
        </nav>
        <div className={styles.navActions}>
          <a href="/login" className={styles.loginLink}>Entrar <ArrowDownRight size={16} aria-hidden="true" /></a>
          <details ref={menu} className={styles.mobileMenu} onKeyDown={(event) => {
            if (event.key === 'Escape') { closeMenu(); menu.current?.querySelector('summary')?.focus(); }
          }}>
            <summary aria-label="Menu de navegação"><Menu size={22} aria-hidden="true" /></summary>
            <nav aria-label="Navegação móvel"><a href="#essencia" onClick={closeMenu}>A essência</a><a href="#possibilidades" onClick={closeMenu}>Seu espaço</a><a href="/login">Começar minha jornada</a></nav>
          </details>
        </div>
      </div>
    </header>
  );
}

const pillars = [
  { number: '01', icon: Compass, title: 'Encontre seu norte.', text: 'Intenções que viram próximos passos. Uma rotina que combina com a vida que você quer construir.' },
  { number: '02', icon: BookOpen, title: 'Dê espaço às ideias.', text: 'Estudos, anotações e descobertas juntos. Para aprender com presença e continuar de onde parou.' },
  { number: '03', icon: Waves, title: 'Respeite seu ritmo.', text: 'Veja sua jornada com clareza. Ajuste os planos e reconheça o caminho que você já percorreu.' },
];

export function JornadaLanding() {
  const hero = useRef<HTMLElement>(null);
  const story = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress: heroProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const { scrollYProgress: storyProgress } = useScroll({ target: story, offset: ['start end', 'end start'] });
  const orbY = useTransform(heroProgress, [0, 1], [0, 100]);
  const orbOpacity = useTransform(heroProgress, [0, 0.9], [1, 0.25]);
  const storyY = useTransform(storyProgress, [0, 1], [45, -45]);
  const reveal = reduced ? undefined : { opacity: [0.7, 1], y: [20, 0] };

  return (
    <div className={`${styles.landing} jp:font-display jp:text-midnight jp:bg-mist`}>
      <SmoothScroll />
      <a href="#conteudo" className={styles.skipLink}>Ir para o conteúdo</a>
      <Header />
      <main id="conteudo" tabIndex={-1}>
        <section ref={hero} className={styles.hero} aria-labelledby="hero-title">
          <div className={`${styles.heroGrid} jp:grid jp:items-center jp:lg:grid-cols-2`}>
            <div className={styles.heroCopy}>
              <motion.div initial={false} animate={reduced ? undefined : { y: [10, 0], opacity: [0.75, 1] }} transition={{ duration: 0.8 }} className={styles.eyebrow}>
                <span className={styles.eyebrowLine} /> UM ESPAÇO PARA FLORESCER
              </motion.div>
              <motion.h1 id="hero-title" className={`${styles.heroTitle} jp:font-display jp:font-bold jp:tracking-[-0.065em]`} initial={false} animate={reduced ? undefined : { y: [22, 0] }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
                Mais vida.<br /><span className="jp:text-ocean">Menos ruído.</span><span className={styles.titleDot} aria-hidden="true">✦</span>
              </motion.h1>
              <motion.p className={`${styles.heroDescription} jp:text-slate-ink`} initial={false} animate={reveal} transition={{ duration: 0.9, delay: 0.1 }}>
                Sua rotina, seus estudos e suas ideias.<br className={styles.desktopBreak} /> Um lugar para cuidar do que importa —<br className={styles.desktopBreak} /> e abrir espaço para quem você quer ser.
              </motion.p>
              <div className="jp:flex jp:flex-wrap jp:items-center jp:gap-5">
                <MagneticLink href="/login">Começar minha jornada <ArrowUpRightIcon /></MagneticLink>
                <a href="#essencia" className={styles.discoverLink}>Conhecer a Jornada <ArrowDown size={17} aria-hidden="true" /></a>
              </div>
              <div className={styles.heroNote}><span className={styles.noteMark}><Sparkles size={14} aria-hidden="true" /></span> Sem pressa. Com intenção. Do seu jeito.</div>
            </div>
            <motion.div className={styles.heroVisual} style={reduced ? undefined : { y: orbY, opacity: orbOpacity }}>
              <JourneyOrb />
            </motion.div>
          </div>
          <div className={styles.heroFoot}>
            <span>01 <span className={styles.footDivider} /> SUA JORNADA COMEÇA AQUI</span>
            <a href="#essencia" aria-label="Descer para conhecer a essência da Jornada"><span>Explore com calma</span><ArrowDown size={19} aria-hidden="true" /></a>
          </div>
        </section>

        <section ref={story} id="essencia" className={styles.story} aria-labelledby="story-title">
          <div className={styles.storyTop}><span className={styles.eyebrow}>A ESSÊNCIA DA JORNADA</span><span className={styles.sectionNumber}>02 / PRESENÇA</span></div>
          <div className={`${styles.storyGrid} jp:grid jp:gap-12 jp:lg:grid-cols-[1.15fr_1fr]`}>
            <motion.div initial={false} whileInView={reveal} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.9 }}>
              <h2 id="story-title" className={styles.storyTitle}>Você não precisa<br />dar conta de tudo.<br /><span>Só do próximo<br className={styles.desktopBreak} /> passo.</span></h2>
              <p className={styles.storyCaption}>SEU CAMINHO. SEU TEMPO. SEU JEITO DE APRENDER.</p>
            </motion.div>
            <motion.div className={styles.storyRight} style={reduced ? undefined : { y: storyY }}>
              <p className={styles.storyDescription}>Entre o que você precisa fazer e o que deseja viver, existe um espaço. A Jornada Plena nasceu para cuidar dele.</p>
              <p className={styles.storyBody}>Reunir o que estava espalhado. Transformar uma ideia em um plano possível. Dar atenção ao presente, sem perder de vista o que vem depois.</p>
              <div className={styles.dayCard}>
                <div className={styles.dayCardHead}><span><Sun size={18} aria-hidden="true" /> Um dia com mais espaço</span><span className={styles.exampleBadge}>EXEMPLO</span></div>
                <div className={styles.dayItem}><span className={styles.dayTime}>09:00</span><span className={styles.dayDot} /><div><strong>Aprender algo novo</strong><span>Um tempo para seus estudos</span></div><BookOpen size={18} aria-hidden="true" /></div>
                <div className={styles.dayItem}><span className={styles.dayTime}>14:00</span><span className={`${styles.dayDot} ${styles.dayDotGold}`} /><div><strong>Uma ideia vira um passo</strong><span>Organizar o que faz sentido</span></div><Compass size={18} aria-hidden="true" /></div>
                <div className={styles.dayCardFooter}><Waves size={18} aria-hidden="true" /><span>E espaço para simplesmente viver.</span></div>
              </div>
            </motion.div>
          </div>
          <div id="possibilidades" className={`${styles.pillars} jp:grid jp:md:grid-cols-3 jp:gap-8`}>
            {pillars.map(({ number, icon: Icon, title, text }, index) => (
              <motion.article key={number} className={styles.pillar} initial={false} whileInView={reveal} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.7, delay: index * 0.1 }}>
                <div className={styles.pillarTop}><Icon size={25} strokeWidth={1.35} aria-hidden="true" /><span>{number}</span></div>
                <h3>{title}</h3><p>{text}</p>
              </motion.article>
            ))}
          </div>
          <div className={styles.storyBottom}><p>O próximo capítulo começa com um pequeno passo.</p><MagneticLink href="/login" secondary>Encontrar meu espaço <ArrowRight size={19} aria-hidden="true" /></MagneticLink></div>
        </section>
      </main>
      <footer className={styles.footer}><Brand compact /><span>Uma jornada mais leve. Uma vida mais sua.</span><nav aria-label="Informações legais"><a href="/privacidade">Privacidade</a><a href="/termos">Termos</a></nav></footer>
    </div>
  );
}

function ArrowUpRightIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" /></svg>;
}
