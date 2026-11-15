import { darken, lighten, mix } from './scenery';

/**
 * PROTÓTIPO (estilo "chibi detalhado", ~24x34): personagem montado por código em camadas
 * (pernas, tênis, corpo, cabeça, cabelo em mechas, rosto), seguido de contorno colorido.
 */
export const PW = 24;
export const PH = 34;
type Px = string | null;
type Grid = Px[][];
const newGrid = (): Grid => Array.from({ length: PH }, () => Array<Px>(PW).fill(null));

const ink = '#1b1030';
const set = (g: Grid, x: number, y: number, c: Px) => { if (x >= 0 && x < PW && y >= 0 && y < PH) g[y]![x] = c; };
const rect = (g: Grid, x0: number, y0: number, w: number, h: number, c: Px) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(g, x, y, c); };

interface Ramp { hi: string; mid: string; lo: string; dk: string }
const ramp = (mid: string): Ramp => ({ hi: lighten(mid, 0.28), mid, lo: darken(mid, 0.22), dk: darken(mid, 0.42) });

export interface ProcLook {
  skin: string; hair: string; shirt: string; pants: string; shoe: string; accent: string;
}
export const TECO: ProcLook = { skin: '#f4c9a0', hair: '#a8582a', shirt: '#2f6fe0', pants: '#26346e', shoe: '#f0eef8', accent: '#ffffff' };

/** Preenche uma região com sombreado "luz no canto superior esquerdo" a partir de uma rampa. */
function shadeRegion(g: Grid, mask: (x: number, y: number) => boolean, r: Ramp, bounds: [number, number, number, number]) {
  const [x0, y0, x1, y1] = bounds;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!mask(x, y)) continue;
    const up = !mask(x, y - 1), left = !mask(x - 1, y), down = !mask(x, y + 1), right = !mask(x + 1, y);
    let c = r.mid;
    if (up && left) c = r.hi; else if (up || left) c = mix(r.mid, r.hi, 0.6);
    else if (down && right) c = r.dk; else if (down || right) c = r.lo;
    set(g, x, y, c);
  }
}

