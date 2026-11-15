import { createRng } from '@shared/rng';

/**
 * Ferramentas de cenário em pixel art: céu com degradê "dithered", sol, estrelas, nuvens,
 * montanhas com luz de contorno, floresta de pinheiros em camadas, plataformas de grama sobre pedra.
 * Tudo desenhado por código (sem arquivos de terceiros).
 */
type Ctx = CanvasRenderingContext2D;

export interface SceneTheme {
  sky: string[];
  star: boolean;
  sun?: { x: number; y: number; r: number; core: string; glow: string };
  cloud: { hi: string; mid: string; lo: string };
  mountains: Array<{ body: string; rim: string; base: number; amp: number; freq: number; seed: number }>;
  forests: Array<{ col: string; rim?: string; base: number; hmin: number; hmax: number; step: number }>;
  haze?: string;
}

export const SUNSET: SceneTheme = {
  sky: ['#25166a', '#321a82', '#4b2290', '#6a2a9a', '#8c3398', '#b03c94', '#d44c8a', '#ee6682', '#ff8670', '#ffa662', '#ffc374', '#ffd98c'],
  star: true,
  sun: { x: 0.78, y: 0.62, r: 18, core: '#fff2b0', glow: '#ffd070' },
  cloud: { hi: '#f4a6d0', mid: '#c86aa8', lo: '#7e3c94' },
  mountains: [
    { body: '#7a3b9c', rim: '#c070b8', base: 0.54, amp: 0.10, freq: 1.4, seed: 3 },
    { body: '#4f2a86', rim: '#8a4cae', base: 0.66, amp: 0.09, freq: 2.0, seed: 8 },
  ],
  forests: [
    { col: '#38267a', rim: '#6a4aa8', base: 0.84, hmin: 0.09, hmax: 0.18, step: 9 },
    { col: '#231552', rim: '#4a3a88', base: 0.94, hmin: 0.12, hmax: 0.22, step: 13 },
  ],
  haze: 'rgba(255,150,120,0.10)',
};

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a), [r2, g2, b2] = hex(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}
export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
export const darken = (c: string, t: number) => mix(c, '#0d0828', t);

const BAYER = [[0, 2], [3, 1]];
/** Degradê vertical em faixas com transição pontilhada (estilo pixel art). */
export function drawSkyBands(ctx: Ctx, w: number, h: number, bands: string[]) {
  const bh = h / bands.length;
  bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, Math.floor(i * bh), w, Math.ceil(bh) + 1); });
  const rows = Math.max(2, Math.min(4, Math.floor(bh / 2)));
  for (let i = 1; i < bands.length; i++) {
    const y0 = Math.round(i * bh) - Math.floor(rows / 2);
    for (let k = 0; k < rows; k++) {
      const t = (k + 1) / (rows + 1);
      ctx.fillStyle = bands[i]!;
      for (let x = 0; x < w; x++) if (BAYER[(y0 + k) & 1]![x & 1]! < t * 4) ctx.fillRect(x, y0 + k, 1, 1);
    }
  }
}

export function drawStars(ctx: Ctx, w: number, maxY: number, n: number, seed: number) {
  const rng = createRng(seed);
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, w - 1), y = rng.int(0, maxY);
    ctx.fillStyle = rng.chance(0.6) ? 'rgba(255,255,255,0.9)' : 'rgba(207,210,255,0.7)';
    ctx.fillRect(x, y, 1, 1);
    if (rng.chance(0.12)) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
}

export function drawSun(ctx: Ctx, cx: number, cy: number, r: number, core: string, glow: string) {
  for (let k = 5; k >= 1; k--) {
    ctx.fillStyle = glow; ctx.globalAlpha = 0.07 * (6 - k);
    ctx.beginPath(); ctx.arc(cx, cy, r + k * 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, r - 3), 0, Math.PI * 2); ctx.fill();
}

/** Nuvem em blocos: topo claro, corpo, base na sombra. */
export function drawCloud(ctx: Ctx, x: number, y: number, w: number, col: { hi: string; mid: string; lo: string }) {
  const tier = (dx: number, dy: number, ww: number, hh: number) => {
    ctx.fillStyle = col.mid; ctx.fillRect(x + dx, y + dy, ww, hh);
    ctx.fillStyle = col.hi; ctx.fillRect(x + dx + 1, y + dy, ww - 2, 1);
    ctx.fillStyle = col.lo; ctx.fillRect(x + dx, y + dy + hh - 1, ww, 1);
  };
  tier(Math.round(w * 0.18), 0, Math.round(w * 0.5), 3);
  tier(0, 3, w, 3);
  tier(Math.round(w * 0.1), 6, Math.round(w * 0.8), 2);
}

