'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { CharacterId } from '@shared/characters';
import { ANIMS, FRAME_H, FRAME_W, characterFrame, type CharAnim } from '@/game/art/characters';
import { settingsStore } from '@/game/settings';

/** Prévia animada de um personagem (pixel-perfect, escala inteira). */
export function CharacterSprite({ id, anim = 'idle', scale = 5, flip = false, label }: { id: CharacterId; anim?: CharAnim; scale?: number; flip?: boolean; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { reduceMotion } = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const info = ANIMS[anim];
    const t0 = performance.now();
    const draw = () => {
      const f = reduceMotion ? 0 : Math.floor(((performance.now() - t0) / 1000) * info.fps) % info.frames;
      ctx.clearRect(0, 0, FRAME_W, FRAME_H);
      ctx.drawImage(characterFrame(id, anim, f), 0, 0);
    };
    draw();
    if (reduceMotion) return;
    const iv = setInterval(draw, 70);
    return () => clearInterval(iv);
  }, [id, anim, reduceMotion]);

  return (
    <canvas ref={ref} width={FRAME_W} height={FRAME_H} role="img" aria-label={label ?? id}
      style={{ width: FRAME_W * scale, height: FRAME_H * scale, imageRendering: 'pixelated', transform: flip ? 'scaleX(-1)' : undefined }} />
  );
}