export function drawProc(look: ProcLook): Grid {
  const g = newGrid();
  const skin = ramp(look.skin), hair = ramp(look.hair), shirt = ramp(look.shirt), pants = ramp(look.pants), shoe = ramp(look.shoe);

  // ---- pernas e tênis
  for (const lx of [7, 12]) {
    shadeRegion(g, (x, y) => x >= lx && x < lx + 5 && y >= 24 && y <= 29, pants, [lx - 1, 23, lx + 5, 30]);
    // tênis: sola clara, cano e detalhe
    shadeRegion(g, (x, y) => x >= lx - (lx === 7 ? 1 : 0) && x < lx + 5 + (lx === 12 ? 1 : 0) && y >= 29 && y <= 32, shoe, [lx - 2, 28, lx + 7, 33]);
    rect(g, lx - (lx === 7 ? 1 : 0), 32, 6, 1, '#5a5a7a'); // sola
    set(g, lx + 2, 30, '#4a86ff'); set(g, lx + 3, 30, '#4a86ff'); // detalhe azul
  }
  // ---- corpo (moletom)
  shadeRegion(g, (x, y) => x >= 6 && x <= 17 && y >= 15 && y <= 24 && !((y === 15) && (x < 8 || x > 15)), shirt, [5, 14, 18, 25]);
  // braços (mangas) e mãos
  for (const side of [0, 1]) {
    const ax = side === 0 ? 3 : 18;
    shadeRegion(g, (x, y) => x >= ax && x <= ax + 2 && y >= 16 && y <= 23, shirt, [ax - 1, 15, ax + 3, 24]);
    rect(g, ax, 23, 3, 1, lighten(look.shirt, 0.35)); // punho
    shadeRegion(g, (x, y) => x >= ax && x <= ax + 2 && y >= 24 && y <= 26, skin, [ax - 1, 23, ax + 3, 27]);
  }
  // gola/capuz, cordões e bolso
  rect(g, 8, 15, 8, 1, lighten(look.shirt, 0.4)); rect(g, 9, 16, 6, 1, lighten(look.shirt, 0.25));
  for (const cx of [10, 13]) { rect(g, cx, 17, 1, 4, look.accent); set(g, cx, 21, mix(look.accent, '#8a8aa8', 0.4)); }
  rect(g, 8, 22, 8, 1, shirt.dk); rect(g, 8, 23, 8, 1, shirt.lo);
  // ---- cabeça
  const cx = 12, cy = 10.5, rx = 9, ry = 7;
  const inHead = (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  shadeRegion(g, inHead, skin, [2, 3, 21, 18]);
  // orelhas
  for (const ex of [3, 20]) { rect(g, ex, 10, 1, 3, skin.mid); set(g, ex, 11, skin.lo); }
  // ---- cabelo em mechas: máscara = topo da cabeça + franja irregular + costeletas + espetos
  const FR = [9, 8, 8, 7, 8, 9, 8, 7, 8, 9, 8, 7, 7, 8, 9, 8, 7, 8]; // franja em pontas (x = 3..20)
  const fringe = (x: number) => FR[Math.max(0, Math.min(17, x - 3))]!;
  const inHair = (x: number, y: number) => {
    const ell = ((x + 0.5 - cx) / (rx + 0.9)) ** 2 + ((y + 0.5 - (cy - 0.4)) / (ry + 1.2)) ** 2 <= 1;
    if (ell && y <= fringe(x)) return true;
    if (ell && (x <= 4 || x >= 19) && y <= 12) return true; // costeletas
    // espetos
    for (const [sx, sh] of [[7, 3], [11, 4], [15, 3], [18, 2]] as const) {
      const top = 4 - sh;
      if (y >= top && y <= 4 && Math.abs(x - sx) <= Math.floor((y - top) / 1.6)) return true;
    }
    return false;
  };
  for (let y = 0; y < 14; y++) for (let x = 2; x < 22; x++) {
    if (!inHair(x, y)) continue;
    const t = (x * 2 + y * 3) % 9;
    const edgeUL = !inHair(x - 1, y) || !inHair(x, y - 1);
    let c = t < 2 ? hair.lo : t < 6 ? hair.mid : hair.hi;
    if (edgeUL && t > 3) c = hair.hi;
    if (!inHair(x, y + 1) || !inHair(x + 1, y)) c = t < 5 ? hair.dk : hair.lo;
    set(g, x, y, c);
  }
  // ---- rosto: olhos grandes, sobrancelhas, nariz, boca, bochechas
  for (const ex of [8, 14]) {
    rect(g, ex, 10, 2, 4, ink);
    set(g, ex, 10, '#ffffff'); set(g, ex, 11, mix('#ffffff', ink, 0.55)); // brilho
    set(g, ex + 1, 13, mix(ink, '#4a3a7a', 0.6));
  }
  set(g, 12, 13, skin.lo); set(g, 11, 14, skin.lo);
  rect(g, 11, 15, 2, 1, '#9a4040');
  rect(g, 6, 14, 2, 1, '#f09a9a'); rect(g, 16, 14, 2, 1, '#f09a9a');

  // ---- contorno colorido (puxado para a cor vizinha)
  const out = g.map((r) => [...r]);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    if (g[y]![x]) continue;
    let near: string | null = null;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) { const n = g[y + dy]?.[x + dx]; if (n) { near = n; break; } }
    if (near) out[y]![x] = mix(darken(near, 0.7), ink, 0.5);
  }
  return out;
}

export function gridToCanvas(grid: Grid, scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PW * scale; c.height = PH * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  grid.forEach((row, y) => row.forEach((p, x) => { if (p) { ctx.fillStyle = p; ctx.fillRect(x * scale, y * scale, scale, scale); } }));
  return c;
}
