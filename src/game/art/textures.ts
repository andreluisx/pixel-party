import type Phaser from 'phaser';
import { PAL } from './palette';
import { createRng } from '@shared/rng';
import { CHARACTER_IDS, type CharacterId } from '@shared/characters';
import { characterFrame, FRAME_H, FRAME_W, type CharAnim } from './characters';
import { drawPuzzle } from './puzzles';
import { SUNSET, drawCloud, drawCrate, drawGroundTile, drawMountains, drawPines, drawPlatformTile, drawScenery, drawSkyBands, drawStars, drawSun, drawWaterTile, STONE } from './scenery';
import { ARENA_H, ARENA_W, TILE, WALL } from '@shared/minigames/caca-moedas';
import { AX0, AX1, AY0, AY1 } from '@shared/minigames/chuva-de-pedras';

/**
 * PIPELINE DE ARTE: sprites são mapas de caracteres (índices de cor da paleta),
 * convertidos em texturas por drawMap(). Para novos sprites: escreva o mapa, registre aqui.
 * ('.' = transparente)
 */
type ColorMap = Record<string, string>;

function drawMap(ctx: CanvasRenderingContext2D, rows: string[], colors: ColorMap, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]!;
      if (c === '.') continue;
      const col = colors[c];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

export function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, frames?: { w: number; count: number }) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  if (frames) for (let i = 0; i < frames.count; i++) tex.add(i, 0, i * frames.w, 0, frames.w, h);
  tex.refresh();
}

// ---------- personagens: spritesheet com todas as animações (ver characters.ts) ----------
function buildCharacter(scene: Phaser.Scene, id: CharacterId) {
  const order: [CharAnim, number][] = [['idle', 0], ['idle', 1], ['walk', 0], ['walk', 1], ['celebrate', 0], ['celebrate', 1], ['lose', 0], ['surprised', 0], ['surprised', 1], ['run', 0], ['run', 1], ['jump', 0], ['fall', 0]];
  canvasTex(scene, `char-${id}`, FRAME_W * order.length, FRAME_H, (ctx) => {
    order.forEach(([anim, f], i) => ctx.drawImage(characterFrame(id, anim, f), i * FRAME_W, 0));
  }, { w: FRAME_W, count: order.length });
}

// ---------- moeda: 4 quadros girando ----------
const COIN = [
  '..oooo..', '.oyyyyo.', 'oyyYyyyo', 'oyyYyyyo', 'oyyYyyyo', 'oyyYyyyo', '.oyyyyo.', '..oooo..',
];
function buildCoin(scene: Phaser.Scene) {
  canvasTex(scene, 'coin', 8 * 4, 8, (ctx) => {
    const tmp = document.createElement('canvas');
    tmp.width = 8; tmp.height = 8;
    const t = tmp.getContext('2d')!;
    t.imageSmoothingEnabled = false;
    drawMap(t, COIN, { o: PAL.coinLo, y: PAL.coin, Y: PAL.coinHi });
    const widths = [8, 5, 2, 5];
    widths.forEach((w, i) => ctx.drawImage(tmp, 0, 0, 8, 8, i * 8 + (8 - w) / 2, 0, w, 8));
  }, { w: 8, count: 4 });
}

