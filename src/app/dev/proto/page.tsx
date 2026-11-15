'use client';
import { useEffect, useRef } from 'react';
import { TECO, drawProc, gridToCanvas } from '@/game/art/charProc';

/** Protótipo de sprite detalhado (dev). */
export default function Proto() {
  const big = useRef<HTMLDivElement>(null);
  const small = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const g = drawProc(TECO);
    for (const [ref, s] of [[big, 14], [small, 3]] as const) {
      const c = gridToCanvas(g, s); c.style.imageRendering = 'pixelated'; ref.current?.replaceChildren(c);
    }
  }, []);
  return (
    <main style={{ padding: 16, background: 'linear-gradient(#4a2a8a,#2a1a5a)', minHeight: '100vh', display: 'flex', gap: 40, alignItems: 'flex-end' }}>
      <div ref={big} /><div ref={small} />
    </main>
  );
}
