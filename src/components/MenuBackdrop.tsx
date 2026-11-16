'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { CHARACTER_IDS } from '@shared/characters';
import { createRng } from '@shared/rng';
import { ANIMS, characterFrame, type CharAnim } from '@/game/art/characters';
import { settingsStore } from '@/game/settings';

const W = 360;
const H = 174;
const HORIZON = 112; // onde o lago encontra as montanhas
const GRASS_Y = 138;

type RGB = [number, number, number];
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const mixRgb = (c1: RGB, c2: RGB, t: number) => `rgb(${lerp(c1[0], c2[0], t)},${lerp(c1[1], c2[1], t)},${lerp(c1[2], c2[2], t)})`;
function ramp(stops: Array<[number, RGB]>, t: number) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i]![0]) { const [a, ca] = stops[i - 1]!, [b, cb] = stops[i]!; return mixRgb(ca, cb, (t - a) / (b - a || 1)); }
  }
  const last = stops[stops.length - 1]![1];
  return `rgb(${last[0]},${last[1]},${last[2]})`;
}

type Ctx = CanvasRenderingContext2D;
const rect = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
function disc(c: Ctx, cx: number, cy: number, r: number, col: string) {
  c.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.4)); c.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); }
}
function pine(c: Ctx, x: number, base: number, h: number, col: string, hi?: string) {
  rect(c, x - 1, base - 4, 2, 4, col);
  const tiers = Math.max(3, Math.round(h / 9));
  for (let i = 0; i < tiers; i++) {
    const ty = base - 3 - (h - 3) * ((i + 1) / tiers);
    const wTier = Math.round((h / 3.2) * (1 - i / (tiers + 0.6)) + 3);
    for (let k = 0; k < Math.round(h / tiers) + 2; k++) { const w = Math.round(wTier * ((k + 1) / (h / tiers + 2))) ; rect(c, x - w, ty + k, w * 2 + 1, 1, col); }
    if (hi) rect(c, x - 1, ty, 2, 1, hi);
  }
}
function cloud(c: Ctx, x: number, y: number, w: number, tones: [string, string, string]) {
  const [hi, body, shade] = tones;
  const puffs: Array<[number, number]> = [[0.18, 0.18], [0.38, 0.3], [0.62, 0.26], [0.82, 0.17]];
  rect(c, x, y, w, 4, shade); rect(c, x + 1, y + 3, w - 2, 2, shade);
  for (const [px, pr] of puffs) disc(c, x + px * w, y - pr * w * 0.45, Math.max(2, Math.round(pr * w * 0.5)), body);
  rect(c, x, y - 2, w, 4, body);
  for (const [px, pr] of puffs) disc(c, x + px * w - 1, y - pr * w * 0.5 - 1, Math.max(1, Math.round(pr * w * 0.3)), hi);
}