/** Chuva de Pedras: arena de pedra pequena e limpa sobre o vazio, e a pedra gigante (24x24) vista de cima. */
function buildRainTextures(scene: Phaser.Scene) {
  canvasTex(scene, 'rain-bg', 480, 270, (ctx) => {
    const rng = createRng(808);
    drawScenery(ctx, 480, 270, { ...SUNSET, sun: { x: 0.9, y: 0.5, r: 16, core: '#fff2b0', glow: '#ffd070' } }, 808); // mesmo mundo dos outros cenários
    ctx.fillStyle = 'rgba(13,8,40,0.35)'; ctx.fillRect(0, 0, 480, 270); // escurece para a arena se destacar
    const w = AX1 - AX0, h = AY1 - AY0;
    ctx.fillStyle = '#0a0620'; ctx.fillRect(AX0 - 10, AY0 - 10, w + 20, h + 20 + 4); // sombra/moldura
    ctx.fillStyle = '#6a4aa8'; ctx.fillRect(AX0 - 8, AY0 - 8, w + 16, h + 16);
    ctx.fillStyle = '#2b1a5c'; ctx.fillRect(AX0 - 6, AY0 - 6, w + 12, h + 12);
    for (let ty = 0; ty < h; ty += 16) for (let tx = 0; tx < w; tx += 16) { // piso de pedra claro (boa visibilidade da marcação vermelha)
      const odd = (tx / 16 + ty / 16) % 2 === 0;
      ctx.fillStyle = odd ? '#a79fc4' : '#9d94bd'; ctx.fillRect(AX0 + tx, AY0 + ty, 16, 16);
      ctx.fillStyle = '#847ba6'; ctx.fillRect(AX0 + tx, AY0 + ty, 16, 1); ctx.fillRect(AX0 + tx, AY0 + ty, 1, 16);
      for (let k = 0; k < 3; k++) { ctx.fillStyle = rng.chance(0.5) ? '#b7afd2' : '#8e86ae'; ctx.fillRect(AX0 + tx + rng.int(1, 14), AY0 + ty + rng.int(1, 14), rng.int(1, 2), 1); }
    }
    ctx.fillStyle = 'rgba(30,18,70,0.35)'; ctx.fillRect(AX0, AY0, w, 3); ctx.fillRect(AX0, AY0, 3, h); // sombra interna da moldura
    ctx.fillStyle = '#ffd23d'; for (const [cx, cy] of [[AX0 - 8, AY0 - 8], [AX1 + 4, AY0 - 8], [AX0 - 8, AY1 + 4], [AX1 + 4, AY1 + 4]] as const) ctx.fillRect(cx, cy, 4, 4);
    ctx.fillStyle = '#ffd23d'; ctx.fillRect(AX0 - 8, AY0 - 8, w + 16, 1); ctx.fillRect(AX0 - 8, AY1 + 7, w + 16, 1); ctx.fillRect(AX0 - 8, AY0 - 8, 1, h + 16); ctx.fillRect(AX1 + 7, AY0 - 8, 1, h + 16);
  });
  canvasTex(scene, 'boulder', 24, 24, (ctx) => {
    const rng = createRng(77); const cols = ['#2a2438', '#463f5c', '#645d82', '#847da3', '#a9a3c4', '#cdc8e0'];
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const dx = x - 11.5, dy = y - 11.5, d = Math.hypot(dx, dy) + Math.sin((Math.atan2(dy, dx) * 5) + 1) * 0.7;
      if (d > 11.5) continue;
      if (d > 10.3) { ctx.fillStyle = PAL.ink; ctx.fillRect(x, y, 1, 1); continue; }
      const light = (-dx * 0.55 - dy * 0.7) / 11.5; // luz vindo de cima à esquerda
      const idx = Math.max(1, Math.min(5, Math.round(3 + light * 2.2 + (rng.next() - 0.5) * 0.9)));
      ctx.fillStyle = cols[idx]!; ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = cols[0]!; for (const [x, y, l] of [[8, 9, 5], [13, 14, 4], [6, 15, 3]] as const) for (let i = 0; i < l; i++) ctx.fillRect(x + i, y + (i % 2), 1, 1); // rachaduras
    ctx.fillStyle = cols[5]!; ctx.fillRect(7, 6, 3, 1); ctx.fillRect(6, 7, 1, 2);
  });
}

function buildRock(scene: Phaser.Scene) {
  canvasTex(scene, 'rock', TILE, TILE, (ctx) => {
    // sombra no chão + pedra com luz no canto superior esquerdo
    ctx.fillStyle = 'rgba(15,40,25,0.35)'; ctx.fillRect(3, 13, 11, 2); ctx.fillRect(2, 12, 13, 1);
    const cx = 7.5, cy = 8, rx = 6.6, ry = 5.2;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
      if (d > 1.18) continue;
      if (d > 0.98) { ctx.fillStyle = PAL.ink; ctx.fillRect(x, y, 1, 1); continue; }
      const light = -dx * 0.55 - dy * 0.85;
      ctx.fillStyle = light > 0.55 ? PAL.stoneHi : light > 0.1 ? '#b3b0c6' : light > -0.35 ? PAL.stone1 : light > -0.7 ? PAL.stone2 : PAL.stone3;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = PAL.stone3; for (const [x, y] of [[8, 7], [9, 8], [6, 10], [10, 6]] as const) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = '#6fbf5a'; ctx.fillRect(4, 11, 2, 1); ctx.fillRect(10, 11, 1, 1); // musgo
  });
}

