import type Phaser from 'phaser';
import { createRng } from '@shared/rng';
import type { BoardDef, TileType } from '@shared/board/types';
import { REINO_DO_CASTELO } from '@shared/board/maps/reino-do-castelo';
import { canvasTex } from './textures';
import { darken, lighten, mix } from './scenery';

/**
 * Arte do tabuleiro em ALTA resolução (1600x1120 de mundo, exibido a 960x540):
 * ilha com falésia, grama em manchas, estradas de pedra, pontes, lago com vitórias-régias,
 * castelo, vila, árvores. Tudo procedural, sem arquivos de terceiros.
 */
export const K = 2; // o mundo do tabuleiro é o mapa (800x560) ampliado K vezes
export const BOARD_W = 960;
export const BOARD_H = 540;

export type Tone = 'good' | 'bad' | 'info';
export interface TileInfo { name: string; desc: string; fill: string; edge: string; tone: Tone; icon: string[] }

/** Ícones 9x9 de cada casa (forma + cor + ícone: nunca só cor). */
export const TILE_INFO: Record<TileType, TileInfo> = {
  blue: { name: 'Casa azul', desc: 'Ganha 3 moedas.', fill: '#3f86ee', edge: '#1b3f96', tone: 'good', icon: ['...###...', '...###...', '...###...', '#########', '#########', '#########', '...###...', '...###...', '...###...'] },
  red: { name: 'Casa vermelha', desc: 'Perde 3 moedas.', fill: '#e8484e', edge: '#8a1a2c', tone: 'bad', icon: ['.........', '.........', '.........', '#########', '#########', '#########', '.........', '.........', '.........'] },
  event: { name: 'Evento', desc: 'Um acontecimento surpresa muda o jogo.', fill: '#3fc46e', edge: '#1a6a38', tone: 'info', icon: ['..#####..', '.##...##.', '.##...##.', '.....##..', '....##...', '...##....', '...##....', '.........', '...##....'] },
  minigame: { name: 'Minigame', desc: 'Um minigame extra com prêmio em moedas.', fill: '#a074ec', edge: '#4c2a94', tone: 'info', icon: ['.##......', '.####....', '.######..', '.#######.', '.#######.', '.######..', '.####....', '.##......', '.........'] },
  shop: { name: 'Loja', desc: 'Compre itens: dado especial, escudo, ímã, poção...', fill: '#f2903c', edge: '#8c4410', tone: 'info', icon: ['...###...', '....#....', '..#####..', '.#######.', '#########', '#########', '#########', '.#######.', '.........'] },
  star: { name: 'Altar da estrela', desc: 'Compre a estrela por 25 moedas.', fill: '#ffd24a', edge: '#a8651a', tone: 'good', icon: ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..#####..', '.###.###.', '.#.....#.'] },
  duel: { name: 'Duelo', desc: 'Duelo de dados valendo 5 moedas.', fill: '#cc3552', edge: '#5e1026', tone: 'info', icon: ['#.......#', '##.....##', '.##...##.', '..##.##..', '...###...', '..##.##..', '.##...##.', '##.....##', '#.......#'] },
  teleport: { name: 'Teleporte', desc: 'Escolha para onde ir no mapa.', fill: '#3fd4e6', edge: '#1a6e8c', tone: 'info', icon: ['..#####..', '.#.....#.', '#..###..#', '#.#...#.#', '#.#.#.#.#', '#.#...#.#', '#..###..#', '.#.....#.', '..#####..'] },
  treasure: { name: 'Tesouro', desc: 'Um baú com 5 a 15 moedas.', fill: '#d0a04c', edge: '#6e4c1a', tone: 'good', icon: ['.#######.', '#########', '#########', '#.......#', '#########', '##.###.##', '##.###.##', '#########', '.........'] },
  trap: { name: 'Armadilha', desc: 'Perde 3 moedas ou volta 2 casas. O escudo protege.', fill: '#7c7c90', edge: '#2e2e42', tone: 'bad', icon: ['.#..#..#.', '.#..#..#.', '##.###.##', '##.###.##', '#########', '#########', '.........', '.........', '.........'] },
};

export const BOARD_FX: { flags: Array<{ x: number; y: number; c: string }>; torches: Array<{ x: number; y: number }>; sparkles: Array<{ x: number; y: number }> } = { flags: [], torches: [], sparkles: [] };

type Ctx = CanvasRenderingContext2D;
const TW = 64, TH = 72, TCX = 32, TCY = 30, TR = 25;

function shapePath(ctx: Ctx, type: TileType, cx: number, cy: number, r: number) {
  ctx.beginPath();
  const poly = (n: number, rot: number, rr = r) => { for (let i = 0; i < n; i++) { const a = rot + (Math.PI * 2 * i) / n; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
  const rect = (hw: number, hh: number, rad: number) => { ctx.roundRect(cx - hw, cy - hh, hw * 2, hh * 2, rad); };
  switch (type) {
    case 'event': poly(4, Math.PI / 4, r * 1.15); break;
    case 'minigame': rect(r * 0.86, r * 0.86, 7); break;
    case 'treasure': rect(r * 1.02, r * 0.78, 6); break;
    case 'trap': { ctx.moveTo(cx, cy - r * 1.05); ctx.lineTo(cx + r * 1.08, cy + r * 0.82); ctx.lineTo(cx - r * 1.08, cy + r * 0.82); ctx.closePath(); break; }
    case 'shop': poly(6, 0, r * 1.03); break;
    case 'duel': poly(8, Math.PI / 8, r * 1.05); break;
    case 'star': { for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 8; const rr = i % 2 ? r * 0.8 : r * 1.12; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); break; }
    default: ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
}

function drawGlyph(ctx: Ctx, rows: string[], ox: number, oy: number, s: number, color: string, ink: string) {
  const px = (dx: number, dy: number, c: string) => rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') { ctx.fillStyle = c; ctx.fillRect(ox + x * s + dx, oy + y * s + dy, s, s); } });
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]] as const) px(dx * 1.5, dy * 1.5, ink);
  px(0, 2, darken(color, 0.25));
  px(0, 0, color);
}

