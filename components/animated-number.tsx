'use client';

import { useEffect, useRef, useState } from 'react';

/** Counts up from 0 to `value` on mount (respects prefers-reduced-motion). */
export function AnimatedNumber({ value, prefix = '', duration = 800 }: { value: number; prefix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return <>{prefix}{display.toLocaleString('he-IL')}</>;
}

/** Animated collection-progress donut (SVG). */
export function CollectionDonut({ percent, size = 92 }: { percent: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const target = circumference * (1 - clamped / 100);
    const id = requestAnimationFrame(() => setOffset(target));
    return () => cancelAnimationFrame(id);
  }, [clamped, circumference]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg className="donut" width={size} height={size}>
        <circle className="donut-bg" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={10} />
        <circle
          className="donut-fg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="donut-label">{Math.round(clamped)}%</div>
    </div>
  );
}