function buildShadow(scene: Phaser.Scene) {
  canvasTex(scene, 'shadow', 12, 5, (ctx) => {
    drawMap(ctx, ['...xxxxxx...', '.xxxxxxxxxx.', 'xxxxxxxxxxxx', '.xxxxxxxxxx.', '...xxxxxx...'], { x: 'rgba(20,10,40,0.38)' });
  });
}

function buildSpark(scene: Phaser.Scene) {
  canvasTex(scene, 'spark', 3, 3, (ctx) => { drawMap(ctx, ['.y.', 'yYy', '.y.'], { y: PAL.coin, Y: PAL.coinHi }); });
}

function buildMarker(scene: Phaser.Scene) {
  // triângulo apontando para baixo (cor definida por tint)
  canvasTex(scene, 'marker', 7, 4, (ctx) => { drawMap(ctx, ['wwwwwww', '.wwwww.', '..www..', '...w...'], { w: '#ffffff' }); });
}

function buildTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: () => number) {
  // árvore 16x16: copa redonda com 4 tons (luz no canto superior esquerdo), contorno e tronco
  ctx.fillStyle = 'rgba(15,40,25,0.30)'; ctx.fillRect(x + 3, y + 14, 10, 2);
  ctx.fillStyle = PAL.ink; ctx.fillRect(x + 7, y + 13, 3, 3);
  ctx.fillStyle = '#6b4423'; ctx.fillRect(x + 8, y + 13, 1, 3);
  const cx = 8, cy = 7, R = 7;
  const tones = ['#8be06a', '#5fc45a', '#2f9a4a', '#1f7a3a', '#175c2e'];
  for (let py = 0; py < 15; py++) for (let px = 0; px < 16; px++) {
    const dx = px + 0.5 - cx, dy = py + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > R + 1) continue;
    if (d > R) { ctx.fillStyle = PAL.ink; ctx.fillRect(x + px, y + py, 1, 1); continue; }
    const light = (-dx * 0.6 - dy * 0.8) / R;
    const noise = ((px * 7 + py * 13) % 5) / 40;
    const v = light + noise;
    ctx.fillStyle = tones[v > 0.5 ? 0 : v > 0.1 ? 1 : v > -0.3 ? 2 : v > -0.65 ? 3 : 4]!;
    ctx.fillRect(x + px, y + py, 1, 1);
  }
  ctx.fillStyle = '#175c2e'; for (const [px, py] of [[6, 7], [9, 5], [10, 9], [5, 10]] as const) ctx.fillRect(x + px, y + py, 2, 1);
  if (r() < 0.5) { ctx.fillStyle = '#ff8fc1'; ctx.fillRect(x + 4 + Math.floor(r() * 8), y + 4 + Math.floor(r() * 6), 1, 1); ctx.fillStyle = '#ffd1e6'; }
}