/** Fundo do menu: noite de lua cheia roxa, nuvens, castelo ao fundo, floresta, lago com reflexo, ilha com os personagens. */
export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { reduceMotion } = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const rng = createRng(77);
    const MOON = { x: 286, y: 25 };
    const CASTLE = { x: 290, base: HORIZON + 2 };

    const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; return [c, g] as const; };

    // ---------- camada A (estática): céu, brilho e lua ----------
    const [skyC, sky] = layer();
    const SKY: Array<[number, RGB]> = [[0, [24, 12, 84]], [0.35, [58, 24, 130]], [0.62, [112, 46, 160]], [0.85, [190, 84, 170]], [1, [255, 168, 196]]];
    for (let y = 0; y < HORIZON + 6; y += 3) rect(sky, 0, y, W, 3, ramp(SKY, y / (HORIZON + 6)));
    sky.globalAlpha = 0.07;
    for (const r of [46, 38, 31, 25]) disc(sky, MOON.x, MOON.y, r, '#ffe6f0');
    sky.globalAlpha = 1;
    disc(sky, MOON.x, MOON.y, 13, '#f7dfd8'); disc(sky, MOON.x - 1, MOON.y - 1, 12, '#fbe9e2');
    for (const [dx, dy, r] of [[3, 4, 3], [-5, 2, 2], [2, -5, 2], [-2, 7, 1], [6, -1, 1], [-6, -4, 1]] as const) disc(sky, MOON.x + dx, MOON.y + dy, r, '#e3b6c4');
    for (const [dx, dy, r] of [[3, 4, 2], [-5, 2, 1]] as const) disc(sky, MOON.x + dx - 1, MOON.y + dy - 1, r, '#d9a3b8');

    // ---------- camada B (estática): montanhas, castelo, floresta, lago, ilha ----------
    const [landC, land] = layer();
    const ridge = (base: number, amp: number, f1: number, f2: number, col: string, off: number) => {
      land.fillStyle = col;
      for (let x = 0; x < W; x += 2) { const h = base - Math.round(Math.abs(Math.sin((x + off) / f1)) * amp + Math.sin((x + off) / f2) * amp * 0.3); land.fillRect(x, h, 2, HORIZON + 4 - h); }
    };
    ridge(HORIZON - 10, 26, 46, 19, '#8a3fb0', 10);
    ridge(HORIZON - 4, 15, 33, 11, '#5e2c9a', 70);
    // colina do castelo + castelo
    for (let x = 230; x < W; x += 2) { const t = (x - 230) / 130; const h = HORIZON - Math.round(Math.sin(Math.min(1, t) * Math.PI * 0.9) * 9) - 1; rect(land, x, h, 2, HORIZON + 4 - h, '#2b1668'); }
    const cx = CASTLE.x, cb = CASTLE.base - 8;
    const body = '#2b1668', edge = '#3c2288', dark = '#1c0f4a';
    rect(land, cx - 22, cb - 30, 44, 30, body); // muralha
    rect(land, cx - 11, cb - 58, 22, 58, body); // torre central
    rect(land, cx - 33, cb - 40, 13, 40, body); rect(land, cx + 20, cb - 40, 13, 40, body); // torres laterais
    rect(land, cx - 11, cb - 58, 2, 58, edge); rect(land, cx - 33, cb - 40, 2, 40, edge); rect(land, cx + 20, cb - 40, 2, 40, edge);
    for (const [bx, by, bw] of [[cx - 33, cb - 40, 13], [cx + 20, cb - 40, 13], [cx - 11, cb - 58, 22]] as const) {
      for (let i = 0; i < bw; i += 4) rect(land, bx + i, by - 3, 3, 3, body);
      rect(land, bx - 1, by - 1, bw + 2, 2, edge);
    }
    for (let i = 0; i < 44; i += 5) rect(land, cx - 22 + i, cb - 33, 3, 3, body); // ameias da muralha
    rect(land, cx - 3, cb - 12, 6, 12, dark); rect(land, cx - 2, cb - 14, 4, 2, dark); // portão
    rect(land, cx, cb - 74 + 16, 1, 2, dark);
    // pinheiros ao fundo (direita, atrás do castelo) e esquerda
    for (let i = 0; i < 14; i++) pine(land, 228 + i * 9 + rng.int(-2, 2), HORIZON + 3, rng.int(14, 24), '#27145f');
    for (let i = 0; i < 9; i++) pine(land, 108 + i * 12 + rng.int(-3, 3), HORIZON + 3, rng.int(8, 14), '#2a1668');
    for (let i = 0; i < 9; i++) pine(land, i * 8 + rng.int(-2, 2), HORIZON + 4, rng.int(34, 56), '#1a0d46', '#2c1b6c');
    for (let i = 0; i < 7; i++) pine(land, 6 + i * 10 + rng.int(-2, 2), HORIZON + 6, rng.int(22, 38), '#130a38');
    for (let i = 0; i < 6; i++) pine(land, 330 + i * 8 + rng.int(-2, 2), HORIZON + 6, rng.int(26, 44), '#150b3c');
    // margem escura
    rect(land, 0, HORIZON + 2, W, 3, '#1a0e48');

    // lago
    const LAKE: Array<[number, RGB]> = [[0, [168, 86, 190]], [0.18, [96, 74, 204]], [0.5, [44, 76, 200]], [1, [22, 46, 146]]];
    for (let y = HORIZON + 4; y < H; y += 3) rect(land, 0, y, W, 3, ramp(LAKE, (y - HORIZON - 4) / (H - HORIZON - 4)));
    // ilha (grama + terra)
    rect(land, 22, GRASS_Y + 12, 316, 24, '#6b4423'); rect(land, 22, GRASS_Y + 12, 316, 2, '#9a6a36');
    rect(land, 28, H - 6, 304, 6, '#4a2e16');
    for (let i = 0; i < 40; i++) { const sx = 30 + rng.int(0, 296), sy = GRASS_Y + 16 + rng.int(0, 14); rect(land, sx, sy, rng.int(3, 6), 2, rng.chance(0.5) ? '#4a2e16' : '#8a5a2b'); }
    rect(land, 18, GRASS_Y, 324, 13, '#4fae4c'); rect(land, 18, GRASS_Y, 324, 2, '#86dc72'); rect(land, 18, GRASS_Y + 2, 324, 1, '#6bc660'); rect(land, 18, GRASS_Y + 11, 324, 2, '#357d3a');
    for (let x = 20; x < 340; x += 6) { rect(land, x + ((x * 7) % 5), GRASS_Y + 4 + ((x * 3) % 6), 1, 2, '#3a8a3e'); }
    for (let x = 26; x < 336; x += 31) { const k = (x * 13) % 4; rect(land, x, GRASS_Y + 3 + (k % 3), 2, 2, ['#ff8fc1', '#fff3a8', '#c58cff', '#ff9b6a'][k]!); rect(land, x + 1, GRASS_Y + 5 + (k % 3), 1, 1, '#3a8a3e'); }
    // plantas do canto
    const fern = (x0: number, dir: 1 | -1) => {
      for (let i = 0; i < 9; i++) { const h = 12 + (i * 5) % 11; const bx = x0 + dir * i * 2; for (let k = 0; k < h; k++) rect(land, bx + dir * Math.round(k * 0.35 * (i % 2 ? 1 : -1)), H - 4 - k, 2, 1, k > h - 3 ? '#3fae6a' : '#1f6a46'); }
      for (const [fx, fy, col] of [[3, 16, '#c37bf0'], [9, 21, '#ff8fc1'], [14, 13, '#b46be0']] as const) { rect(land, x0 + dir * fx, H - fy, 3, 3, col); rect(land, x0 + dir * fx + 1, H - fy + 1, 1, 1, '#fff3a8'); }
    };
    fern(0, 1); fern(W - 3, -1);

    // ---------- dados animados ----------
    const stars = Array.from({ length: 52 }, () => ({ x: rng.int(0, W), y: rng.int(0, 78), p: rng.next() * 6, big: rng.chance(0.14) }));
    const clouds = [
      { x: 20, y: 34, w: 54, sp: 1.6, tone: 0 }, { x: 150, y: 20, w: 40, sp: 1.1, tone: 0 }, { x: 214, y: 56, w: 70, sp: 1.9, tone: 0 },
      { x: 330, y: 46, w: 44, sp: 1.3, tone: 0 }, { x: 90, y: 66, w: 62, sp: 1.0, tone: 1 }, { x: 250, y: 84, w: 78, sp: 0.8, tone: 1 }, { x: 8, y: 88, w: 66, sp: 0.7, tone: 1 }, { x: 170, y: 92, w: 58, sp: 0.9, tone: 1 },
    ];
    const TONES: Array<[string, string, string]> = [['#f6b6e0', '#d27fcb', '#8b4cb8'], ['#b46ad0', '#8a48b4', '#5e2f98']];
    const flies = Array.from({ length: 12 }, () => ({ x: rng.int(40, 320), y: rng.int(116, 150), p: rng.next() * 7, r: rng.int(4, 10) }));
    const roster = [...CHARACTER_IDS];
    const POS = [46, 70, 94, 244, 268, 292];
    const wins = [[cx - 30, cb - 34], [cx + 24, cb - 34], [cx - 3, cb - 50], [cx - 3, cb - 40], [cx - 14, cb - 22], [cx + 11, cb - 22]] as Array<[number, number]>;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(skyC, 0, 0);
      for (const s of stars) {
        const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 700 + s.p));
        ctx.globalAlpha = a; rect(ctx, s.x, s.y, 1, 1, '#ffffff');
        if (s.big) { ctx.globalAlpha = a * 0.7; rect(ctx, s.x - 2, s.y, 5, 1, '#ffe9fb'); rect(ctx, s.x, s.y - 2, 1, 5, '#ffe9fb'); }
      }
      ctx.globalAlpha = 1;
      for (const c of clouds) { const x = ((c.x + (t / 1000) * c.sp) % (W + c.w * 2)) - c.w; cloud(ctx, x, c.y, c.w, TONES[c.tone]!); }
      ctx.drawImage(landC, 0, 0);
      // janelas e bandeiras do castelo
      wins.forEach(([wx, wy], i) => rect(ctx, wx, wy, 2, 3, Math.sin(t / 1100 + i * 2.1) > -0.7 ? '#ffd34d' : '#a8651a'));
      const fx = cx, fy = cb - 74 + 4;
      rect(ctx, fx, fy, 1, 16, '#120a2e');
      for (let i = 0; i < 9; i++) rect(ctx, fx + 1 + i, fy + Math.round(Math.sin(t / 220 + i * 0.7) * 1.2), 1, 5 - (i > 6 ? 1 : 0), i % 4 < 2 ? '#e05290' : '#f26aa8');
      for (const bx of [cx - 27, cx + 26]) { rect(ctx, bx, cb - 52, 1, 12, '#120a2e'); for (let i = 0; i < 6; i++) rect(ctx, bx + 1 + i, cb - 52 + Math.round(Math.sin(t / 240 + i * 0.8 + bx) * 1), 1, 3, '#a05ae0'); }
      // reflexo da lua no lago
      for (let y = HORIZON + 6; y < GRASS_Y + 8; y += 3) {
        const k = (y - HORIZON - 6) / 30, w = Math.round(5 + k * 20 + Math.sin(t / 500 + y) * 3);
        ctx.globalAlpha = 0.8 - k * 0.35; rect(ctx, MOON.x - w / 2 + Math.sin(t / 800 + y * 0.5) * 3, y, w, 1, y % 6 === 0 ? '#fbd0e6' : '#e9a8d4');
      }
      ctx.globalAlpha = 1;
      // marolas
      for (let y = HORIZON + 10; y < GRASS_Y + 4; y += 6) for (let x = -20; x < W; x += 38) {
        const ox = Math.round(Math.sin(t / 900 + y * 0.7) * 5);
        ctx.globalAlpha = 0.5; rect(ctx, x + ox + (y % 3) * 11, y, 9, 1, '#8ab4ff'); rect(ctx, x + ox + 16 + (y % 3) * 9, y + 2, 5, 1, '#6a98f0');
      }
      ctx.globalAlpha = 1;
      // personagens no gramado
      roster.forEach((id, i) => {
        const cyc = Math.floor(t / 3200) + i * 2, phase = t % 3200;
        let anim: CharAnim = 'idle';
        if (cyc % 6 === 0 && phase < 1400) anim = 'celebrate'; else if (cyc % 6 === 3 && phase < 1100) anim = 'surprised';
        const info = ANIMS[anim];
        const f = Math.floor((t / 1000) * info.fps + i) % info.frames;
        const x = POS[i] ?? 40;
        ctx.globalAlpha = 0.35; rect(ctx, x + 2, GRASS_Y + 8, 12, 2, '#1b1030'); ctx.globalAlpha = 1;
        ctx.drawImage(characterFrame(id, anim, f), x, GRASS_Y - 14);
      });
      // vaga-lumes
      for (const f of flies) {
        const fx2 = f.x + Math.sin(t / 1300 + f.p) * f.r, fy2 = f.y + Math.cos(t / 1700 + f.p) * (f.r / 2);
        ctx.globalAlpha = 0.35 + 0.6 * Math.abs(Math.sin(t / 500 + f.p)); rect(ctx, fx2, fy2, 2, 2, '#ffe08a');
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
