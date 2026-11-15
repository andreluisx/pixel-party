import type Phaser from 'phaser';
import { createRng } from '@shared/rng';
import type { BoardDef, TileType } from '@shared/board/types';
import { REINO_DO_CASTELO } from '@shared/board/maps/reino-do-castelo';
import { canvasTex } from './textures';

/** Cor de cada tipo de casa + forma própria (nunca só cor: acessível a daltônicos). */
export const TILE_STYLE: Record<TileType, { fill: string; edge: string; label: string }> = {
  blue: { fill: '#3f7fe0', edge: '#1d3f8a', label: 'Casa azul' },
  red: { fill: '#e05252', edge: '#8a1d2a', label: 'Casa vermelha' },
  event: { fill: '#3fbf6a', edge: '#1d6a3a', label: 'Evento' },
  minigame: { fill: '#9a6fe0', edge: '#4a2a8a', label: 'Minigame' },
  shop: { fill: '#f08a3c', edge: '#8a4510', label: 'Loja' },
  star: { fill: '#ffcf4a', edge: '#a8651a', label: 'Altar da estrela' },
  duel: { fill: '#c0304a', edge: '#5a0f22', label: 'Duelo' },
  teleport: { fill: '#3fd0e0', edge: '#1d6f8a', label: 'Teleporte' },
  treasure: { fill: '#c89a4a', edge: '#6a4a1a', label: 'Tesouro' },
  trap: { fill: '#6a6a7a', edge: '#2a2a3a', label: 'Armadilha' },
};

const S = 22; // tamanho da textura de cada casa

function glyph(ctx: CanvasRenderingContext2D, rows: string[], ox: number, oy: number, color = '#ffffff') {
  ctx.fillStyle = color;
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') ctx.fillRect(ox + x, oy + y, 1, 1); });
}
const GL: Record<TileType, string[]> = {
  blue: ['...#...', '...#...', '...#...', '#######', '...#...', '...#...', '...#...'],
  red: ['.......', '.......', '.......', '#######', '.......', '.......', '.......'],
  event: ['.#####.', '#.....#', '......#', '...###.', '...#...', '.......', '...#...'],
  minigame: ['.#.....', '.###...', '.#####.', '.#####.', '.###...', '.#.....', '.......'],
  shop: ['..###..', '.#.#...', '.###...', '..###..', '...#.#.', '.###...', '...#...'],
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  duel: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  teleport: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#.....#', '.#...#.', '..###..'],
  treasure: ['.#####.', '#######', '#.....#', '###.###', '#..#..#', '#.....#', '#######'],
  trap: ['...#...', '...#...', '..###..', '..###..', '.#####.', '.......', '...#...'],
};

function shape(ctx: CanvasRenderingContext2D, type: TileType, fill: string, edge: string, inset = 0) {
  const c = S / 2;
  const fillShape = (r: number, col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    switch (type) {
      case 'event': ctx.moveTo(c, c - r); ctx.lineTo(c + r, c); ctx.lineTo(c, c + r); ctx.lineTo(c - r, c); break; // losango
      case 'minigame': case 'treasure': ctx.rect(c - r + 1, c - r + 1, 2 * r - 2, 2 * r - 2); break; // quadrado
      case 'duel': ctx.moveTo(c, c - r); ctx.lineTo(c + r, c); ctx.lineTo(c, c + r); ctx.lineTo(c - r, c); ctx.closePath(); ctx.rect(c - r + 3, c - r + 3, 2 * r - 6, 2 * r - 6); break;
      case 'trap': ctx.moveTo(c, c - r); ctx.lineTo(c + r, c + r - 1); ctx.lineTo(c - r, c + r - 1); break; // triângulo
      case 'shop': for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } break; // hexágono
      default: ctx.arc(c, c, r, 0, Math.PI * 2); // círculos: azul, vermelha, estrela, teleporte
    }
    ctx.closePath(); ctx.fill();
  };
  fillShape(c - 1 - inset, edge);
  fillShape(c - 3 - inset, fill);
}