function buildArenaBg(scene: Phaser.Scene) {
  canvasTex(scene, 'arena-bg', ARENA_W, ARENA_H, (ctx) => {
    const rng = createRng(2024);
    // grama em duas tonalidades com manchas pontilhadas, tufos, flores e pedrinhas
    for (let y = 0; y < ARENA_H; y += TILE) {
      for (let x = 0; x < ARENA_W; x += TILE) {
        ctx.fillStyle = ((x / TILE + y / TILE) & 1) === 0 ? '#58b850' : '#52b04b';
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
    for (let i = 0; i < (ARENA_W * ARENA_H) / 260; i++) { // manchas escuras/claras (dither)
      const px = rng.int(0, ARENA_W - 6), py = rng.int(0, ARENA_H - 6), dark = rng.chance(0.55);
      ctx.fillStyle = dark ? '#47a443' : '#66c357';
      for (let k = 0; k < 6; k++) ctx.fillRect(px + rng.int(0, 5), py + rng.int(0, 4), 1, 1);
    }
    for (let i = 0; i < (ARENA_W * ARENA_H) / 230; i++) { // tufos em "v"
      const px = rng.int(2, ARENA_W - 3), py = rng.int(2, ARENA_H - 3);
      ctx.fillStyle = '#459c43'; ctx.fillRect(px, py, 1, 2); ctx.fillRect(px + 2, py, 1, 2);
      ctx.fillStyle = '#6fcf5c'; ctx.fillRect(px + 1, py + 1, 1, 1);
    }
    const flowers = ['#ffd1e6', '#fff3a8', '#ffffff', '#ff8fc1'];
    for (let i = 0; i < (ARENA_W * ARENA_H) / 1500; i++) {
      const px = rng.int(10, ARENA_W - 12), py = rng.int(10, ARENA_H - 12);
      ctx.fillStyle = flowers[rng.int(0, 3)]!; ctx.fillRect(px, py, 1, 1);
      ctx.fillStyle = '#ffd23d'; ctx.fillRect(px, py + 1, 1, 1);
    }
    // anel de árvores
    const r = () => rng.next();
    for (let x = 0; x < ARENA_W; x += TILE) { buildTree(ctx, x, 0, r); buildTree(ctx, x, ARENA_H - WALL, r); }
    for (let y = WALL; y < ARENA_H - WALL; y += TILE) { buildTree(ctx, 0, y, r); buildTree(ctx, ARENA_W - WALL, y, r); }
    // vinheta suave nas bordas
    const g = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, ARENA_H * 0.45, ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.62);
    g.addColorStop(0, 'rgba(10,30,30,0)'); g.addColorStop(1, 'rgba(10,20,40,0.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  });
}

// ---------- texturas da Corrida Maluca ----------
function buildRaceTextures(scene: Phaser.Scene) {
  canvasTex(scene, 'ground', 16, 40, (ctx) => drawGroundTile(ctx, 16, 40));
  canvasTex(scene, 'pit', 16, 10, (ctx) => drawWaterTile(ctx, 16, 10));
  canvasTex(scene, 'plank', 16, 16, (ctx) => drawPlatformTile(ctx, 16, 16));
  canvasTex(scene, 'crate', 12, 13, (ctx) => drawCrate(ctx));
  canvasTex(scene, 'spring', 12, 8, (ctx) => {
    drawMap(ctx, ['.rrrrrrrrrr.', 'orrRRRRRRrro', '.oooooooooo.', '..o.o.o.o...'.slice(0, 12), '...oggggo...', '..oggggggo..'.slice(0, 12), '..oooooooo..', 'oooooooooooo'], { o: PAL.ink, r: '#e05252', R: '#ff9a8a', g: '#9a97ad' });
  });
  canvasTex(scene, 'checker', 8, 8, (ctx) => {
    ctx.fillStyle = '#f4efe0'; ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, 4, 4); ctx.fillRect(4, 4, 4, 4);
  });
  canvasTex(scene, 'sky-lane', 480, 67, (ctx) => {
    drawSkyBands(ctx, 480, 67, SUNSET.sky);
    drawStars(ctx, 480, 22, 26, 11);
    drawSun(ctx, 378, 44, 9, SUNSET.sun!.core, SUNSET.sun!.glow);
  });
  canvasTex(scene, 'hills', 128, 40, (ctx) => {
    drawMountains(ctx, 128, 40, { body: '#7a3b9c', rim: '#c070b8', base: 0.5, amp: 0.22, freq: 1, seed: 3 }, true);
    drawMountains(ctx, 128, 40, { body: '#4f2a86', rim: '#8a4cae', base: 0.68, amp: 0.18, freq: 2, seed: 8 }, true);
    drawPines(ctx, 128, 40, { col: '#38267a', rim: '#6a4aa8', base: 0.97, hmin: 0.2, hmax: 0.32, step: 8 }, 41, true);
  });
  canvasTex(scene, 'clouds', 160, 30, (ctx) => {
    drawCloud(ctx, 8, 4, 30, SUNSET.cloud); drawCloud(ctx, 68, 15, 40, SUNSET.cloud); drawCloud(ctx, 122, 2, 26, SUNSET.cloud);
  });
}

// ---------- texturas do Reflexo Relâmpago e fonte de números ----------
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'], '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'], G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['111', '101', '101', '101', '101'], O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'], R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'], W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'], '!': ['010', '010', '010', '000', '010'], '?': ['110', '001', '010', '000', '010'],
  ':': ['000', '010', '000', '010', '000'], '/': ['001', '001', '010', '100', '100'],
};
/** Fonte de pixel 3x5: números, A-Z (sem acento) e alguns símbolos. */
export const DIGIT_FRAMES = '0123456789+-ABCDEFGHIJKLMNOPQRSTUVWXYZ!?:/';