/** Cordilheira com luz de contorno e pontinhos de textura. */
export function drawMountains(ctx: Ctx, w: number, h: number, m: SceneTheme['mountains'][number], periodic = false) {
  const rng = createRng(m.seed);
  const p1 = rng.next() * 6, p2 = rng.next() * 6;
  const heights: number[] = [];
  for (let x = 0; x < w; x++) {
    const u = (x / w) * Math.PI * 2;
    const f = periodic ? Math.round(m.freq) : m.freq;
    const v = Math.sin(u * f + p1) * 0.6 + Math.sin(u * f * 2.3 + p2) * 0.3 + Math.sin(u * f * 5.1) * 0.1;
    heights.push(Math.round(h * m.base - v * h * m.amp));
  }
  for (let x = 0; x < w; x++) {
    const top = heights[x]!;
    ctx.fillStyle = m.body; ctx.fillRect(x, top, 1, h - top);
    ctx.fillStyle = m.rim; ctx.fillRect(x, top, 1, 1);
    const left = heights[(x - 1 + w) % w]!;
    if (top < left) { ctx.fillRect(x, top, 1, Math.min(3, left - top + 1)); } // encosta voltada para a luz
    if ((x * 7 + top) % 11 === 0) { ctx.fillStyle = darken(m.body, 0.25); ctx.fillRect(x, top + 3 + (x % 4), 1, 2); }
  }
}

/** Pinheiros em silhueta, camada única (bordas voltadas para a luz um pouco mais claras). */
export function drawPines(ctx: Ctx, w: number, h: number, f: SceneTheme['forests'][number], seed: number, periodic = false) {
  const rng = createRng(seed);
  const base = Math.round(h * f.base);
  ctx.fillStyle = f.col; ctx.fillRect(0, base - 2, w, h - base + 2);
  const draw = (x: number, th: number) => {
    const tiers = Math.max(3, Math.round(th / 7));
    const tierH = th / tiers;
    for (let t = 0; t < tiers; t++) {
      const y0 = Math.round(base - th + t * tierH);
      const ww = Math.round(3 + (t + 1) * (th / tiers) * 0.55);
      const hh = Math.ceil(tierH) + 1;
      for (let r = 0; r < hh; r++) {
        const half = Math.round((ww / 2) * ((r + 1) / hh));
        ctx.fillStyle = f.col; ctx.fillRect(x - half, y0 + r, half * 2 + 1, 1);
        if (f.rim) { ctx.fillStyle = f.rim; ctx.fillRect(x - half, y0 + r, 1, 1); }
      }
    }
    ctx.fillStyle = f.col; ctx.fillRect(x - 1, base - 3, 3, 5);
  };
  const lo = f.hmin * h, hi = f.hmax * h;
  for (let x = -6; x < w + 6; x += f.step + rng.int(-2, 3)) {
    const th = Math.round(lo + rng.next() * (hi - lo));
    draw(x, th);
    if (periodic) { if (x < 12) draw(x + w, th); if (x > w - 12) draw(x - w, th); }
  }
}

export function drawScenery(ctx: Ctx, w: number, h: number, th: SceneTheme, seed = 1) {
  drawSkyBands(ctx, w, h, th.sky);
  if (th.star) drawStars(ctx, w, Math.floor(h * 0.45), Math.round(w / 9), seed + 1);
  if (th.sun) drawSun(ctx, Math.round(w * th.sun.x), Math.round(h * th.sun.y), th.sun.r, th.sun.core, th.sun.glow);
  const rng = createRng(seed + 5);
  for (let i = 0; i < Math.max(3, Math.round(w / 110)); i++) drawCloud(ctx, rng.int(0, w - 40), rng.int(Math.floor(h * 0.08), Math.floor(h * 0.4)), rng.int(26, 52), th.cloud);
  th.mountains.forEach((m) => drawMountains(ctx, w, h, m));
  if (th.haze) { ctx.fillStyle = th.haze; ctx.fillRect(0, Math.floor(h * 0.55), w, Math.floor(h * 0.3)); }
  th.forests.forEach((f, i) => drawPines(ctx, w, h, f, seed + 20 + i));
}

// ---------------------------------------------------------------- plataformas e chão

export const STONE = { body: '#3b3f9c', hi: '#6a72d8', mid: '#4c52b8', lo: '#262a74', line: '#1b1d58' };
export const GRASS = { hi: '#a6f06a', mid: '#6cd04a', lo: '#3f9a3a', dark: '#2a6e32' };

/** Linhas de grama (topo) com tufinhos irregulares, tileável na horizontal. */
function grassTop(ctx: Ctx, w: number, y: number, seed: number) {
  const rng = createRng(seed);
  ctx.fillStyle = GRASS.mid; ctx.fillRect(0, y + 1, w, 2);
  ctx.fillStyle = GRASS.hi; ctx.fillRect(0, y + 1, w, 1);
  ctx.fillStyle = GRASS.lo; ctx.fillRect(0, y + 3, w, 1);
  for (let x = 0; x < w; x++) {
    if (rng.chance(0.35)) { ctx.fillStyle = GRASS.hi; ctx.fillRect(x, y, 1, 1); }
    if (rng.chance(0.25)) { ctx.fillStyle = GRASS.lo; ctx.fillRect(x, y + 3 + (x & 1), 1, 1 + (x % 3 === 0 ? 1 : 0)); }
  }
}