export function buildBoardTextures(scene: Phaser.Scene, def: BoardDef = REINO_DO_CASTELO) {
  for (const type of Object.keys(TILE_STYLE) as TileType[]) {
    const st = TILE_STYLE[type];
    canvasTex(scene, `tile-${type}`, S, S + 3, (ctx) => {
      ctx.fillStyle = 'rgba(20,10,40,0.35)'; ctx.beginPath(); ctx.ellipse(S / 2, S + 0.5, S / 2 - 2, 2, 0, 0, Math.PI * 2); ctx.fill(); // sombra
      ctx.save(); ctx.translate(0, 1);
      shape(ctx, type, st.fill, st.edge);
      glyph(ctx, GL[type], S / 2 - 3.5, S / 2 - 3.5, type === 'star' ? '#7a3a00' : '#ffffff');
      ctx.restore();
    });
  }
  // estrela grande (16x16)
  canvasTex(scene, 'big-star', 16, 16, (ctx) => {
    const rows = ['.......oo.......', '.......oo.......', '......oyyo......', '......oyyo......', 'oooooooyyoooooo.', 'oyyyyyyyYyyyyyyo', '.oyyyyyYYyyyyyo.', '..oyyyyYYyyyyo..', '...oyyyyyyyyo...', '...oyyyyyyyyo...', '..oyyyyooyyyyo..', '..oyyyo..oyyyo..', '.oyyyo....oyyyo.', '.oyyo......oyyo.', '.ooo........ooo.', '................'];
    const col: Record<string, string> = { o: '#a8651a', y: '#ffcf4a', Y: '#fff3a8' };
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const k = col[r[x]!]; if (k) { ctx.fillStyle = k; ctx.fillRect(x, y, 1, 1); } } });
  });
  // dado: 6 faces de 26x26
  canvasTex(scene, 'dice', 26 * 6, 26, (ctx) => {
    const PIPS: number[][][] = [[[1, 1]], [[0, 0], [2, 2]], [[0, 0], [1, 1], [2, 2]], [[0, 0], [2, 0], [0, 2], [2, 2]], [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]];
    PIPS.forEach((pips, i) => {
      const ox = i * 26;
      ctx.fillStyle = '#1b1030'; ctx.fillRect(ox + 1, 1, 24, 24);
      ctx.fillStyle = '#f6ecd2'; ctx.fillRect(ox + 3, 3, 20, 20);
      ctx.fillStyle = '#d8c79a'; ctx.fillRect(ox + 3, 20, 20, 3); ctx.fillRect(ox + 20, 3, 3, 20);
      ctx.fillStyle = '#1b1030';
      for (const [px, py] of pips) ctx.fillRect(ox + 6 + px! * 6, 6 + py! * 6, 4, 4);
    });
  }, { w: 26, count: 6 });
  // seta de escolha (bifurcação)
  canvasTex(scene, 'pick-arrow', 9, 7, (ctx) => { ctx.fillStyle = '#1b1030'; ctx.fillRect(0, 0, 9, 3); ctx.fillRect(1, 3, 7, 2); ctx.fillRect(2, 5, 5, 1); ctx.fillRect(3, 6, 3, 1); ctx.fillStyle = '#ffe08a'; ctx.fillRect(1, 1, 7, 1); ctx.fillRect(2, 2, 5, 1); ctx.fillRect(3, 3, 3, 1); ctx.fillRect(4, 4, 1, 1); });
  canvasTex(scene, 'turn-arrow', 7, 5, (ctx) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 7, 2); ctx.fillRect(1, 2, 5, 1); ctx.fillRect(2, 3, 3, 1); ctx.fillRect(3, 4, 1, 1); });
  buildBoardBg(scene, def);
}