function buildTile(scene: Phaser.Scene, type: TileType) {
  const st = TILE_INFO[type];
  canvasTex(scene, `bd-tile-${type}`, TW, TH, (ctx) => {
    // sombra no chão
    ctx.fillStyle = 'rgba(20,8,40,0.38)'; ctx.beginPath(); ctx.ellipse(TCX, TCY + 12, TR + 4, 11, 0, 0, Math.PI * 2); ctx.fill();
    // lateral (espessura 3D)
    const side = darken(st.edge, 0.35);
    for (let d = 9; d >= 1; d--) { ctx.fillStyle = d > 6 ? darken(side, 0.2) : side; shapePath(ctx, type, TCX, TCY + d, TR); ctx.fill(); }
    // aro claro e face com degradê
    ctx.fillStyle = lighten(st.fill, 0.55); shapePath(ctx, type, TCX, TCY, TR); ctx.fill();
    ctx.fillStyle = st.edge; shapePath(ctx, type, TCX, TCY + 1, TR - 1.5); ctx.fill();
    const g = ctx.createLinearGradient(TCX - TR, TCY - TR, TCX + TR * 0.6, TCY + TR);
    g.addColorStop(0, lighten(st.fill, 0.38)); g.addColorStop(0.5, st.fill); g.addColorStop(1, darken(st.fill, 0.24));
    ctx.fillStyle = g; shapePath(ctx, type, TCX, TCY, TR - 3.5); ctx.fill();
    // brilho superior
    ctx.save(); shapePath(ctx, type, TCX, TCY, TR - 3.5); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(TCX - 6, TCY - 13, TR * 0.9, TR * 0.42, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawGlyph(ctx, st.icon, TCX - 13.5, TCY - 14, 3, type === 'star' ? '#7a3a00' : '#ffffff', '#1b1030');
  });
}

function seg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function buildBoardArt(scene: Phaser.Scene, def: BoardDef = REINO_DO_CASTELO) {
  for (const type of Object.keys(TILE_INFO) as TileType[]) buildTile(scene, type);
  buildBoardTextures2(scene);
  buildBg(scene, def);
}

function buildBoardTextures2(scene: Phaser.Scene) {
  // estrela grande 32x32 com brilho
  canvasTex(scene, 'bd-star', 34, 34, (ctx) => {
    const rows = ['.......oo.......', '.......oo.......', '......oyyo......', '......oyyo......', 'oooooooyyoooooo.', 'oyyyyyyyYyyyyyyo', '.oyyyyyYYyyyyyo.', '..oyyyyYYyyyyo..', '...oyyyyyyyyo...', '...oyyyyyyyyo...', '..oyyyyooyyyyo..', '..oyyyo..oyyyo..', '.oyyyo....oyyyo.', '.oyyo......oyyo.', '.ooo........ooo.', '................'];
    const col: Record<string, string> = { o: '#a8651a', y: '#ffcf4a', Y: '#fff6b8' };
    ctx.translate(1, 1);
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const k = col[r[x]!]; if (!k) continue; ctx.fillStyle = k; ctx.fillRect(x * 2, y * 2, 2, 2); if (k === col.y && x < 8 && y < 9) { ctx.fillStyle = '#ffe58a'; ctx.fillRect(x * 2, y * 2, 2, 1); } } });
  });
  // brilho radial branco (use tint + blend ADD)
  canvasTex(scene, 'bd-glow', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
  // anel de choque
  canvasTex(scene, 'bd-ring', 128, 128, (ctx) => {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(64, 64, 50, 0, Math.PI * 2); ctx.stroke();
  });
  // feixe de luz vertical
  canvasTex(scene, 'bd-beam', 48, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(34, 0); ctx.lineTo(48, 256); ctx.lineTo(0, 256); ctx.fill();
  });
  // raios para o título da rodada
  canvasTex(scene, 'bd-rays', 512, 512, (ctx) => {
    ctx.translate(256, 256);
    for (let i = 0; i < 16; i++) { ctx.rotate((Math.PI * 2) / 16); const g = ctx.createLinearGradient(0, 0, 250, 0); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(250, -22); ctx.lineTo(250, 22); ctx.lineTo(0, 5); ctx.fill(); }
  });
  // brilho de 4 pontas
  canvasTex(scene, 'bd-spark', 15, 15, (ctx) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(7, 0, 1, 15); ctx.fillRect(0, 7, 15, 1); ctx.fillRect(6, 5, 3, 5); ctx.fillRect(5, 6, 5, 3); ctx.fillStyle = '#ffe9a0'; ctx.fillRect(6, 4, 3, 1); ctx.fillRect(6, 10, 3, 1);
  });
  canvasTex(scene, 'bd-dot', 4, 4, (ctx) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 4, 4); });
  // nuvem de sombra/poeira
  canvasTex(scene, 'bd-puff', 24, 24, (ctx) => {
    const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 24, 24);
  });
  // nuvens que passam (sombra projetada na ilha) e pássaro
  canvasTex(scene, 'bd-cloudshadow', 260, 110, (ctx) => {
    const rng = createRng(77); ctx.fillStyle = 'rgba(30,10,60,0.55)';
    for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.ellipse(40 + rng.int(0, 180), 40 + rng.int(-14, 24), rng.int(26, 52), rng.int(14, 30), 0, 0, Math.PI * 2); ctx.fill(); }
  });
  canvasTex(scene, 'bd-bird', 28, 8, (ctx) => {
    const a = ['o.....o.....', '.oo..oo.....', '...oo.......'];
    ctx.fillStyle = '#2a1a4a';
    [[0, 3], [1, 2], [2, 1], [3, 2], [4, 3], [5, 3], [6, 2], [7, 1], [8, 2], [9, 3]].forEach(([x, y]) => ctx.fillRect(x! * 2, y! * 1.4, 2, 2));
    [[14, 1], [15, 2], [16, 3], [17, 2], [18, 1], [19, 2], [20, 3], [21, 3], [22, 2], [23, 1]].forEach(([x, y]) => ctx.fillRect(x! * 1, y! * 1.4 + 1, 2, 2));
    void a;
  }, { w: 14, count: 2 });
  // vinheta só nas bordas (barata: não cobre a tela inteira)
  canvasTex(scene, 'bd-vig-h', BOARD_W, 90, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, 'rgba(20,6,50,0.6)'); g.addColorStop(1, 'rgba(20,6,50,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, BOARD_W, 90);
  });
  canvasTex(scene, 'bd-vig-v', 90, BOARD_H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 90, 0); g.addColorStop(0, 'rgba(20,6,50,0.6)'); g.addColorStop(1, 'rgba(20,6,50,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 90, BOARD_H);
  });
  // dado: 6 faces 72x72 com bisel e pontos em relevo
  canvasTex(scene, 'bd-dice', 72 * 6, 72, (ctx) => {
    const PIPS: number[][][] = [[[1, 1]], [[0, 0], [2, 2]], [[0, 0], [1, 1], [2, 2]], [[0, 0], [2, 0], [0, 2], [2, 2]], [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]];
    PIPS.forEach((pips, i) => {
      const ox = i * 72;
      ctx.fillStyle = 'rgba(20,8,40,0.35)'; ctx.beginPath(); ctx.ellipse(ox + 36, 66, 26, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1030'; ctx.beginPath(); ctx.roundRect(ox + 6, 6, 60, 58, 12); ctx.fill();
      const g = ctx.createLinearGradient(ox + 8, 8, ox + 64, 62); g.addColorStop(0, '#fffdf0'); g.addColorStop(0.6, '#f2e6c4'); g.addColorStop(1, '#cdb98a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(ox + 9, 9, 54, 52, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.roundRect(ox + 12, 11, 30, 5, 3); ctx.fill();
      for (const [px, py] of pips) {
        const x = ox + 22 + px! * 14, y = 21 + py! * 14;
        ctx.fillStyle = '#e8d6a8'; ctx.beginPath(); ctx.arc(x, y + 1.5, 6.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = i === 0 ? '#d63a3a' : '#2a1850'; ctx.beginPath(); ctx.arc(x, y, 5.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x - 3, y - 3, 2, 2);
      }
    });
  }, { w: 72, count: 6 });
  // seta de escolha e marcador de turno
  canvasTex(scene, 'bd-arrow', 22, 18, (ctx) => {
    ctx.fillStyle = '#1b1030'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(22, 0); ctx.lineTo(11, 18); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(18, 3); ctx.lineTo(11, 13); ctx.fill();
  });
  canvasTex(scene, 'bd-coin', 24, 24, (ctx) => {
    ctx.fillStyle = '#7a4a10'; ctx.beginPath(); ctx.arc(12, 12, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(12, 12, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe58a'; ctx.beginPath(); ctx.arc(10, 10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9962a'; ctx.fillRect(10, 6, 4, 12); ctx.fillStyle = '#fff2b0'; ctx.fillRect(10, 6, 2, 8);
  });
}

/** Pedras de calçada, grama em manchas, árvores, lago, castelo: fundo do mundo inteiro. */
function buildBg(scene: Phaser.Scene, def: BoardDef) {
  const W = def.world.w * K, H = def.world.h * K;
  canvasTex(scene, 'bd-bg', W, H, (ctx) => {
    BOARD_FX.flags.length = 0; BOARD_FX.torches.length = 0; BOARD_FX.sparkles.length = 0;
    const rng = createRng(2024);
    const fr = () => rng.int(0, 10000) / 10000;
    const CX = W / 2, CY = H / 2 + 8, RX = 776, RY = 548;
    // ---------------- mar
    const sea = ['#14346e', '#173c7c', '#1a4686', '#1d508f', '#215a98', '#2564a0'];
    sea.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, Math.floor((H / sea.length) * i), W, Math.ceil(H / sea.length) + 1); });
    for (let i = 0; i < 900; i++) { const x = rng.int(0, W), y = rng.int(0, H); ctx.fillStyle = rng.chance(0.5) ? 'rgba(120,190,255,0.22)' : 'rgba(10,30,90,0.3)'; ctx.fillRect(x, y, rng.int(6, 22), 2); }
    // ondas concêntricas perto da costa
    for (let k = 0; k < 4; k++) { ctx.strokeStyle = `rgba(190,230,255,${0.2 - k * 0.04})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(CX, CY, RX + 26 + k * 18, RY + 22 + k * 15, 0, 0, Math.PI * 2); ctx.stroke(); }
    // ---------------- ilha: sombra na água, falésia, areia, espuma, grama
    const ell = (rx: number, ry: number, col: string, dy = 0) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(CX, CY + dy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
    ell(RX + 14, RY + 12, 'rgba(8,20,60,0.35)', 26);
    ell(RX + 12, RY + 10, '#e4f4ff', 0); // espuma
    ell(RX + 4, RY + 4, '#9ad4f4', 0);
    for (let d = 26; d >= 1; d--) ell(RX, RY, d > 14 ? '#5a4234' : d > 6 ? '#74563f' : '#8c6a4a', d); // falésia
    ell(RX, RY, '#f2dfa4'); // areia
    ell(RX - 14, RY - 12, '#e6c884');
    ell(RX - 24, RY - 20, '#5cbc50'); // grama
    // grama em manchas (claro/escuro), com dither
    const onIsland = (x: number, y: number, m = 0) => ((x - CX) / (RX - 30 - m)) ** 2 + ((y - CY) / (RY - 26 - m)) ** 2 < 1;
    for (let i = 0; i < 260; i++) {
      const x = rng.int(60, W - 60), y = rng.int(60, H - 40); if (!onIsland(x, y, 24)) continue;
      const rx = rng.int(30, 110), ry = rng.int(18, 60); ctx.fillStyle = rng.chance(0.5) ? 'rgba(130,220,90,0.30)' : 'rgba(30,110,50,0.22)';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 9000; i++) {
      const x = rng.int(0, W), y = rng.int(0, H); if (!onIsland(x, y, 10)) continue;
      const c = rng.int(0, 3); ctx.fillStyle = ['#3f9a42', '#76d05a', '#4cae4a', '#2f8238'][c]!; ctx.fillRect(x, y, 2, rng.chance(0.35) ? 4 : 2);
    }
    // pontos de luz/relva alta
    for (let i = 0; i < 700; i++) { const x = rng.int(0, W), y = rng.int(0, H); if (!onIsland(x, y, 20)) continue; ctx.fillStyle = '#a6f06a'; ctx.fillRect(x, y - 3, 2, 3); ctx.fillRect(x + 3, y - 2, 2, 2); ctx.fillStyle = '#2a7a34'; ctx.fillRect(x, y, 5, 1); }
    // sombra da borda interna (profundidade)
    ctx.save(); ctx.beginPath(); ctx.ellipse(CX, CY, RX - 24, RY - 20, 0, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(15,60,40,0.30)'; ctx.lineWidth = 26; ctx.beginPath(); ctx.ellipse(CX, CY, RX - 24 + 8, RY - 20 + 8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // ---------------- lago + rios (coordenadas do mapa × K)
    const LK = { x: 560 * K, y: 366 * K, rx: 80 * K, ry: 52 * K };
    const water = (rx: number, ry: number, col: string) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(LK.x, LK.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
    water(LK.rx + 14, LK.ry + 12, '#e6c884'); water(LK.rx + 6, LK.ry + 5, '#c9a864'); water(LK.rx + 2, LK.ry + 2, '#2a6cb8');
    const wg = ctx.createRadialGradient(LK.x - 30, LK.y - 20, 10, LK.x, LK.y, LK.rx);
    wg.addColorStop(0, '#79d0f4'); wg.addColorStop(0.55, '#3d96dc'); wg.addColorStop(1, '#24609f');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(LK.x, LK.y, LK.rx - 2, LK.ry - 2, 0, 0, Math.PI * 2); ctx.fill();
    const river = (pts: Array<[number, number]>, wd: number) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
      ctx.strokeStyle = '#c9a864'; ctx.lineWidth = wd + 10; path();
      ctx.strokeStyle = '#2a6cb8'; ctx.lineWidth = wd + 2; path();
      ctx.strokeStyle = '#3d96dc'; ctx.lineWidth = wd - 4; path();
      ctx.strokeStyle = 'rgba(190,235,255,0.5)'; ctx.lineWidth = 3; ctx.setLineDash([14, 22]); path(); ctx.setLineDash([]);
    };
    river([[1240, 744], [1340, 760], [1440, 776], [1590, 788]], 30);
    river([[626, 430], [592, 500], [560, 570], [524, 664]], 22);
    for (let i = 0; i < 70; i++) { ctx.fillStyle = 'rgba(200,240,255,0.55)'; ctx.fillRect(LK.x + rng.int(-LK.rx + 14, LK.rx - 14), LK.y + rng.int(-LK.ry + 10, LK.ry - 10), rng.int(6, 18), 2); }
    for (let i = 0; i < 9; i++) { // vitórias-régias
      const x = LK.x + rng.int(-110, 110), y = LK.y + rng.int(-60, 60); if (((x - LK.x) / (LK.rx - 14)) ** 2 + ((y - LK.y) / (LK.ry - 12)) ** 2 > 1) continue;
      ctx.fillStyle = '#2f8a3c'; ctx.beginPath(); ctx.ellipse(x, y, 11, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#58c25a'; ctx.beginPath(); ctx.ellipse(x - 1, y - 1, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      if (i % 3 === 0) { ctx.fillStyle = '#ffb6d8'; ctx.fillRect(x - 2, y - 5, 5, 4); ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 5, 2, 2); }
    }

    // ---------------- estradas de pedra
    const byId = Object.fromEntries(def.tiles.map((t) => [t.id, t]));
    const segs: Array<[number, number, number, number]> = [];
    const seen = new Set<string>();
    const roads: Array<{ a: typeof def.tiles[number]; b: typeof def.tiles[number]; bridge: boolean }> = [];
    for (const t of def.tiles) for (const n of t.next) {
      const k = [t.id, n].sort().join('-'); if (seen.has(k)) continue; seen.add(k);
      const a = t, b = byId[n]!;
      roads.push({ a, b, bridge: def.bridges.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id)) });
      segs.push([a.x * K, a.y * K, b.x * K, b.y * K]);
    }
    ctx.lineCap = 'round';
    for (const { a, b, bridge } of roads) { // sombra e borda
      ctx.strokeStyle = bridge ? 'rgba(10,20,60,0.45)' : 'rgba(30,60,30,0.35)'; ctx.lineWidth = 36; ctx.beginPath(); ctx.moveTo(a.x * K, a.y * K + 6); ctx.lineTo(b.x * K, b.y * K + 6); ctx.stroke();
    }
    for (const { a, b, bridge } of roads) {
      const ax = a.x * K, ay = a.y * K, bx = b.x * K, by = b.y * K;
      ctx.strokeStyle = bridge ? '#3a2410' : '#7a5c34'; ctx.lineWidth = bridge ? 34 : 30; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = bridge ? '#a87a3c' : '#cfae6e'; ctx.lineWidth = bridge ? 28 : 24; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = bridge ? '#c99a52' : '#e6ca8a'; ctx.lineWidth = bridge ? 18 : 14; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
      if (bridge) {
        for (let d = 6; d < L; d += 9) { const px = ax + ux * d, py = ay + uy * d; ctx.strokeStyle = '#6e4a22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - nx * 13, py - ny * 13); ctx.lineTo(px + nx * 13, py + ny * 13); ctx.stroke(); ctx.strokeStyle = 'rgba(255,230,170,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - nx * 12 + ux * 2, py - ny * 12 + uy * 2); ctx.lineTo(px + nx * 12 + ux * 2, py + ny * 12 + uy * 2); ctx.stroke(); }
        for (const s of [-1, 1]) { ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ax + nx * 16 * s, ay + ny * 16 * s); ctx.lineTo(bx + nx * 16 * s, by + ny * 16 * s); ctx.stroke(); ctx.strokeStyle = '#a87a3c'; ctx.lineWidth = 2; ctx.stroke(); for (let d = 8; d < L; d += 26) { const px = ax + ux * d + nx * 16 * s, py = ay + uy * d + ny * 16 * s; ctx.fillStyle = '#3a2410'; ctx.fillRect(px - 3, py - 7, 6, 11); ctx.fillStyle = '#c99a52'; ctx.fillRect(px - 2, py - 7, 3, 4); } }
      } else {
        for (let d = 4; d < L; d += 7) { const o = (rng.int(-9, 9)); const px = ax + ux * d + nx * o, py = ay + uy * d + ny * o; ctx.fillStyle = rng.chance(0.5) ? '#b8975a' : '#f2dca4'; ctx.fillRect(px, py, rng.int(3, 6), rng.int(2, 4)); }
        for (const s of [-1, 1]) { ctx.strokeStyle = 'rgba(90,60,30,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax + nx * 13 * s, ay + ny * 13 * s); ctx.lineTo(bx + nx * 13 * s, by + ny * 13 * s); ctx.stroke(); }
      }
    }
    // praças sob cada casa
    for (const t of def.tiles) {
      const x = t.x * K, y = t.y * K;
      ctx.fillStyle = 'rgba(30,20,10,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 10, 40, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6e5230'; ctx.beginPath(); ctx.ellipse(x, y + 6, 38, 21, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cfae6e'; ctx.beginPath(); ctx.ellipse(x, y + 5, 35, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e2c586'; ctx.beginPath(); ctx.ellipse(x - 2, y + 3, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 10; i++) { const a = rng.int(0, 628) / 100, rr = 0.4 + fr() * 0.55; ctx.fillStyle = rng.chance(0.5) ? '#b8975a' : '#f2dca4'; ctx.fillRect(x + Math.cos(a) * 30 * rr, y + 4 + Math.sin(a) * 14 * rr, 4, 2); }
    }

    // ---------------- helpers de decoração
    const nearTile = (x: number, y: number, r: number) => def.tiles.some((t) => Math.hypot(t.x * K - x, t.y * K - y) < r);
    const nearRoad = (x: number, y: number, r: number) => segs.some(([ax, ay, bx, by]) => seg(x, y, ax, ay, bx, by) < r);
    const inWater = (x: number, y: number) => ((x - LK.x) / (LK.rx + 30)) ** 2 + ((y - LK.y) / (LK.ry + 26)) ** 2 < 1 || (y > 720 && y < 830 && x > 1200) || (Math.abs(x - (626 - (y - 430) * 0.4)) < 34 && y > 410 && y < 690);
    const castleZone = (x: number, y: number) => Math.abs(x - 800) < 260 && y < 150;
    const shadow = (x: number, y: number, rx: number, ry: number) => { ctx.fillStyle = 'rgba(15,40,30,0.32)'; ctx.beginPath(); ctx.ellipse(x + 6, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };

    const tree = (x: number, y: number, kind: number) => {
      shadow(x, y + 2, 22, 7);
      if (kind === 0) { // pinheiro em 3 camadas
        ctx.fillStyle = '#4a2f18'; ctx.fillRect(x - 3, y - 6, 7, 12);
        const tiers = [[26, 0], [20, -17], [14, -32]] as const;
        tiers.forEach(([w, dy], i) => {
          const by = y - 6 + dy;
          ctx.fillStyle = '#0f3a22'; ctx.beginPath(); ctx.moveTo(x, by - 22); ctx.lineTo(x + w, by + 6); ctx.lineTo(x - w, by + 6); ctx.fill();
          ctx.fillStyle = '#1f6a38'; ctx.beginPath(); ctx.moveTo(x, by - 22); ctx.lineTo(x + w * 0.2, by - 4); ctx.lineTo(x - w * 0.85, by + 4); ctx.lineTo(x - w, by + 6); ctx.fill();
          ctx.fillStyle = '#3a9a4c'; ctx.beginPath(); ctx.moveTo(x - 1, by - 20); ctx.lineTo(x - w * 0.45, by - 2); ctx.lineTo(x - w * 0.7, by + 3); ctx.lineTo(x - w * 0.3, by - 4); ctx.fill();
          if (i === 2) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.18; ctx.fillRect(x - 3, by - 18, 4, 3); ctx.globalAlpha = 1; }
        });
      } else { // árvore de copa redonda
        ctx.fillStyle = '#4a2f18'; ctx.fillRect(x - 4, y - 10, 9, 18); ctx.fillStyle = '#6a4424'; ctx.fillRect(x - 4, y - 10, 4, 18);
        const blobs: Array<[number, number, number]> = [[0, -34, 20], [-16, -24, 16], [16, -24, 16], [0, -20, 18]];
        for (const [dx, dy, r] of blobs) { ctx.fillStyle = '#1e5e2a'; ctx.beginPath(); ctx.arc(x + dx, y + dy + 3, r, 0, Math.PI * 2); ctx.fill(); }
        for (const [dx, dy, r] of blobs) { ctx.fillStyle = '#2f8a3a'; ctx.beginPath(); ctx.arc(x + dx - 2, y + dy, r - 2, 0, Math.PI * 2); ctx.fill(); }
        for (const [dx, dy, r] of blobs) { ctx.fillStyle = '#58b84e'; ctx.beginPath(); ctx.arc(x + dx - 5, y + dy - 4, r - 8, 0, Math.PI * 2); ctx.fill(); }
        for (let i = 0; i < 6; i++) { ctx.fillStyle = '#9ae070'; ctx.fillRect(x - 18 + rng.int(0, 22), y - 46 + rng.int(0, 18), 3, 2); }
        if (kind === 2) for (let i = 0; i < 5; i++) { ctx.fillStyle = '#ff6a6a'; ctx.fillRect(x - 14 + rng.int(0, 28), y - 40 + rng.int(0, 28), 4, 4); }
      }
    };
    const rock = (x: number, y: number) => { shadow(x, y + 3, 16, 5); ctx.fillStyle = '#4c4a66'; ctx.beginPath(); ctx.ellipse(x, y, 14, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8a88a6'; ctx.beginPath(); ctx.ellipse(x - 2, y - 2, 11, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b8b6d0'; ctx.fillRect(x - 7, y - 6, 5, 2); };
    const bush = (x: number, y: number) => { shadow(x, y + 3, 14, 4); for (const [dx, c] of [[-8, '#2a7a34'], [8, '#2a7a34'], [0, '#3a9a44']] as const) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + dx, y - 4, 9, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#7ad060'; ctx.fillRect(x - 6, y - 12, 4, 2); };
    const flowers = (x: number, y: number) => { const cols = ['#ff7aa8', '#ffe05a', '#ffffff', '#8ac8ff']; for (let i = 0; i < 6; i++) { const fx = x + rng.int(-14, 14), fy = y + rng.int(-8, 8); ctx.fillStyle = '#2a7a34'; ctx.fillRect(fx, fy, 2, 5); ctx.fillStyle = cols[i % 4]!; ctx.fillRect(fx - 2, fy - 3, 6, 4); ctx.fillStyle = '#ffe9a0'; ctx.fillRect(fx, fy - 2, 2, 2); } };
    const house = (x: number, y: number, v: number) => {
      shadow(x, y + 16, 40, 9);
      const wall = ['#f6ecd2', '#e8d6b0', '#f2dcc0'][v % 3]!, roof = ['#c0304a', '#3a6ad0', '#d8782a'][v % 3]!;
      ctx.fillStyle = darken(wall, 0.3); ctx.fillRect(x - 28, y - 6, 56, 26); ctx.fillStyle = wall; ctx.fillRect(x - 28, y - 6, 50, 24);
      ctx.fillStyle = 'rgba(120,80,50,0.35)'; for (let by = y - 2; by < y + 18; by += 6) ctx.fillRect(x - 28, by, 50, 1);
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 5, y + 4, 11, 16); ctx.fillStyle = '#ffcf4a'; ctx.fillRect(x + 3, y + 12, 2, 2);
      for (const wx of [-22, 12]) { ctx.fillStyle = '#1b1030'; ctx.fillRect(x + wx, y, 11, 10); ctx.fillStyle = '#ffd98c'; ctx.fillRect(x + wx + 1, y + 1, 9, 8); ctx.fillStyle = '#7a4a22'; ctx.fillRect(x + wx + 5, y + 1, 1, 8); ctx.fillRect(x + wx + 1, y + 5, 9, 1); }
      ctx.fillStyle = darken(roof, 0.4); ctx.beginPath(); ctx.moveTo(x - 36, y - 4); ctx.lineTo(x, y - 36); ctx.lineTo(x + 36, y - 4); ctx.fill();
      ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(x - 34, y - 5); ctx.lineTo(x, y - 34); ctx.lineTo(x + 6, y - 28); ctx.lineTo(x - 26, y - 5); ctx.fill();
      ctx.fillStyle = lighten(roof, 0.3); ctx.beginPath(); ctx.moveTo(x - 30, y - 6); ctx.lineTo(x - 2, y - 31); ctx.lineTo(x + 1, y - 28); ctx.lineTo(x - 24, y - 7); ctx.fill();
      ctx.fillStyle = '#6a5a74'; ctx.fillRect(x + 14, y - 30, 8, 14); ctx.fillStyle = '#9a8aa8'; ctx.fillRect(x + 14, y - 30, 4, 14);
    };
    const well = (x: number, y: number) => { shadow(x, y + 8, 16, 5); ctx.fillStyle = '#4c4a66'; ctx.beginPath(); ctx.ellipse(x, y, 14, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#9a98b8'; ctx.fillRect(x - 13, y - 8, 26, 10); ctx.fillStyle = '#1d4f8f'; ctx.beginPath(); ctx.ellipse(x, y - 8, 11, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 13, y - 22, 3, 14); ctx.fillRect(x + 10, y - 22, 3, 14); ctx.fillStyle = '#c0304a'; ctx.beginPath(); ctx.moveTo(x - 17, y - 21); ctx.lineTo(x, y - 32); ctx.lineTo(x + 17, y - 21); ctx.fill(); };
    const hay = (x: number, y: number) => { shadow(x, y + 6, 18, 5); ctx.fillStyle = '#b8862a'; ctx.beginPath(); ctx.ellipse(x, y - 2, 14, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8bd4a'; ctx.beginPath(); ctx.ellipse(x - 2, y - 4, 11, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#a87820'; ctx.lineWidth = 1; for (let i = -6; i < 8; i += 4) { ctx.beginPath(); ctx.moveTo(x + i, y - 12); ctx.lineTo(x + i - 2, y + 6); ctx.stroke(); } };

    // ---------------- castelo (topo da ilha)
    const castle = (cx: number, by: number) => {
      ctx.fillStyle = 'rgba(15,40,30,0.35)'; ctx.beginPath(); ctx.ellipse(cx, by + 6, 300, 22, 0, 0, Math.PI * 2); ctx.fill();
      const stone = '#a9a6c0', stoneHi = '#d2cfe6', stoneLo = '#6e6b8e', stoneDk = '#46436a';
      const bricks = (x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = stone; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = stoneHi; ctx.fillRect(x, y, 4, h); ctx.fillRect(x, y, w, 3);
        ctx.fillStyle = stoneLo; ctx.fillRect(x + w - 6, y, 6, h); ctx.fillRect(x, y + h - 5, w, 5);
        ctx.strokeStyle = 'rgba(70,67,106,0.55)'; ctx.lineWidth = 1;
        for (let yy = y + 8, r = 0; yy < y + h - 4; yy += 8, r++) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); for (let xx = x + (r % 2 ? 7 : 0) + 7; xx < x + w; xx += 14) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 8); ctx.stroke(); } }
      };
      const crenel = (x: number, y: number, w: number) => { for (let xx = x; xx < x + w - 6; xx += 16) { ctx.fillStyle = stoneLo; ctx.fillRect(xx, y - 10, 10, 11); ctx.fillStyle = stone; ctx.fillRect(xx, y - 10, 8, 10); ctx.fillStyle = stoneHi; ctx.fillRect(xx, y - 10, 8, 2); } };
      const roofCone = (x: number, y: number, w: number, h: number, col: string) => {
        ctx.fillStyle = darken(col, 0.4); ctx.beginPath(); ctx.moveTo(x - w / 2 - 6, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w / 2 + 6, y); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - w / 2 - 4, y); ctx.lineTo(x, y - h); ctx.lineTo(x + 6, y - h * 0.7); ctx.lineTo(x - w / 4, y); ctx.fill();
        ctx.fillStyle = lighten(col, 0.3); ctx.beginPath(); ctx.moveTo(x - w / 2 + 2, y - 2); ctx.lineTo(x - 2, y - h + 6); ctx.lineTo(x + 1, y - h + 10); ctx.lineTo(x - w / 2 + 12, y - 2); ctx.fill();
        ctx.fillStyle = '#ffcf4a'; ctx.fillRect(x - 1, y - h - 12, 3, 12);
      };
      const win = (x: number, y: number) => { ctx.fillStyle = '#1b1030'; ctx.beginPath(); ctx.roundRect(x - 5, y - 8, 10, 16, [5, 5, 0, 0]); ctx.fill(); ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.roundRect(x - 3, y - 6, 6, 13, [3, 3, 0, 0]); ctx.fill(); ctx.fillStyle = '#fff2b0'; ctx.fillRect(x - 3, y - 6, 2, 6); };
      // muralha
      bricks(cx - 250, by - 60, 500, 64); crenel(cx - 250, by - 60, 500);
      // torres laterais e torre central
      for (const tx of [cx - 290, cx + 238]) { bricks(tx, by - 130, 52, 134); crenel(tx - 2, by - 130, 56); roofCone(tx + 26, by - 140, 60, 70, '#c0304a'); win(tx + 26, by - 90); win(tx + 26, by - 40); BOARD_FX.flags.push({ x: tx + 26, y: by - 222, c: '#e05252' }); }
      for (const tx of [cx - 150, cx + 100]) { bricks(tx, by - 100, 50, 104); crenel(tx - 2, by - 100, 54); roofCone(tx + 25, by - 110, 56, 56, '#3a6ad0'); win(tx + 25, by - 60); BOARD_FX.flags.push({ x: tx + 25, y: by - 178, c: '#4a8ae8' }); }
      bricks(cx - 56, by - 150, 112, 154); crenel(cx - 58, by - 150, 116);
      roofCone(cx, by - 160, 128, 84, '#c0304a'); BOARD_FX.flags.push({ x: cx, y: by - 256, c: '#ffcf4a' });
      win(cx - 24, by - 112); win(cx + 24, by - 112);
      ctx.fillStyle = stoneDk; ctx.beginPath(); ctx.arc(cx, by - 84, 16, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#6ab8ff'; ctx.beginPath(); ctx.arc(cx, by - 84, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c8ecff'; ctx.fillRect(cx - 7, by - 90, 4, 4); ctx.strokeStyle = stoneDk; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 12, by - 84); ctx.lineTo(cx + 12, by - 84); ctx.moveTo(cx, by - 96); ctx.lineTo(cx, by - 72); ctx.stroke();
      // portão
      ctx.fillStyle = stoneDk; ctx.beginPath(); ctx.roundRect(cx - 38, by - 66, 76, 70, [38, 38, 0, 0]); ctx.fill();
      ctx.fillStyle = '#1b1030'; ctx.beginPath(); ctx.roundRect(cx - 30, by - 58, 60, 62, [30, 30, 0, 0]); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.roundRect(cx - 26, by - 54, 52, 58, [26, 26, 0, 0]); ctx.fill();
      ctx.strokeStyle = '#2a1808'; ctx.lineWidth = 2; for (let x = cx - 20; x <= cx + 20; x += 10) { ctx.beginPath(); ctx.moveTo(x, by - 40); ctx.lineTo(x, by + 4); ctx.stroke(); }
      ctx.fillStyle = '#c9902a'; ctx.fillRect(cx - 26, by - 30, 52, 4); ctx.fillRect(cx - 26, by - 8, 52, 4);
      for (const tx of [cx - 50, cx + 50]) { ctx.fillStyle = '#3a2410'; ctx.fillRect(tx - 2, by - 40, 4, 22); ctx.fillStyle = '#ff9a2a'; ctx.beginPath(); ctx.ellipse(tx, by - 44, 5, 8, 0, 0, Math.PI * 2); ctx.fill(); BOARD_FX.torches.push({ x: tx, y: by - 44 }); }
      // estandartes na muralha
      for (const bx of [cx - 200, cx + 200, cx - 90, cx + 90]) { ctx.fillStyle = '#e05252'; ctx.fillRect(bx - 7, by - 52, 14, 30); ctx.beginPath(); ctx.moveTo(bx - 7, by - 22); ctx.lineTo(bx, by - 14); ctx.lineTo(bx + 7, by - 22); ctx.fill(); ctx.fillStyle = '#ffcf4a'; ctx.fillRect(bx - 3, by - 44, 6, 6); }
    };
    castle(800, 138);

    // ---------------- vila e natureza: sem cobrir casas, estradas ou água
    const spots: Array<[number, number, string]> = [];
    const free = (x: number, y: number, r: number) => onIsland(x, y, 40) && !nearTile(x, y, 70) && !nearRoad(x, y, 42) && !inWater(x, y) && !castleZone(x, y) && !spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < r);
    // vila (sudoeste e sul): casas agrupadas
    const hubs: Array<[number, number]> = [[430, 900], [1160, 960], [330, 700], [820, 960]];
    let hv = 0;
    for (const [hx, hy] of hubs) for (let i = 0; i < 40 && hv < 14; i++) { const x = hx + rng.int(-110, 110), y = hy + rng.int(-60, 60); if (free(x, y, 96)) { spots.push([x, y, 'h' + (hv % 3)]); hv++; if (i > 30) break; } }
    for (let i = 0; i < 3000 && spots.length < 330; i++) {
      const x = rng.int(70, W - 70), y = rng.int(150, H - 40); const r = rng.int(0, 99);
      const kind = r < 38 ? 't0' : r < 58 ? 't1' : r < 64 ? 't2' : r < 74 ? 'b' : r < 82 ? 'r' : r < 90 ? 'f' : r < 93 ? 'w' : 'y';
      if (!free(x, y, kind.startsWith('t') ? 54 : 34)) continue;
      spots.push([x, y, kind]);
    }
    spots.sort((a, b) => a[1] - b[1]).forEach(([x, y, k]) => {
      if (k[0] === 'h') house(x, y, Number(k[1])); else if (k === 't0') tree(x, y, 0); else if (k === 't1') tree(x, y, 1); else if (k === 't2') tree(x, y, 2);
      else if (k === 'b') bush(x, y); else if (k === 'r') rock(x, y); else if (k === 'f') flowers(x, y); else if (k === 'w') well(x, y); else if (k === 'y') hay(x, y);
      if (k === 'f' || k === 't2') BOARD_FX.sparkles.push({ x, y: y - 20 });
    });
    // brilho final: luz do pôr do sol vindo da direita (rim leve)
    const sunlit = ctx.createLinearGradient(0, 0, W, 0); sunlit.addColorStop(0, 'rgba(90,40,160,0.10)'); sunlit.addColorStop(1, 'rgba(255,170,90,0.10)');
    ctx.fillStyle = sunlit; ctx.fillRect(0, 0, W, H);
  });
  void mix;
}
