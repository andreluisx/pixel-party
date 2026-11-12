import type Phaser from 'phaser';
import { PAL } from './palette';
import { createRng } from '@shared/rng';
import { CHARACTER_IDS, type CharacterId } from '@shared/characters';
import { characterFrame, FRAME_H, FRAME_W, type CharAnim } from './characters';
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

// ---------- personagens: spritesheet com todas as animações (ver characters.ts) ----------
function buildCharacter(scene: Phaser.Scene, id: CharacterId) {
<<<<<<< HEAD
  const order: [CharAnim, number][] = [['idle', 0], ['idle', 1], ['walk', 0], ['walk', 1], ['celebrate', 0], ['celebrate', 1], ['lose', 0], ['surprised', 0], ['surprised', 1], ['run', 0], ['run', 1], ['jump', 0], ['fall', 0]];
=======
  const order: [CharAnim, number][] = [['idle', 0], ['idle', 1], ['walk', 0], ['walk', 1], ['celebrate', 0], ['celebrate', 1], ['lose', 0], ['surprised', 0], ['surprised', 1]];
>>>>>>> 89dd3df16bc6020c7711e0f3b84fc20dd55f6ec5
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

// ---------- texturas da Corrida Maluca ----------
function buildRaceTextures(scene: Phaser.Scene) {
  canvasTex(scene, 'ground', 16, 10, (ctx) => {
    drawMap(ctx, [
      'LLLLLLLLLLLLLLLL', 'GGGGGGGGGGGGGGGG', 'GgGGGgGGGGGgGGGG', 'ddddddddddddddddd'.slice(0, 16),
      'DDDDDDDDDDDDDDDD', 'DDdDDDDDDDdDDDDD', 'DDDDDDdDDDDDDDDD', 'DdDDDDDDDDDdDDDD', 'DDDDDDDDDdDDDDDD', 'dDDDDDDDDDDDDDdD',
    ], { L: '#7fd66a', G: PAL.grass1, g: PAL.grass3, d: '#4a2e16', D: '#7a5230' });
  });
  canvasTex(scene, 'pit', 16, 10, (ctx) => {
    drawMap(ctx, [
      'WwwWWwwWWwwWWwwW', '2222222222222222', '1111111111111111', '1111111111111111', '1111111111111111',
      '1111111111111111', '1111111111111111', '1111111111111111', '1111111111111111', '1111111111111111',
    ], { W: '#9ad0ff', w: '#5e96f0', '2': '#2f6fd0', '1': '#1d3f94' });
  });
  canvasTex(scene, 'plank', 16, 6, (ctx) => {
    drawMap(ctx, ['GGGGGGGGGGGGGGGG', 'oBBBBBBBoBBBBBBB', 'oBbBBBBBoBBbBBBB', 'oBBBBbBBoBBBBBBB', 'oBBBBBBBoBBBBBBB', 'dddddddddddddddd'], { G: PAL.grass1, o: '#3a2410', B: '#b5833f', b: '#8a5a2b', d: '#5a3a1a' });
  });
  canvasTex(scene, 'crate', 12, 13, (ctx) => {
    drawMap(ctx, [
      'oooooooooooo', 'oBBBBBBBBBBo', 'oBobBBBBboBo', 'oBBobBBboBBo', 'oBBBobboBBBo', 'oBBBBooBBBBo', 'oBBBBooBBBBo', 'oBBBobboBBBo', 'oBBobBBboBBo', 'oBobBBBBboBo', 'oBBBBBBBBBBo', 'obbbbbbbbbbo', 'oooooooooooo',
    ], { o: PAL.ink, B: '#d9a441', b: '#a8651a' });
  });
  canvasTex(scene, 'spring', 12, 8, (ctx) => {
    drawMap(ctx, ['.rrrrrrrrrr.', 'orrRRRRRRrro', '.oooooooooo.', '..o.o.o.o...'.slice(0, 12), '...oggggo...', '..oggggggo..'.slice(0, 12), '..oooooooo..', 'oooooooooooo'], { o: PAL.ink, r: '#e05252', R: '#ff9a8a', g: '#9a97ad' });
  });
  canvasTex(scene, 'checker', 8, 8, (ctx) => {
    ctx.fillStyle = '#f4efe0'; ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, 4, 4); ctx.fillRect(4, 4, 4, 4);
  });
  canvasTex(scene, 'sky-lane', 480, 67, (ctx) => {
    const bands = ['#4a2f9a', '#5b3ea8', '#7a4fb8', '#a85fb0', '#d9669a', '#f08a8a', '#ffab7a', '#ffc98a'];
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, Math.round((i * 67) / bands.length), 480, Math.ceil(67 / bands.length) + 1); });
    ctx.fillStyle = '#fff3c4'; ctx.fillRect(378, 24, 14, 14); ctx.fillRect(380, 22, 10, 18); ctx.fillRect(376, 26, 18, 10);
    const rng = createRng(11);
    for (let i = 0; i < 18; i++) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(rng.int(0, 479), rng.int(0, 20), 1, 1); }
  });
  canvasTex(scene, 'hills', 128, 40, (ctx) => {
    for (let x = 0; x < 128; x++) {
      const back = 26 + Math.round(6 * Math.sin((x / 128) * Math.PI * 2) + 3 * Math.sin((x / 128) * Math.PI * 6 + 1));
      const front = 32 + Math.round(4 * Math.sin((x / 128) * Math.PI * 4 + 2) + 2 * Math.sin((x / 128) * Math.PI * 8));
      ctx.fillStyle = '#6a3f9f'; ctx.fillRect(x, back, 1, 40 - back);
      ctx.fillStyle = '#2f6f5a'; ctx.fillRect(x, front, 1, 40 - front);
    }
  });
  canvasTex(scene, 'clouds', 160, 30, (ctx) => {
    const c = (x: number, y: number, w: number) => { ctx.fillStyle = 'rgba(255,225,240,0.85)'; ctx.fillRect(x + 3, y, w - 6, 4); ctx.fillRect(x, y + 3, w, 4); ctx.fillStyle = 'rgba(233,168,207,0.8)'; ctx.fillRect(x, y + 6, w, 1); };
    c(10, 4, 26); c(70, 14, 34); c(122, 2, 22);
  });
}

// ---------- texturas do Reflexo Relâmpago e fonte de números ----------
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'], '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
};
export const DIGIT_FRAMES = '0123456789+-';

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

export function buildAllTextures(scene: Phaser.Scene) {
<<<<<<< HEAD
  buildRaceTextures(scene);
  buildReflexTextures(scene);
=======
>>>>>>> 89dd3df16bc6020c7711e0f3b84fc20dd55f6ec5
  for (const id of CHARACTER_IDS) buildCharacter(scene, id);
  buildCoin(scene);
  buildRock(scene);
  buildShadow(scene);
  buildSpark(scene);
  buildMarker(scene);
  buildArenaBg(scene);
}
