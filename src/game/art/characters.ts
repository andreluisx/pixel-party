import type { CharacterId } from '@shared/characters';
import { CHARACTER_IDS } from '@shared/characters';
import { PAL } from './palette';

/**
 * Os 6 personagens. Cada um é um mapa de 12x16 caracteres (4 de chapéu/topo, 5 de rosto, 4 de corpo, 3 de pernas)
 * com silhueta própria. As animações são derivadas do mesmo mapa por transformações (braços, olhos, achatamento).
 * '.' = transparente. Letras = cores da paleta do personagem.
 */
<<<<<<< HEAD
export type CharAnim = 'idle' | 'walk' | 'celebrate' | 'lose' | 'surprised' | 'run' | 'jump' | 'fall';
=======
export type CharAnim = 'idle' | 'walk' | 'celebrate' | 'lose' | 'surprised';
>>>>>>> 89dd3df16bc6020c7711e0f3b84fc20dd55f6ec5
export const ANIMS: Record<CharAnim, { frames: number; fps: number; label: string }> = {
  idle: { frames: 2, fps: 2, label: 'Espera' },
  walk: { frames: 2, fps: 7, label: 'Caminhada' },
  celebrate: { frames: 2, fps: 5, label: 'Comemoração' },
  lose: { frames: 1, fps: 1, label: 'Derrota' },
  surprised: { frames: 2, fps: 6, label: 'Surpresa' },
<<<<<<< HEAD
  run: { frames: 2, fps: 11, label: 'Corrida' },
  jump: { frames: 1, fps: 1, label: 'Pulo' },
  fall: { frames: 1, fps: 1, label: 'Queda' },
};
export const ANIM_ORDER: CharAnim[] = ['idle', 'walk', 'run', 'jump', 'fall', 'celebrate', 'lose', 'surprised'];
/** Índice do primeiro quadro de cada animação na spritesheet do Phaser. */
export const FRAME_INDEX: Record<CharAnim, number> = { idle: 0, walk: 2, celebrate: 4, lose: 6, surprised: 7, run: 9, jump: 11, fall: 12 };
export const FRAME_COUNT = 13;
=======
};
export const ANIM_ORDER: CharAnim[] = ['idle', 'walk', 'celebrate', 'lose', 'surprised'];
/** Índice do primeiro quadro de cada animação na spritesheet do Phaser. */
export const FRAME_INDEX: Record<CharAnim, number> = { idle: 0, walk: 2, celebrate: 4, lose: 6, surprised: 7 };
export const FRAME_COUNT = 9;
>>>>>>> 89dd3df16bc6020c7711e0f3b84fc20dd55f6ec5

export const SPRITE_W = 12;
export const SPRITE_H = 16;
export const FRAME_W = 14; // 1px de margem lateral
export const FRAME_H = 18; // 2px de folga em cima (pulos)

interface CharDef {
  top: string[]; // 4 linhas
  face: string[]; // 5 linhas
  body: string[]; // 4 linhas
  legsA: string[]; // 3 linhas
  legsB: string[];
  hand: string; // letra usada nas "mãos levantadas"
  surpriseMouth?: [number, string]; // [índice dentro do rosto, linha]
  colors: Record<string, string>;
}

const HUMAN_FACE = ['.osssssssso.', '.osesssseso.', '.osssssssso.', '.osssssssso.', '..oossssoo..'];
const HUMAN_BODY = ['.obbbbbbbbo.', 'ossbbbbbbsso', '.obbbbbbbbo.', '..obbbbbbo..'];
const LEGS_A = ['..opp..ppo..', '..off..ffo..', '..ooo..ooo..'];
const LEGS_B = ['..opp..ppo..', '.offo..offo.', '.oooo..oooo.'];
const OPEN_MOUTH: [number, string] = [3, '.ossoooosso.'];