function buildReflexTextures(scene: Phaser.Scene) {
  canvasTex(scene, 'digits', 3 * DIGIT_FRAMES.length, 5, (ctx) => {
    ctx.fillStyle = '#ffffff';
    [...DIGIT_FRAMES].forEach((ch, i) => DIGITS[ch]!.forEach((row, y) => { for (let x = 0; x < 3; x++) if (row[x] === '1') ctx.fillRect(i * 3 + x, y, 1, 1); }));
  }, { w: 3, count: DIGIT_FRAMES.length });
  canvasTex(scene, 'arrow', 14, 14, (ctx) => {
    drawMap(ctx, [
      '......o.......', '......oo......', '......oAo.....', '......oAAo....', 'oooooooAAAo...', 'oAAAAAAAAAAo..', 'oAAAAAAAAAAAo.',
      'oAAAAAAAAAAAo.', 'oAAAAAAAAAAo..', 'oooooooAAAo...', '......oAAo....', '......oAo.....', '......oo......', '......o.......',
    ], { o: PAL.ink, A: '#ffffff' });
  });
  canvasTex(scene, 'check', 12, 12, (ctx) => {
    drawMap(ctx, ['............', '..........oo', '.........ogo', '........ogo.', '.oo....ogo..', 'ogo...ogo...', '.ogo.ogo....', '..ogogo.....', '...ogo......', '....o.......', '............', '............'], { o: PAL.ink, g: '#6dff8a' });
  });
  canvasTex(scene, 'cross', 12, 12, (ctx) => {
    drawMap(ctx, ['............', '.oo......oo.', 'orro....orro', '.orro..orro.', '..orrooorr..', '...orrrro...', '...orrrro...', '..orrooorr..', '.orro..orro.', 'orro....orro', '.oo......oo.', '............'], { o: PAL.ink, r: '#ff5d5d' });
  });
  canvasTex(scene, 'star8', 8, 8, (ctx) => {
    drawMap(ctx, ['...oo...', '..oyyo..', '.oyyyyo.', 'oyyYYyyo', '.oyyyyo.', '.oyooyo.', 'oyo..oyo', 'oo....oo'], { o: PAL.coinLo, y: PAL.coin, Y: PAL.coinHi });
  });
}

function buildBoot(scene: Phaser.Scene) {
  canvasTex(scene, 'boot', 12, 12, (ctx) => {
    drawMap(ctx, [
      '............', '...oooo.....', '...oBBo.....', '...oBBo.....', '...oBBo..y..', '...oBBooo.y.', '..oBBBBBBo..', '.oBBBBBBBBo.', '.oBBBBBBBBo.', '.oWWWWWWWWo.', '.oooooooooo.', '............',
    ], { o: PAL.ink, B: '#3d8bff', W: '#f4efe0', y: PAL.coin });
  });
}

