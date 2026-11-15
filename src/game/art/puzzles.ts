import { createRng } from '@shared/rng';

/** 6 imagens 24x24 em pixel art, desenhadas por código (cada recorte de 6x6 é bem distinto dos outros). */
export const PUZZLE_NAMES = ['Castelo ao entardecer', 'Ilha tropical', 'Foguete no espaço', 'Robô amigo', 'Vulcão', 'Aquário'];
type Ctx = CanvasRenderingContext2D;
const R = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const px = (c: Ctx, x: number, y: number, col: string) => R(c, x, y, 1, 1, col);
const disc = (c: Ctx, cx: number, cy: number, r: number, col: string) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(c, cx + x, cy + y, col); };
const ell = (c: Ctx, cx: number, cy: number, rx: number, ry: number, col: string) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) px(c, cx + x, cy + y, col); };
const tri = (c: Ctx, cx: number, top: number, h: number, col: string) => { for (let i = 0; i < h; i++) R(c, cx - i, top + i, i * 2 + 1, 1, col); };
const bands = (c: Ctx, y0: number, y1: number, cols: string[]) => { const h = (y1 - y0) / cols.length; cols.forEach((col, i) => R(c, 0, Math.round(y0 + i * h), 24, Math.ceil(h) + 1, col)); };
const sparkle = (c: Ctx, seed: number, n: number, cols: string[], y0 = 0, y1 = 24) => { const r = createRng(seed); for (let i = 0; i < n; i++) px(c, r.int(0, 23), r.int(y0, y1 - 1), cols[r.int(0, cols.length - 1)]!); };