const DEFS: Record<CharacterId, CharDef> = {
  explorador: {
    top: ['...oooooo...', '..ohhhhhho..', '.ohhhhhhhho.', 'oHHHHHHHHHHo'],
    face: HUMAN_FACE, body: HUMAN_BODY, legsA: LEGS_A, legsB: LEGS_B, hand: 's', surpriseMouth: OPEN_MOUTH,
    colors: { h: '#8a5a2b', H: '#d9a441', b: '#3f7fe0', p: '#2a3f8f', f: '#5a3a1a' },
  },
  aventureira: {
    top: ['.oHo.oo.oHo.', '.ohhhhhhhho.', 'ohhhhhhhhhho', 'ohhsssssshho'],
    face: HUMAN_FACE, body: HUMAN_BODY, legsA: LEGS_A, legsB: LEGS_B, hand: 's', surpriseMouth: OPEN_MOUTH,
    colors: { h: '#e0523a', H: '#ff8fc1', b: '#ff7fb5', p: '#a84f8f', f: '#5a2a4a' },
  },
  mago: {
    top: ['.....oo.....', '....ohho....', '..oohhhhoo..', 'ooHHHHHHHHoo'],
    face: ['.osssssssso.', '.osesssseso.', '.osssssssso.', '.oswwwwwwso.', '..oowwwwoo..'],
    body: HUMAN_BODY, legsA: LEGS_A, legsB: LEGS_B, hand: 's', surpriseMouth: [3, '.oswwoowwso.'],
    colors: { h: '#6a3fb5', H: '#f5b83d', b: '#7a4fc5', p: '#4a2a85', f: '#2a1a50', w: '#f4efe0' },
  },
  arqueiro: {
    top: ['..oooooooo..', '.ohhhhhhhho.', 'ohhHHHHHHhho', 'ohhsssssshho'],
    face: HUMAN_FACE, body: HUMAN_BODY, legsA: LEGS_A, legsB: LEGS_B, hand: 's', surpriseMouth: OPEN_MOUTH,
    colors: { h: '#3a9a4a', H: '#256f34', b: '#2f7d3a', p: '#5a3a1a', f: '#3a2410' },
  },
  robo: {
    top: ['.....oo.....', '.....or.....', '..oooooooo..', '.oMMMMMMMMo.'],
    face: ['.oMMMMMMMMo.', '.oMeeMMeeMo.', '.oMMMMMMMMo.', '.oMMmmmmMMo.', '..oooooooo..'],
    body: ['.obbbbbbbbo.', 'oMMbbyybbMMo', '.obbbbbbbbo.', '..obbbbbbo..'],
    legsA: ['..omm..mmo..', '..oMM..MMo..', '..ooo..ooo..'], legsB: ['..omm..mmo..', '.oMMo..oMMo.', '.oooo..oooo.'],
    hand: 'M', surpriseMouth: [3, '.oMMooooMMo.'],
    colors: { M: '#aebfd6', m: '#4a5a78', b: '#5a7aa8', y: '#ffd34d', r: '#ff5d5d', e: '#7ff3ff' },
  },
  gosma: {
    top: ['.....gg.....', '...oooooo...', '..oGGGGGGo..', '.oGGHHGGGGo.'],
    face: ['.oGGGGGGGGo.', '.oGeeGGeeGo.', '.oGGGGGGGGo.', '.oGGGmmGGGo.', '.oGGGGGGGGo.'],
    body: ['oGGGGGGGGGGo', 'oGGGGGGGGGGo', '.oGGGGGGGGo.', '..oooooooo..'],
    legsA: ['...oo..oo...', '..oGGooGGo..', '..oooooooo..'], legsB: ['............', '..oGGooGGo..', '.oooooooooo.'],
    hand: 'G', surpriseMouth: [3, '.oGGoooGGGo.'],
    colors: { G: '#5fd36b', H: '#c4f7b0', g: '#9be37a', m: '#1b4a2a' },
  },
};

const BLANK = '............';

