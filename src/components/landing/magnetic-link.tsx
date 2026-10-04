'use client';

import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import type { PointerEvent, ReactNode } from 'react';
import styles from './landing.module.css';

type MagneticLinkProps = {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  className?: string;
};

export function MagneticLink({ href, children, secondary = false, className = '' }: MagneticLinkProps) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 180, damping: 20 });
  const springY = useSpring(y, { stiffness: 180, damping: 20 });

  function move(event: PointerEvent<HTMLAnchorElement>) {
    if (reduced || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 10);
    y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 8);
  }

  function reset() { x.set(0); y.set(0); }

  return (
    <motion.a
      href={href}
      className={`${styles.button} ${secondary ? styles.secondary : styles.primary} ${className}`}
      style={reduced ? undefined : { x: springX, y: springY }}
      onPointerMove={move}
      onPointerLeave={reset}
      onBlur={reset}
    >
      {children}
    </motion.a>
  );
}