/** Pedras (paralelepípedos) com luz no canto superior esquerdo. Tileável. */
function cobbles(ctx: Ctx, w: number, y0: number, y1: number, seed: number) {
  const rng = createRng(seed);
  ctx.fillStyle = STONE.body; ctx.fillRect(0, y0, w, y1 - y0);
  let row = 0;
  for (let y = y0; y < y1; y += 5, row++) {
    const off = row % 2 ? 4 : 0;
    ctx.fillStyle = STONE.line; ctx.fillRect(0, y + 4, w, 1);
    for (let x = -8 + off; x < w; x += 8) {
      ctx.fillStyle = STONE.line; ctx.fillRect(x + 7, y, 1, 5);
      ctx.fillStyle = rng.chance(0.5) ? STONE.mid : STONE.body; ctx.fillRect(x + 1, y + 1, 6, 3);
      ctx.fillStyle = STONE.hi; ctx.fillRect(x + 1, y, 5, 1); ctx.fillRect(x + 1, y + 1, 1, 2);
      ctx.fillStyle = STONE.lo; ctx.fillRect(x + 2, y + 3, 5, 1);
    }
  }
  ctx.clearRect(0, y1, w, 100);
}

/**
 * Plataforma flutuante: grama no topo, pedra e base irregular (pingentes de rocha).
 * Textura tileável de 16 x `h`.
 */
export function drawPlatformTile(ctx: Ctx, w: number, h: number) {
  cobbles(ctx, w, 4, h, 77);
  grassTop(ctx, w, 0, 31);
  // base irregular
  const depth = [0, 1, 1, 2, 3, 2, 1, 0, 1, 2, 2, 3, 2, 1, 0, 1];
  for (let x = 0; x < w; x++) {
    const d = depth[x % depth.length]!;
    ctx.clearRect(x, h - d, 1, d);
    if (d < 3) { ctx.fillStyle = STONE.lo; ctx.fillRect(x, h - d - 1, 1, 1); }
  }
  // musgo pingando da grama
  ctx.fillStyle = GRASS.dark;
  for (const x of [2, 7, 12]) ctx.fillRect(x, 4, 1, 2);
}

/** Chão: grama, terra/pedra com degradê escuro até o fundo. Textura tileável de 16 x `h`. */
export function drawGroundTile(ctx: Ctx, w: number, h: number) {
  cobbles(ctx, w, 4, h, 91);
  grassTop(ctx, w, 0, 17);
  // escurece para o fundo
  for (let y = 12; y < h; y++) { ctx.fillStyle = `rgba(13,8,40,${Math.min(0.75, (y - 12) / (h - 12) * 0.8)})`; ctx.fillRect(0, y, w, 1); }
}

/** Caixa de madeira com tábuas, pregos e luz. */
export function drawCrate(ctx: Ctx) {
  const W = 12, H = 13;
  ctx.fillStyle = '#1b1030'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e0a640'; ctx.fillRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = '#f6cf6a'; ctx.fillRect(1, 1, W - 2, 1); ctx.fillRect(1, 1, 1, H - 2);
  ctx.fillStyle = '#a8651a'; ctx.fillRect(1, H - 2, W - 2, 1); ctx.fillRect(W - 2, 1, 1, H - 2);
  ctx.fillStyle = '#7a4414';
  for (let i = 0; i < 9; i++) { ctx.fillRect(2 + i, 2 + i, 1, 1); ctx.fillRect(9 - i, 2 + i, 1, 1); }
  ctx.fillStyle = '#fff1b0'; for (const [x, y] of [[2, 2], [9, 2], [2, 10], [9, 10]] as const) ctx.fillRect(x, y, 1, 1);
}

/** Água do poço: espuma, ondas e fundo escuro. */
export function drawWaterTile(ctx: Ctx, w: number, h: number) {
  ctx.fillStyle = '#1d3f94'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2f6fd0'; ctx.fillRect(0, 1, w, 3);
  ctx.fillStyle = '#5e96f0'; ctx.fillRect(0, 1, w, 1);
  ctx.fillStyle = '#9ad0ff'; for (let x = 0; x < w; x += 8) { ctx.fillRect(x, 0, 3, 1); ctx.fillRect(x + 4, 1, 2, 1); }
  ctx.fillStyle = '#16307a'; for (let y = 5; y < h; y += 3) ctx.fillRect((y * 5) % w, y, 4, 1);
  for (let y = 6; y < h; y++) { ctx.fillStyle = `rgba(13,8,40,${(y - 5) / h * 0.5})`; ctx.fillRect(0, y, w, 1); }
}
