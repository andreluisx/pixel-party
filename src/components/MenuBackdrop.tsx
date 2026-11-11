'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { CHARACTER_IDS } from '@shared/characters';
import { createRng } from '@shared/rng';
import { ANIMS, characterFrame, type CharAnim } from '@/game/art/characters';
import { settingsStore } from '@/game/settings';

const W = 320;
const H = 180;

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
function mix(c1: [number, number, number], c2: [number, number, number], t: number) {
  return `rgb(${lerp(c1[0], c2[0], t)},${lerp(c1[1], c2[1], t)},${lerp(c1[2], c2[2], t)})`;
}

/** Fundo animado do menu: céu de crepúsculo, nuvens, castelo, água, ilha com os personagens e vaga-lumes. */
export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { reduceMotion } = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const rng = createRng(77);
    const stars = Array.from({ length: 46 }, () => ({ x: rng.int(0, W), y: rng.int(0, 90), p: rng.next() * 6 }));
    const mountains: number[] = [];
    for (let x = 0; x <= W; x += 8) mountains.push(96 + Math.round(Math.sin(x / 31) * 9 + Math.sin(x / 13) * 4 + rng.int(-2, 2)));
    const pines = Array.from({ length: 34 }, (_, i) => ({ x: i * 10 + rng.int(-3, 3), h: rng.int(10, 17) }));
    const clouds = Array.from({ length: 6 }, (_, i) => ({ y: 14 + i * 13 + rng.int(0, 6), x: rng.int(0, W), s: 3 + rng.next() * 5, w: rng.int(22, 40) }));
    const flies = Array.from({ length: 16 }, () => ({ x: rng.int(30, 290), y: rng.int(110, 150), p: rng.next() * 7, r: rng.int(4, 12) }));
    const roster = [...CHARACTER_IDS];

    const rect = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

    const draw = (t: number) => {
      // céu em faixas (efeito pixelado)
      for (let y = 0; y < 128; y += 4) rect(0, y, W, 4, mix([34, 22, 94], [226, 108, 150], y / 128));
      // lua
      rect(246, 22, 14, 14, '#fff3c4'); rect(248, 20, 10, 18, '#fff3c4'); rect(244, 24, 18, 10, '#fff3c4'); rect(252, 26, 4, 4, '#f1d98a');
      // estrelas
      for (const s of stars) { const a = 0.4 + 0.6 * Math.abs(Math.sin(t / 700 + s.p)); ctx.globalAlpha = a; rect(s.x, s.y, 1, 1, '#ffffff'); }
      ctx.globalAlpha = 1;
      // nuvens
      for (const c of clouds) {
        const x = ((c.x + t / 1000 * c.s) % (W + 60)) - 30;
        rect(x + 4, c.y, c.w - 8, 5, '#ffd9ec'); rect(x, c.y + 3, c.w, 5, '#ffd9ec'); rect(x + 6, c.y - 3, c.w / 2, 4, '#ffe9f4');
        rect(x, c.y + 7, c.w, 2, '#e9a8cf');
      }
      // montanhas distantes
      ctx.fillStyle = '#4a2a8c';
      ctx.beginPath(); ctx.moveTo(0, 128);
      mountains.forEach((h, i) => ctx.lineTo(i * 8, h));
      ctx.lineTo(W, 128); ctx.closePath(); ctx.fill();
      // castelo (silhueta com janelas acesas)
      const cx = 238, cy = 78;
      rect(cx, cy + 14, 44, 38, '#2a1a5c'); rect(cx - 6, cy + 4, 12, 48, '#2a1a5c'); rect(cx + 38, cy + 4, 12, 48, '#2a1a5c'); rect(cx + 16, cy - 6, 14, 20, '#2a1a5c');
      for (const [tx, ty, tw] of [[cx - 8, cy - 4, 16], [cx + 36, cy - 4, 16], [cx + 14, cy - 16, 18]] as const) {
        for (let i = 0; i < 8; i++) rect(tx + i, ty + i * 0 - i, tw - i * 2, 1, '#6a3fb5');
      }
      rect(cx + 22, cy - 22, 1, 8, '#1b1030'); rect(cx + 23, cy - 22, 5, 3, '#e05252');
      for (const [wx, wy] of [[cx - 2, cy + 12], [cx + 42, cy + 12], [cx + 20, cy + 2], [cx + 10, cy + 26], [cx + 30, cy + 26]] as [number, number][]) rect(wx, wy, 2, 3, Math.sin(t / 900 + wx) > -0.6 ? '#ffd34d' : '#a8651a');
      rect(cx + 18, cy + 36, 8, 16, '#120a2e');
      // pinheiros
      for (const p of pines) { rect(p.x + 2, 128 - p.h, 2, p.h, '#1b1348'); for (let i = 0; i < 3; i++) rect(p.x - i, 128 - p.h + i * 4, 6 + i * 2, 4, '#1f1450'); }
      // água
      for (let y = 128; y < H; y += 4) rect(0, y, W, 4, mix([42, 99, 196], [26, 60, 140], (y - 128) / (H - 128)));
      for (let y = 134; y < H; y += 7) {
        for (let x = -20; x < W; x += 34) {
          const ox = Math.round(Math.sin(t / 900 + y * 0.7) * 6);
          rect(x + ox + (y % 3) * 9, y, 10, 1, '#7db4ff');
          rect(x + ox + 14 + (y % 3) * 9, y + 2, 5, 1, '#5e96f0');
        }
      }
      // ilha
      rect(30, 146, 262, 22, '#6b4423'); rect(30, 146, 262, 4, '#8a5a2b'); rect(36, 166, 250, 4, '#4a2e16');
      rect(26, 136, 270, 14, '#4fae4c'); rect(26, 136, 270, 3, '#6bc660'); rect(26, 149, 270, 2, '#3a8a3e');
      for (let x = 30; x < 290; x += 9) rect(x + ((x * 7) % 5), 141 + ((x * 3) % 6), 1, 2, '#3a8a3e');
      for (let x = 44; x < 290; x += 53) { rect(x, 138, 1, 2, '#ff8fc1'); rect(x + 5, 143, 1, 2, '#fff3a8'); }
      // personagens no gramado
      roster.forEach((id, i) => {
        const cyc = Math.floor(t / 3200) + i * 2;
        const phase = t % 3200;
        let anim: CharAnim = 'idle';
        if (cyc % 6 === 0 && phase < 1400) anim = 'celebrate';
        else if (cyc % 6 === 3 && phase < 1100) anim = 'surprised';
        const info = ANIMS[anim];
        const f = Math.floor((t / 1000) * info.fps + i) % info.frames;
        const x = [30, 54, 78, 230, 254, 278][i] ?? 40; // laterais: o centro fica livre para os botões
        ctx.globalAlpha = 0.35; rect(x + 1, 138 + 14, 12, 2, '#1b1030'); ctx.globalAlpha = 1;
        ctx.drawImage(characterFrame(id, anim, f), x, 120);
      });
      // vaga-lumes
      for (const f of flies) {
        const fx = f.x + Math.sin(t / 1300 + f.p) * f.r, fy = f.y + Math.cos(t / 1700 + f.p) * (f.r / 2);
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t / 500 + f.p));
        rect(fx, fy, 2, 2, '#ffe08a');
      }
      ctx.globalAlpha = 1;
    };

    draw(0);
    if (reduceMotion) return;
    const start = performance.now();
    const iv = setInterval(() => draw(performance.now() - start), 66);
    return () => clearInterval(iv);
  }, [reduceMotion]);

  return <canvas ref={ref} className="backdrop" width={W} height={H} aria-hidden="true" />;
}