// ---------- texturas do Piso de LED ----------
function buildLedTextures(scene: Phaser.Scene) {
  const T = 34;
  canvasTex(scene, 'led-on', T, T, (ctx) => {
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, T, T);                 // contorno
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(1, 1, T - 2, T - 2);       // moldura
    ctx.fillStyle = '#ffffff'; ctx.fillRect(3, 3, T - 6, T - 6);       // placa (recebe a cor por tint)
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(3, T - 6, T - 6, 3); ctx.fillRect(T - 6, 3, 3, T - 6); // sombra inferior/direita
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(5, 5, T - 12, 2); ctx.fillRect(5, 5, 2, T - 12); // brilho
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(T / 2 - 1, 7, 2, T - 14); ctx.fillRect(7, T / 2 - 1, T - 14, 2); // divisões do LED
  });
  canvasTex(scene, 'led-off', T, T, (ctx) => {
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#26204d'; ctx.fillRect(1, 1, T - 2, T - 2);
    ctx.fillStyle = '#14102b'; ctx.fillRect(3, 3, T - 6, T - 6);
    ctx.fillStyle = '#2a2556'; ctx.fillRect(3, 3, T - 6, 1); ctx.fillRect(3, 3, 1, T - 6);
    ctx.fillStyle = '#1d1840'; ctx.fillRect(T / 2 - 1, 7, 2, T - 14); ctx.fillRect(7, T / 2 - 1, T - 14, 2);
  });
  const shapes: string[][] = [
    ['...##...', '...##...', '..####..', '..####..', '.######.', '.######.', '########', '########'],   // triângulo
    ['..####..', '.######.', '########', '########', '########', '########', '.######.', '..####..'],   // círculo
    ['........', '.######.', '.######.', '.######.', '.######.', '.######.', '.######.', '........'],   // quadrado
    ['...##...', '..####..', '.######.', '########', '########', '.######.', '..####..', '...##...'],   // losango
    ['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...'],   // cruz
  ];
  shapes.forEach((rows, i) => canvasTex(scene, `shape-${i}`, 8, 8, (ctx) => drawMap(ctx, rows.map((r) => r.replace(/#/g, 'k')), { k: 'rgba(27,16,48,0.85)' })));
}

// ---------- texturas do Último Disparo ----------
function buildDuelTextures(scene: Phaser.Scene) {
  canvasTex(scene, 'pillar', 16, 16, (ctx) => {
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#7a7791'; ctx.fillRect(1, 1, 14, 14);
    ctx.fillStyle = '#c8c6d8'; ctx.fillRect(1, 1, 14, 2); ctx.fillRect(1, 1, 2, 14);
    ctx.fillStyle = '#3a3858'; ctx.fillRect(1, 13, 14, 2); ctx.fillRect(13, 1, 2, 14);
    ctx.fillStyle = '#58566f'; ctx.fillRect(4, 4, 8, 8);
    ctx.fillStyle = '#9a97ad'; ctx.fillRect(4, 4, 8, 1); ctx.fillRect(4, 4, 1, 8);
    ctx.fillStyle = '#ffd23d'; for (const [x, y] of [[2, 2], [12, 2], [2, 12], [12, 12]]) ctx.fillRect(x!, y!, 2, 2);
  });
  canvasTex(scene, 'floor-stone', 32, 32, (ctx) => {
    const rng = createRng(91);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#241e4c' : '#2a2458'; ctx.fillRect(x * 16, y * 16, 16, 16);
      ctx.fillStyle = '#1a1540'; ctx.fillRect(x * 16, y * 16, 16, 1); ctx.fillRect(x * 16, y * 16, 1, 16);
      ctx.fillStyle = '#34306a'; for (let i = 0; i < 4; i++) ctx.fillRect(x * 16 + rng.int(2, 13), y * 16 + rng.int(2, 13), 1, 1);
    }
  });
  canvasTex(scene, 'hazard', 16, 16, (ctx) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { ctx.fillStyle = ((x + y) >> 2) % 2 === 0 ? '#ffb02e' : '#2a1a10'; ctx.fillRect(x, y, 1, 1); }
  });
  canvasTex(scene, 'bullet', 8, 8, (ctx) => {
    drawMap(ctx, ['..aaaa..', '.aBBBBa.', 'aBWWWWBa', 'aBWWWWBa', 'aBWWWWBa', 'aBWWWWBa', '.aBBBBa.', '..aaaa..'], { a: '#8a8aa0', B: '#d8d8e8', W: '#ffffff' });
  });
  canvasTex(scene, 'reticle', 26, 26, (ctx) => {
    ctx.fillStyle = '#ffffff';
    for (let a = 0; a < 360; a += 3) { const r = (a * Math.PI) / 180; ctx.fillRect(Math.round(13 + Math.cos(r) * 10), Math.round(13 + Math.sin(r) * 10), 1, 1); }
    for (const [x, y, w, h] of [[12, 0, 2, 5], [12, 21, 2, 5], [0, 12, 5, 2], [21, 12, 5, 2]] as const) ctx.fillRect(x, y, w, h);
  });
}

// ---------- texturas do Duelo de Arqueiros ----------
function bres(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string) {
  ctx.fillStyle = col;
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
  for (;;) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}

function buildArcherTextures(scene: Phaser.Scene) {
  canvasTex(scene, 'archer-bg', 480, 270, (ctx) => drawScenery(ctx, 480, 270, { ...SUNSET, sun: { x: 0.8, y: 0.6, r: 20, core: '#fff2b0', glow: '#ffd070' }, forests: [
    { col: '#38267a', rim: '#6a4aa8', base: 0.80, hmin: 0.09, hmax: 0.17, step: 9 },
    { col: '#231552', rim: '#4a3a88', base: 0.92, hmin: 0.12, hmax: 0.21, step: 13 },
  ] }, 404));
  canvasTex(scene, 'dirt', 16, 16, (ctx) => {
    const rng = createRng(7); ctx.fillStyle = '#7a5230'; ctx.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 14; i++) { ctx.fillStyle = rng.chance(0.5) ? '#5a3a1a' : '#8f6238'; ctx.fillRect(rng.int(0, 14), rng.int(0, 14), 2, 1); }
  });
  canvasTex(scene, 'column', 14, 34, (ctx) => {
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, 14, 34);
    ctx.fillStyle = STONE.body; ctx.fillRect(1, 1, 12, 32);
    ctx.fillStyle = STONE.hi; ctx.fillRect(1, 1, 3, 32); ctx.fillStyle = STONE.mid; ctx.fillRect(4, 1, 2, 32);
    ctx.fillStyle = STONE.lo; ctx.fillRect(10, 1, 3, 32);
    ctx.fillStyle = STONE.line; for (let y = 8; y < 32; y += 8) ctx.fillRect(1, y, 12, 1);
    ctx.fillStyle = STONE.hi; ctx.fillRect(0, 0, 14, 3); ctx.fillStyle = PAL.ink; ctx.fillRect(0, 3, 14, 1);
    ctx.fillStyle = '#ffd23d'; ctx.fillRect(5, 12, 4, 4); ctx.fillStyle = '#fff3a8'; ctx.fillRect(5, 12, 2, 2);
  });
  canvasTex(scene, 'bow', 14, 18, (ctx) => {
    for (let y = 0; y < 18; y++) { const x = 4 + Math.round(6 * Math.sin((Math.PI * y) / 17)); ctx.fillStyle = PAL.ink; ctx.fillRect(x - 1, y, 3, 1); ctx.fillStyle = '#b5833f'; ctx.fillRect(x, y, 1, 1); }
    ctx.fillStyle = '#f4efe0'; ctx.fillRect(4, 1, 1, 16);
  });
  canvasTex(scene, 'arrow-n', 14, 3, (ctx) => { ctx.fillStyle = '#cdbf95'; ctx.fillRect(1, 1, 10, 1); ctx.fillStyle = '#e05252'; ctx.fillRect(0, 0, 3, 1); ctx.fillRect(0, 2, 3, 1); ctx.fillStyle = '#cfd2e8'; ctx.fillRect(11, 0, 1, 3); ctx.fillRect(12, 1, 2, 1); });
  canvasTex(scene, 'arrow-f', 14, 3, (ctx) => { ctx.fillStyle = '#8a5a2b'; ctx.fillRect(1, 1, 9, 1); ctx.fillStyle = '#ffb02e'; ctx.fillRect(0, 0, 3, 1); ctx.fillRect(0, 2, 3, 1); ctx.fillStyle = '#ff7a2a'; ctx.fillRect(9, 0, 3, 3); ctx.fillStyle = '#ffd34d'; ctx.fillRect(11, 1, 3, 1); });
  canvasTex(scene, 'heart', 8, 8, (ctx) => { drawMap(ctx, ['.oo..oo.', 'orrooRro', 'orrrrrro', 'orrrrrro', '.orrrro.', '..orro..', '...oo...', '........'], { o: PAL.ink, r: '#ff5d5d', R: '#ffb0b0' }); });
  canvasTex(scene, 'ico-skull', 8, 8, (ctx) => { drawMap(ctx, ['.oooooo.', 'owwwwwwo', 'owwwwwwo', 'oo.ww.oo', 'owwwwwwo', '.owwwwo.', '.owowowo', '..o.o.o.'], { o: PAL.ink, w: '#f4efe0' }); });
  canvasTex(scene, 'ico-target', 8, 8, (ctx) => { drawMap(ctx, ['..oooo..', '.orrrro.', 'orwwwwro', 'orwrrwro', 'orwrrwro', 'orwwwwro', '.orrrro.', '..oooo..'], { o: PAL.ink, r: '#ff5d5d', w: '#f4efe0' }); });
  canvasTex(scene, 'heart-empty', 8, 8, (ctx) => { drawMap(ctx, ['.oo..oo.', 'oddoodd o'.replace(' ', ''), 'odddddd o'.replace(' ', ''), 'odddddd o'.replace(' ', ''), '.odddd o.'.replace(' ', ''), '..oddo..', '...oo...', '........'], { o: PAL.ink, d: '#3a2c4a' }); });
  canvasTex(scene, 'pk-fire', 12, 12, (ctx) => {
    drawMap(ctx, ['.....oo.....', '....oyyo....', '...oyyyyo...', '...oyRRyo...', '..oyyRRyyo..', '..oyRRRRyo..', '.oyyRrrRyyo.', '.oyRrrrrRyo.', '.oyRrrrrRyo.', '..oyRrrRyo..', '...oyyyyo...', '....oooo....'], { o: PAL.ink, y: '#ffd34d', R: '#ff7a2a', r: '#ff4d2a' });
  });
  canvasTex(scene, 'pk-shield', 12, 12, (ctx) => {
    drawMap(ctx, ['.oooooooooo.', 'oBBBBBBBBBBo', 'oBwwBBBBBBBo', 'oBwBBBBBBBBo', 'oBBBBBBBBBBo', 'oBBBBBBBBBBo', '.oBBBBBBBBo.', '.oBBBBBBBBo.', '..oBBBBBBo..', '...oBBBBo...', '....oBBo....', '.....oo.....'], { o: PAL.ink, B: '#4da3ff', w: '#ffffff' });
  });
  canvasTex(scene, 'pk-triple', 12, 12, (ctx) => {
    for (const [x0, y0, x1, y1] of [[1, 6, 9, 6], [1, 10, 8, 3], [1, 2, 8, 9]] as const) bres(ctx, x0, y0, x1, y1, '#f4efe0');
    ctx.fillStyle = '#ffd34d'; for (const [x, y] of [[10, 6], [9, 3], [9, 9]] as const) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = '#e05252'; for (const [x, y] of [[0, 6], [0, 10], [0, 2]] as const) ctx.fillRect(x, y, 2, 1);
  });
  canvasTex(scene, 'shield-bubble', 24, 24, (ctx) => {
    for (let a = 0; a < 360; a += 4) { const r = (a * Math.PI) / 180; ctx.fillStyle = a % 40 < 20 ? '#9ad0ff' : '#4da3ff'; ctx.fillRect(Math.round(12 + Math.cos(r) * 10.5), Math.round(12 + Math.sin(r) * 10.5), 1, 1); }
    ctx.fillStyle = 'rgba(120,200,255,0.18)'; ctx.beginPath(); ctx.arc(12, 12, 10, 0, Math.PI * 2); ctx.fill();
  });
}