function composeRows(def: CharDef, anim: CharAnim, frame: number): { rows: string[]; dy: number } {
  const upper = [...def.top, ...def.face, ...def.body];
  let legs = def.legsA;
  let dy = 0;
  let rows: string[];
  const handsUp = (r: string[]) => {
    const out = [...r];
    // sem braços no corpo; mãos aparecem ao lado da cabeça
    const armsRow = 4 + 5 + 1; // linha dos braços no corpo
    out[armsRow] = out[armsRow - 1]!;
    for (const y of [5, 6]) { const row = out[y]!.split(''); row[0] = def.hand; row[11] = def.hand; out[y] = row.join(''); }
    return out;
  };
  switch (anim) {
    case 'walk':
      legs = frame % 2 === 0 ? def.legsA : def.legsB;
      rows = [...upper, ...legs];
      break;
    case 'idle':
      rows = frame % 2 === 0 ? [...upper, ...legs] : [BLANK, ...upper.slice(0, 12), ...legs]; // "respirar": achata 1px
      break;
    case 'celebrate':
      rows = [...handsUp(upper), ...def.legsA];
      dy = frame % 2 === 0 ? 0 : -2; // pulinho
      break;
    case 'lose': {
      const sad = upper.map((r) => r.replace(/e/g, 'k'));
      rows = [BLANK, BLANK, ...sad.slice(0, 11), ...legs]; // murcha 2px
      break;
    }
<<<<<<< HEAD
    case 'run':
      rows = [...upper, ...(frame % 2 === 0 ? def.legsB : def.legsA)];
      dy = frame % 2 === 0 ? 0 : -1; // fase de voo da passada
      break;
    case 'jump':
      rows = [...handsUp(upper), ...def.legsB];
      dy = -1;
      break;
    case 'fall': {
      const up = handsUp(upper);
      if (def.surpriseMouth) up[4 + def.surpriseMouth[0]] = def.surpriseMouth[1];
      rows = [...up, ...def.legsB];
      break;
    }
=======
>>>>>>> 89dd3df16bc6020c7711e0f3b84fc20dd55f6ec5
    case 'surprised': {
      const up = handsUp(upper);
      if (def.surpriseMouth) up[4 + def.surpriseMouth[0]] = def.surpriseMouth[1];
      rows = [...up, ...def.legsA];
      dy = frame % 2 === 0 ? -1 : 0; // sobressalto
      break;
    }
  }
  return { rows, dy };
}

const cache = new Map<string, HTMLCanvasElement>();

/** Quadro 14x18 pronto (cacheado). Usado tanto pelo Phaser quanto pelas prévias em React. */
export function characterFrame(id: CharacterId, anim: CharAnim, frame: number): HTMLCanvasElement {
  const key = `${id}:${anim}:${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = DEFS[id];
  const c = document.createElement('canvas');
  c.width = FRAME_W; c.height = FRAME_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const colors: Record<string, string> = { o: PAL.ink, s: PAL.skin, e: PAL.ink, k: PAL.ink, ...def.colors };
  const { rows, dy } = composeRows(def, anim, frame);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.') continue;
      const col = colors[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(1 + x, 2 + y + dy, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}

/** Valida dimensões dos mapas (usado em tests/characters.test.ts). */
export function validateCharacterMaps(): string[] {
  const errs: string[] = [];
  for (const id of CHARACTER_IDS) {
    const d = DEFS[id];
    const groups: [string, string[], number][] = [['top', d.top, 4], ['face', d.face, 5], ['body', d.body, 4], ['legsA', d.legsA, 3], ['legsB', d.legsB, 3]];
    for (const [name, rows, n] of groups) {
      if (rows.length !== n) errs.push(`${id}.${name}: ${rows.length} linhas (esperado ${n})`);
      rows.forEach((r, i) => { if (r.length !== SPRITE_W) errs.push(`${id}.${name}[${i}]: largura ${r.length}`); });
    }
    for (const ch of new Set([...d.top, ...d.face, ...d.body, ...d.legsA, ...d.legsB].join('').split(''))) {
      if (ch !== '.' && !({ o: 1, s: 1, e: 1, k: 1, ...d.colors } as Record<string, unknown>)[ch]) errs.push(`${id}: letra sem cor '${ch}'`);
    }
  }
  return errs;
}

/** Os 6 personagens têm silhuetas diferentes? (conta pixels opacos por linha de cada um) */
export function silhouetteSignature(id: CharacterId): string {
  const d = DEFS[id];
  return [...d.top, ...d.face, ...d.body].map((r) => r.replace(/[^.]/g, '#')).join('|');
}
