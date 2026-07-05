'use client';

import { animate } from 'animejs';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

/**
 * Subtle route-level entrance motion (anime.js v4).
 * Respects prefers-reduced-motion per UI/UX Pro Max style guidance.
 */
export function PageEnterMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }

    animate(el, {
      opacity: [0.88, 1],
      translateY: [8, 0],
      duration: 420,
      ease: 'out(2)',
    });
  }, [pathname]);

  return (
    <div ref={rootRef} className="route-motion-root">
      {children}
    </div>
  );
}
