'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import type { PointerEvent, ReactNode } from 'react';
import styles from './landing.module.css';
import { useLandingMotion } from './use-landing-motion';

type MagneticLinkProps = {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  className?: string;
};

export function MagneticLink({ href, children, secondary = false, className = '' }: MagneticLinkProps) {
  const motionEnabled = useLandingMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 180, damping: 20 });
  const springY = useSpring(y, { stiffness: 180, damping: 20 });

  function move(event: PointerEvent<HTMLAnchorElement>) {
    if (!motionEnabled || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 10);
    y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 8);
  }

  function reset() { x.set(0); y.set(0); }

  return (
    <motion.a
      href={href}
      className={`${styles.button} ${secondary ? styles.secondary : styles.primary} ${className}`}
      style={motionEnabled ? { x: springX, y: springY } : { x: 0, y: 0 }}
      onPointerMove={move}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onFocus={reset}
      onBlur={reset}
    >
      {children}
    </motion.a>
  );
}