function buildBoardBg(scene: Phaser.Scene, def: BoardDef) {
  const { w: W, h: H } = def.world;
  canvasTex(scene, 'board-bg', W, H, (ctx) => {
    const rng = createRng(1010);
    // mar
    ctx.fillStyle = '#1d4f8f'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) { ctx.fillStyle = rng.chance(0.5) ? '#2a63a8' : '#17407a'; ctx.fillRect(rng.int(0, W - 1), rng.int(0, H - 1), rng.int(2, 6), 1); }
    // ilha: areia e grama
    const island = (rx: number, ry: number, col: string) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(W / 2, H / 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
    island(388, 276, '#e8d9a0'); island(380, 268, '#4fae4c');
    for (let i = 0; i < 2600; i++) { // textura de grama
      const x = rng.int(0, W - 1), y = rng.int(0, H - 1);
      if (((x - W / 2) / 378) ** 2 + ((y - H / 2) / 266) ** 2 > 1) continue;
      ctx.fillStyle = rng.chance(0.5) ? '#459c45' : '#58bb52'; ctx.fillRect(x, y, 1, rng.chance(0.3) ? 2 : 1);
    }
    // lago a nordeste + rio até o mar (cruzando R08–R09)
    ctx.fillStyle = '#7a5a2a'; ctx.beginPath(); ctx.ellipse(560, 366, 80, 52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f7fd0'; ctx.beginPath(); ctx.ellipse(560, 366, 76, 48, 0, 0, Math.PI * 2); ctx.fill();
    const river = (pts: Array<[number, number]>, wd: number) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = wd + 4; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.strokeStyle = '#2f7fd0'; ctx.lineWidth = wd; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    };
    river([[620, 372], [670, 380], [720, 388], [790, 392]], 14);
    river([[312, 215], [296, 250], [280, 285], [262, 330]], 10);
    // ondas do lago
    for (let i = 0; i < 40; i++) { ctx.fillStyle = '#8fc4f0'; ctx.fillRect(rng.int(500, 620), rng.int(330, 400), rng.int(2, 5), 1); }
    // caminhos: terra batida entre casas conectadas
    const byId = Object.fromEntries(def.tiles.map((t) => [t.id, t]));
    const seen = new Set<string>();
    ctx.lineCap = 'round';
    for (const t of def.tiles) for (const n of t.next) {
      const k = [t.id, n].sort().join('-'); if (seen.has(k)) continue; seen.add(k);
      const a = t, b = byId[n]!;
      const bridge = def.bridges.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id));
      ctx.strokeStyle = bridge ? '#3a2410' : '#8a6a3a'; ctx.lineWidth = bridge ? 14 : 12; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = bridge ? '#b98a4a' : '#d6b878'; ctx.lineWidth = bridge ? 11 : 8; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (bridge) { // tábuas
        const L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
        ctx.strokeStyle = '#7a5226'; ctx.lineWidth = 1;
        for (let d = 4; d < L; d += 5) { const px = a.x + ux * d, py = a.y + uy * d; ctx.beginPath(); ctx.moveTo(px - uy * 5, py + ux * 5); ctx.lineTo(px + uy * 5, py - ux * 5); ctx.stroke(); }
      }
    }
    const nearTile = (x: number, y: number, r: number) => def.tiles.some((t) => Math.hypot(t.x - x, t.y - y) < r);
    const inWater = (x: number, y: number) => ((x - 560) / 90) ** 2 + ((y - 366) / 60) ** 2 < 1 || (y > 366 && y < 410 && x > 600) || (Math.abs(x - (312 - (y - 215) * 0.2)) < 16 && y > 205 && y < 340);
    const onIsland = (x: number, y: number) => ((x - W / 2) / 360) ** 2 + ((y - H / 2) / 252) ** 2 < 1;
    // castelo (topo)
    const castle = (cx: number, cy: number) => {
      ctx.fillStyle = 'rgba(20,10,40,0.35)'; ctx.fillRect(cx - 52, cy + 24, 104, 6);
      ctx.fillStyle = '#58566f'; ctx.fillRect(cx - 50, cy - 6, 100, 30);
      ctx.fillStyle = '#9a97ad'; ctx.fillRect(cx - 48, cy - 4, 96, 26);
      ctx.fillStyle = '#7a7791'; for (let x = cx - 48; x < cx + 48; x += 8) ctx.fillRect(x, cy - 8, 5, 4);
      for (const tx of [cx - 56, cx + 40]) { ctx.fillStyle = '#58566f'; ctx.fillRect(tx, cy - 26, 16, 52); ctx.fillStyle = '#9a97ad'; ctx.fillRect(tx + 2, cy - 24, 12, 48); ctx.fillStyle = '#c0304a'; ctx.beginPath(); ctx.moveTo(tx - 2, cy - 26); ctx.lineTo(tx + 8, cy - 42); ctx.lineTo(tx + 18, cy - 26); ctx.fill(); ctx.fillStyle = '#1b1030'; ctx.fillRect(tx + 6, cy - 14, 4, 7); }
      ctx.fillStyle = '#58566f'; ctx.fillRect(cx - 20, cy - 20, 40, 44); ctx.fillStyle = '#9a97ad'; ctx.fillRect(cx - 18, cy - 18, 36, 40);
      ctx.fillStyle = '#c0304a'; ctx.beginPath(); ctx.moveTo(cx - 22, cy - 20); ctx.lineTo(cx, cy - 40); ctx.lineTo(cx + 22, cy - 20); ctx.fill();
      ctx.fillStyle = '#1b1030'; ctx.fillRect(cx - 6, cy + 4, 12, 18); ctx.fillStyle = '#ffcf4a'; ctx.fillRect(cx - 1, cy - 12, 3, 1);
      ctx.fillStyle = '#ffcf4a'; ctx.fillRect(cx, cy - 46, 1, 6); ctx.fillStyle = '#e05252'; ctx.fillRect(cx + 1, cy - 46, 6, 3);
    };
    castle(400, 30);
    // pinheiros e casinhas espalhados, sem cobrir casas ou água
    const tree = (x: number, y: number) => {
      ctx.fillStyle = 'rgba(20,10,40,0.3)'; ctx.fillRect(x - 5, y + 6, 10, 3);
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 1, y + 3, 3, 4);
      ctx.fillStyle = '#174a2a'; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x - 6, y + 4); ctx.fill();
      ctx.fillStyle = '#2f7d3a'; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 3, y - 2); ctx.lineTo(x - 5, y + 3); ctx.lineTo(x - 6, y + 4); ctx.lineTo(x, y - 6); ctx.fill();
    };
    const house = (x: number, y: number) => {
      ctx.fillStyle = 'rgba(20,10,40,0.3)'; ctx.fillRect(x - 8, y + 8, 18, 3);
      ctx.fillStyle = '#f6ecd2'; ctx.fillRect(x - 7, y - 2, 14, 10); ctx.fillStyle = '#d8c79a'; ctx.fillRect(x - 7, y + 5, 14, 3);
      ctx.fillStyle = '#c0304a'; ctx.beginPath(); ctx.moveTo(x - 9, y - 1); ctx.lineTo(x, y - 9); ctx.lineTo(x + 9, y - 1); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 1, y + 3, 3, 5);
    };
    const spots: Array<[number, number, 't' | 'h']> = [];
    for (let i = 0; i < 700 && spots.length < 120; i++) {
      const x = rng.int(30, W - 30), y = rng.int(70, H - 20);
      if (!onIsland(x, y) || nearTile(x, y, 30) || inWater(x, y) || Math.abs(x - 400) < 70 && y < 100) continue;
      // evita sobrepor decorações vizinhas
      if (spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 16)) continue;
      spots.push([x, y, rng.chance(0.12) && y > 240 ? 'h' : 't']);
    }
    spots.sort((a, b) => a[1] - b[1]).forEach(([x, y, k]) => (k === 'h' ? house(x, y) : tree(x, y)));
  });
}