const PICTURES: Array<(c: Ctx) => void> = [
  // 0 — castelo ao entardecer
  (c) => {
    bands(c, 0, 17, ['#3b2a8c', '#5a3ab0', '#7a45b5', '#a85fb0', '#d9669a', '#f08a7a', '#ffab7a', '#ffc98a']);
    sparkle(c, 3, 8, ['#ffffff', '#ffe9f4'], 0, 7);
    disc(c, 19, 11, 3, '#fff3a8');
    for (let x = 0; x < 24; x++) R(c, x, 14 + Math.round(Math.sin(x / 3) * 1.5), 1, 5, '#4a2a7c');
    R(c, 7, 9, 10, 10, '#8a85a8'); R(c, 6, 5, 3, 14, '#9a95b8'); R(c, 15, 5, 3, 14, '#9a95b8');
    tri(c, 7, 1, 4, '#6a3fb5'); tri(c, 16, 1, 4, '#6a3fb5'); R(c, 7, 0, 1, 2, '#1b1030'); R(c, 8, 0, 2, 1, '#e05252');
    for (let x = 9; x < 15; x += 2) R(c, x, 8, 1, 2, '#8a85a8');
    R(c, 10, 14, 4, 5, '#2a1a40'); R(c, 11, 13, 2, 1, '#2a1a40'); R(c, 7, 11, 2, 2, '#ffd34d'); R(c, 15, 11, 2, 2, '#ffd34d'); R(c, 11, 10, 2, 2, '#ffd34d');
    R(c, 0, 19, 24, 5, '#3fa04a'); R(c, 0, 19, 24, 1, '#6bc660'); R(c, 11, 19, 2, 5, '#d9c08a');
    sparkle(c, 8, 7, ['#ff8fc1', '#fff3a8', '#2f7d3a'], 20, 24);
  },
  // 1 — ilha tropical
  (c) => {
    bands(c, 0, 14, ['#58b8ff', '#78c8ff', '#98d8ff', '#b8e6ff', '#d0f0ff']);
    disc(c, 4, 4, 2, '#fff3a8'); R(c, 12, 2, 5, 2, '#ffffff'); R(c, 13, 1, 3, 1, '#ffffff'); R(c, 18, 6, 4, 2, '#ffffff');
    R(c, 0, 14, 24, 10, '#1d6fd0'); bands(c, 14, 24, ['#2a7fe0', '#1d6fd0', '#1a5fb8', '#164f9a']);
    for (let y = 15; y < 24; y += 2) for (let x = (y % 4); x < 24; x += 6) R(c, x, y, 3, 1, '#9ad0ff');
    ell(c, 11, 15, 8, 3, '#f0d890'); ell(c, 11, 16, 7, 2, '#d9b86a');
    for (const [tx, lean] of [[8, -1], [14, 1]] as const) { for (let i = 0; i < 7; i++) px(c, tx + Math.round(lean * i * 0.25), 14 - i, '#7a4a22'); const top = 7; R(c, tx - 3, top, 7, 1, '#2faa4a'); R(c, tx - 2, top - 1, 5, 1, '#3fca5a'); px(c, tx - 4, top + 1, '#2faa4a'); px(c, tx + 4, top + 1, '#2faa4a'); }
    R(c, 19, 17, 1, 1, '#ffffff'); tri(c, 20, 12, 5, '#ffffff'); R(c, 20, 12, 1, 7, '#7a4a22'); R(c, 17, 19, 7, 2, '#a84f2a');
    px(c, 15, 5, '#1b1030'); px(c, 16, 6, '#1b1030'); px(c, 17, 5, '#1b1030');
  },
  // 2 — foguete no espaço
  (c) => {
    R(c, 0, 0, 24, 24, '#0b0630'); sparkle(c, 21, 36, ['#ffffff', '#cfd2ff', '#ffe08a', '#8a8aff']);
    disc(c, 5, 6, 4, '#e0709a'); disc(c, 4, 5, 2, '#f09ab8'); for (let x = 0; x < 12; x++) px(c, x, 8 - Math.round(x * 0.2) + 1, '#ffd34d');
    disc(c, 19, 5, 3, '#cfd2e8'); px(c, 18, 4, '#8a8aa8'); px(c, 20, 6, '#8a8aa8'); px(c, 19, 7, '#8a8aa8');
    R(c, 10, 7, 5, 11, '#f4efe0'); tri(c, 12, 2, 6, '#e05252'); R(c, 10, 7, 5, 1, '#c8c6d8'); disc(c, 12, 11, 1, '#3d8bff'); R(c, 11, 14, 3, 1, '#e05252');
    tri(c, 8, 15, 3, '#e05252'); tri(c, 16, 15, 3, '#e05252'); R(c, 8, 17, 2, 1, '#e05252'); R(c, 15, 17, 2, 1, '#e05252');
    R(c, 11, 18, 3, 2, '#ffb02e'); R(c, 11, 20, 3, 2, '#ff7a2a'); R(c, 12, 22, 1, 2, '#ffd34d');
    sparkle(c, 5, 6, ['#ff7a2a', '#ffd34d'], 19, 24);
  },
  // 3 — robô amigo
  (c) => {
    R(c, 0, 0, 24, 24, '#3a3858');
    for (let i = 0; i < 24; i += 4) { R(c, i, 0, 1, 24, '#2f2d4c'); R(c, 0, i, 24, 1, '#2f2d4c'); }
    sparkle(c, 12, 12, ['#4a4878', '#2a2848']);
    R(c, 11, 1, 2, 3, '#aebfd6'); disc(c, 12, 1, 1, '#ff5d5d');
    R(c, 6, 4, 12, 8, '#aebfd6'); R(c, 6, 4, 12, 1, '#d8e4f0'); R(c, 6, 11, 12, 1, '#7a8aa6');
    R(c, 8, 6, 3, 3, '#1b1030'); R(c, 13, 6, 3, 3, '#1b1030'); R(c, 9, 7, 1, 1, '#7ff3ff'); R(c, 14, 7, 1, 1, '#7ff3ff'); R(c, 9, 10, 6, 1, '#1b1030'); px(c, 10, 10, '#ffffff'); px(c, 12, 10, '#ffffff'); px(c, 14, 10, '#ffffff');
    R(c, 7, 13, 10, 7, '#5a7aa8'); R(c, 7, 13, 10, 1, '#7a9ac8'); R(c, 10, 15, 4, 3, '#ffd34d'); px(c, 11, 16, '#ff5d5d'); px(c, 12, 16, '#4fd36b');
    R(c, 3, 13, 3, 6, '#aebfd6'); R(c, 18, 13, 3, 6, '#aebfd6'); R(c, 3, 19, 3, 2, '#7a8aa6'); R(c, 18, 19, 3, 2, '#7a8aa6');
    R(c, 8, 20, 3, 4, '#7a8aa6'); R(c, 13, 20, 3, 4, '#7a8aa6'); R(c, 7, 23, 5, 1, '#aebfd6'); R(c, 12, 23, 5, 1, '#aebfd6');
    disc(c, 3, 3, 2, '#7a8aa6'); px(c, 3, 3, '#3a3858'); disc(c, 21, 21, 2, '#7a8aa6'); px(c, 21, 21, '#3a3858');
  },
  // 4 — vulcão
  (c) => {
    bands(c, 0, 16, ['#120a30', '#1a1240', '#241a58', '#3a2a70']);
    sparkle(c, 33, 14, ['#ffffff', '#cfd2ff'], 0, 10); disc(c, 4, 4, 2, '#e8e8f8');
    R(c, 0, 20, 24, 4, '#2a1a1a'); sparkle(c, 4, 8, ['#4a2a2a', '#1a0a0a'], 20, 24);
    for (let i = 0; i < 12; i++) R(c, 12 - 2 - i, 9 + i, 4 + i * 2, 1, i % 3 === 0 ? '#6a4a3a' : '#5a3a2a');
    R(c, 8, 9, 8, 2, '#ff7a2a'); R(c, 9, 8, 6, 1, '#ffd34d'); R(c, 11, 11, 2, 9, '#ff4d2a'); R(c, 10, 13, 1, 6, '#ff7a2a'); R(c, 13, 14, 1, 5, '#ff7a2a'); R(c, 8, 15, 1, 4, '#ff4d2a');
    disc(c, 12, 5, 2, '#8a8aa0'); disc(c, 15, 3, 2, '#6a6a80'); disc(c, 10, 2, 1, '#5a5a70'); px(c, 17, 7, '#ff7a2a'); px(c, 6, 6, '#ff7a2a'); px(c, 18, 5, '#ffd34d');
  },
  // 5 — aquário
  (c) => {
    bands(c, 0, 21, ['#3aa0e8', '#2a8fd6', '#2180c8', '#1a6fb8', '#1560a8', '#0f4f98']);
    for (const [bx, by] of [[3, 14], [20, 6], [17, 10], [5, 4]] as const) { disc(c, bx, by, 1, '#bfe8ff'); px(c, bx, by, '#ffffff'); }
    R(c, 0, 21, 24, 3, '#e6c98a'); sparkle(c, 9, 7, ['#b89a5a', '#fff3c4'], 21, 24);
    for (const wx of [2, 4, 21]) for (let i = 0; i < 8; i++) px(c, wx + (i % 2), 20 - i, i % 3 === 0 ? '#2faa4a' : '#3fca5a');
    ell(c, 10, 10, 4, 3, '#ff8a2a'); tri(c, 15, 7, 4, '#ff8a2a'); R(c, 14, 9, 4, 3, '#ff8a2a'); R(c, 8, 8, 6, 1, '#ffb05a'); disc(c, 7, 10, 1, '#ffffff'); px(c, 7, 10, '#1b1030'); R(c, 11, 8, 1, 5, '#ffffff');
    ell(c, 18, 16, 2, 1, '#4da3ff'); tri(c, 21, 15, 2, '#4da3ff'); px(c, 17, 16, '#1b1030');
    R(c, 14, 18, 7, 4, '#7a4a22'); R(c, 14, 17, 7, 1, '#a86a32'); R(c, 16, 19, 3, 2, '#ffd34d'); R(c, 14, 18, 7, 1, '#ffd34d');
  },
];

export function drawPuzzle(picture: number, ctx: Ctx) {
  ctx.imageSmoothingEnabled = false;
  PICTURES[picture % PICTURES.length]!(ctx);
  // um leve granulado deixa cada peça única, sem esconder o desenho
  const r = createRng(1000 + picture);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.10)'; ctx.fillRect(r.int(0, 23), r.int(0, 23), 1, 1); }
}