export function buildAllTextures(scene: Phaser.Scene) {
  buildArcherTextures(scene);
  buildDuelTextures(scene);
  buildLedTextures(scene);
  buildBoot(scene);
  buildRaceTextures(scene);
  buildReflexTextures(scene);
  for (const id of CHARACTER_IDS) buildCharacter(scene, id);
  buildCoin(scene);
  buildRock(scene);
  buildRainTextures(scene);
  buildShadow(scene);
  buildSpark(scene);
  buildMarker(scene);
  buildArenaBg(scene);
}

/** Cria (uma vez) as texturas de uma imagem do quebra-cabeça: a imagem inteira e as 16 peças 6x6. */
export function ensurePuzzleTextures(scene: Phaser.Scene, picture: number) {
  canvasTex(scene, `puzfull-${picture}`, 24, 24, (ctx) => drawPuzzle(picture, ctx));
  canvasTex(scene, `puzp-${picture}`, 6 * 16, 6, (ctx) => {
    const tmp = document.createElement('canvas'); tmp.width = 24; tmp.height = 24;
    const t = tmp.getContext('2d')!; drawPuzzle(picture, t);
    for (let k = 0; k < 16; k++) ctx.drawImage(tmp, (k % 4) * 6, Math.floor(k / 4) * 6, 6, 6, k * 6, 0, 6, 6);
  }, { w: 6, count: 16 });
}
