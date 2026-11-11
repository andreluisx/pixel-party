import type Phaser from 'phaser';
import { PAL } from './palette';
import { createRng } from '@shared/rng';
import { ARENA_H, ARENA_W, TILE, WALL } from '@shared/minigames/pipeline-test';

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

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, frames?: { w: number; count: number }) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  if (frames) for (let i = 0; i < frames.count; i++) tex.add(i, 0, i * frames.w, 0, frames.w, h);
  tex.refresh();
}

// ---------- personagens: silhueta própria por chapéu/cabelo (12x16, 2 quadros de caminhada) ----------
const FACE = [
  '.osssssssso.',
  '.osesssseso.',
  '.osssssssso.',
  '.osssssssso.',
  '..oossssoo..',
];
const BODY = [
  '.obbbbbbbbo.',
  'ossbbbbbbsso',
  '.obbbbbbbbo.',
  '..obbbbbbo..',
];
const LEGS_A = ['..opp..ppo..', '..off..ffo..', '..ooo..ooo..'];
const LEGS_B = ['..opp..ppo..', '.offo..offo.', '.oooo..oooo.'];

interface CharDef { top: string[]; faceOverride?: Record<number, string>; colors: ColorMap }
const CHARACTERS: Record<string, CharDef> = {
  explorer: {
    top: ['...oooooo...', '..ohhhhhho..', '.ohhhhhhhho.', 'oHHHHHHHHHHo'],
    colors: { h: '#8a5a2b', H: '#d9a441', b: '#3f7fe0', p: '#2a3f8f', f: '#5a3a1a' },
  },
  aventureira: {
    top: ['.oHo.oo.oHo.', '.ohhhhhhhho.', 'ohhhhhhhhhho', 'ohhsssssshho'],
    colors: { h: '#e0523a', H: '#ff8fc1', b: '#ff7fb5', p: '#a84f8f', f: '#5a2a4a' },
  },
  mago: {
    top: ['.....oo.....', '....ohho....', '..oohhhhoo..', 'ooHHHHHHHHoo'],
    faceOverride: { 3: '.oswwwwwwso.', 4: '..oowwwwoo..' },
    colors: { h: '#6a3fb5', H: '#f5b83d', b: '#7a4fc5', p: '#4a2a85', f: '#2a1a50', w: '#f4efe0' },
  },
  arqueiro: {
    top: ['..oooooooo..', '.ohhhhhhhho.', 'ohhHHHHHHhho', 'ohhsssssshho'],
    colors: { h: '#3a9a4a', H: '#256f34', b: '#2f7d3a', p: '#5a3a1a', f: '#3a2410' },
  },
};

export const CHARACTER_W = 12;
export const CHARACTER_H = 16;

function buildCharacter(scene: Phaser.Scene, id: string, def: CharDef) {
  const base: ColorMap = { o: PAL.ink, s: PAL.skin, e: PAL.ink, ...def.colors };
  const face = [...FACE];
  if (def.faceOverride) for (const [i, row] of Object.entries(def.faceOverride)) face[Number(i)] = row;
  const rowsFor = (legs: string[]) => [...def.top, ...face, ...BODY, ...legs];
  canvasTex(scene, `char-${id}`, CHARACTER_W * 2, CHARACTER_H, (ctx) => {
    drawMap(ctx, rowsFor(LEGS_A), base, 0, 0);
    drawMap(ctx, rowsFor(LEGS_B), base, CHARACTER_W, 0);
  }, { w: CHARACTER_W, count: 2 });
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

function buildRock(scene: Phaser.Scene) {
  canvasTex(scene, 'rock', TILE, TILE, (ctx) => {
    drawMap(ctx, [
      '................',
      '....oooooooo....',
      '..ooHHHHSSSSoo..',
      '.oHHHHSSSSSSSso.',
      '.oHHSSSSSSSSSso.',
      'oHHSSSSSDSSSSSso',
      'oHSSSSSSSSSSDSso',
      'oSSSDSSSSSSSSSso',
      'oSSSSSSSSDSSSSdo',
      'oSSSSSSSSSSSSSdo',
      '.oSSSSDSSSSSSdo.',
      '.oSSSSSSSSSSddo.',
      '..oodddddddddoo.',
      '....oooooooooo..',
      '................',
      '................',
    ], { o: PAL.ink, H: PAL.stoneHi, S: PAL.stone1, D: PAL.stone2, d: PAL.stone3 });
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
  // arbusto/árvore em 16x16 com contorno e luz
  drawMap(ctx, [
    '....oooooooo....',
    '..ooLLLLMMMMoo..',
    '.oLLLLMMMMMMMMo.',
    'oLLLMMMMMMMDMMMo',
    'oLLMMMMDMMMMMMDo',
    'oLMMMMMMMMMDMMDo',
    'oMMMDMMMMMMMMDDo',
    'oMMMMMMMDMMMDDDo',
    'oMDMMMMMMMMDDDDo',
    'oMMMMMDMMDDDDDDo',
    '.oMMMMMMDDDDDDo.',
    '.ooMMMDDDDDDDoo.',
    '..ooDDDDDDDDoo..',
    '....ooTTTToo....',
    '.....oTTTTo.....',
    '......oooo......',
  ], { o: PAL.ink, L: '#5fc45a', M: PAL.leaf1, D: PAL.leaf2, T: '#6b4423' }, x, y);
  if (r() < 0.5) { ctx.fillStyle = '#ff8fc1'; ctx.fillRect(x + 4 + Math.floor(r() * 8), y + 4 + Math.floor(r() * 6), 1, 1); }
}

function buildArenaBg(scene: Phaser.Scene) {
  canvasTex(scene, 'arena-bg', ARENA_W, ARENA_H, (ctx) => {
    const rng = createRng(2024);
    // grama xadrez suave + detalhes
    for (let y = 0; y < ARENA_H; y += TILE) {
      for (let x = 0; x < ARENA_W; x += TILE) {
        ctx.fillStyle = ((x / TILE + y / TILE) & 1) === 0 ? PAL.grass1 : PAL.grass2;
        ctx.fillRect(x, y, TILE, TILE);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = rng.chance(0.5) ? PAL.grass3 : '#6bc660';
          ctx.fillRect(x + rng.int(0, 15), y + rng.int(0, 15), 1, rng.chance(0.3) ? 2 : 1);
        }
        if (rng.chance(0.04)) { ctx.fillStyle = '#fff3a8'; ctx.fillRect(x + rng.int(2, 13), y + rng.int(2, 13), 2, 2); }
      }
    }
    // anel de árvores
    const r = () => rng.next();
    for (let x = 0; x < ARENA_W; x += TILE) { buildTree(ctx, x, 0, r); buildTree(ctx, x, ARENA_H - WALL, r); }
    for (let y = WALL; y < ARENA_H - WALL; y += TILE) { buildTree(ctx, 0, y, r); buildTree(ctx, ARENA_W - WALL, y, r); }
  });
}

export function buildAllTextures(scene: Phaser.Scene) {
  for (const [id, def] of Object.entries(CHARACTERS)) buildCharacter(scene, id, def);
  buildCoin(scene);
  buildRock(scene);
  buildShadow(scene);
  buildSpark(scene);
  buildMarker(scene);
  buildArenaBg(scene);
}
