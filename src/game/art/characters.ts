import type { CharacterId } from '@shared/characters';
import { CHARACTER_IDS } from '@shared/characters';
import { PAL } from './palette';
import { darken, lighten, mix } from './scenery';

/**
 * Os 6 personagens, 16x22 px (cabeça grande, estilo chibi).
 * - Humanos: cabeça desenhada por código (silhueta + olhos grandes com brilho + bochecha), com cabelo/chapéu
 *   (`over`) e barba (`under`) em mapas de caracteres. Corpo e pernas são mapas com a paleta do personagem.
 * - Robô e Gosma têm cabeça/corpo próprios (`head`, `body`, `legs`).
 * As animações vêm das mesmas peças (braços, pernas, olhos, achatamento). Depois um passe de acabamento dá volume
 * (luz no canto superior esquerdo, sombra embaixo/direita, contorno tingido pela cor da peça).
 * '.' = transparente.
 */
export type CharAnim = 'idle' | 'walk' | 'celebrate' | 'lose' | 'surprised' | 'run' | 'jump' | 'fall';
export const ANIMS: Record<CharAnim, { frames: number; fps: number; label: string }> = {
  idle: { frames: 2, fps: 2, label: 'Espera' },
  walk: { frames: 2, fps: 7, label: 'Caminhada' },
  celebrate: { frames: 2, fps: 5, label: 'Comemoração' },
  lose: { frames: 1, fps: 1, label: 'Derrota' },
  surprised: { frames: 2, fps: 6, label: 'Surpresa' },
  run: { frames: 2, fps: 11, label: 'Corrida' },
  jump: { frames: 1, fps: 1, label: 'Pulo' },
  fall: { frames: 1, fps: 1, label: 'Queda' },
};
export const ANIM_ORDER: CharAnim[] = ['idle', 'walk', 'run', 'jump', 'fall', 'celebrate', 'lose', 'surprised'];
/** Índice do primeiro quadro de cada animação na spritesheet do Phaser. */
export const FRAME_INDEX: Record<CharAnim, number> = { idle: 0, walk: 2, celebrate: 4, lose: 6, surprised: 7, run: 9, jump: 11, fall: 12 };
export const FRAME_COUNT = 13;

export const SPRITE_W = 16;
export const SPRITE_H = 22;
export const FRAME_W = 18; // 1px de margem lateral
export const FRAME_H = 24; // 2px de folga em cima (pulos); os pés ficam na última linha

const HEAD_ROWS = 12; // linhas 0-11
const BODY_ROWS = 5; // linhas 12-16
const LEG_ROWS = 5; // linhas 17-21

interface CharDef {
  head?: string[]; // 12 linhas (cabeça própria; senão: procedural + over/under)
  over?: string[]; // sobreposição a partir da linha 0 (cabelo, chapéu)
  under?: Array<[number, string]>; // [linha inicial, mapa] (barba etc.), sobrepõe o rosto
  body: string[]; // 5 linhas
  legsA: string[]; // 5 linhas
  legsB: string[];
  hand: string; // letra das mãos levantadas
  colors: Record<string, string>;
}

// -------------------------------------------------------------- cabeça procedural
const HW = [0, 4, 6, 7, 7, 7, 7, 7, 7, 6, 5, 3]; // meia-largura por linha (0 = vazia)
function humanHead(): string[] {
  const g: string[][] = Array.from({ length: HEAD_ROWS }, () => Array(SPRITE_W).fill('.'));
  const inside = (x: number, y: number) => y >= 1 && y < HEAD_ROWS && x >= 8 - HW[y]! && x < 8 + HW[y]!;
  for (let y = 1; y < HEAD_ROWS; y++) for (let x = 0; x < SPRITE_W; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    g[y]![x] = edge ? 'o' : 's';
  }
  const put = (x: number, y: number, c: string) => { g[y]![x] = c; };
  // olhos grandes (2x2) com brilho, bochechas e boca
  for (const ex of [4, 10]) { put(ex, 7, 'u'); put(ex + 1, 7, 'e'); put(ex, 8, 'e'); put(ex + 1, 8, 'e'); }
  put(3, 9, 'q'); put(4, 9, 'q'); put(11, 9, 'q'); put(12, 9, 'q');
  put(7, 10, 'm'); put(8, 10, 'm');
  return g.map((r) => r.join(''));
}

const BODY: string[] = [
  '.....obbbbo.....',
  '....obbbbbbo....',
  '...obbbbbbbbo...',
  '...ossbbbbsso...',
  '....oxxyyxxo....',
];
const LEGS_A = ['....oppooppo....', '....oppooppo....', '....offooffo....', '....offooffo....', '....oooooooo....'];
const LEGS_B = ['....oppooppo....', '....oppooppo....', '...offo..offo...', '...offo..offo...', '...oooo..oooo...'];

const DEFS: Record<CharacterId, CharDef> = {
  // Teco: chapéu de aventura
  explorador: {
    over: [
      '.....oooooo.....',
      '...ooHHHHHHoo...',
      '..oHHHhhhhHHHo..',
      '..oHhhhhhhhhHo..',
      '..oBBBBBBBBBBo..',
      'oHHHHHHHHHHHHHHo',
      'ooddddddddddddoo',
      '...h........h...',
    ],
    body: BODY, legsA: LEGS_A, legsB: LEGS_B, hand: 's',
    colors: { h: '#a8723a', H: '#e6b955', B: '#6a3a1a', d: '#7a5428', b: '#3f7fe0', p: '#2a3f8f', f: '#5a3a1a', x: '#5a3a1a', y: '#ffd34d' },
  },
  // Mel: cabelo vermelho com maria-chiquinhas e laço
  aventureira: {
    over: [
      '....oooooooo....',
      '..ooHHHHHPPPoo..',
      '.oHHHhhhhhPPPPo.',
      '.ohhhhhhhhhPPho.',
      'ohhhhhhhhhhhhhho',
      'ohhhshhhhhhshhho',
      'ohhh........hhho',
      'oHho........ohHo',
      'oHho..........oHho'.slice(0, 16),
      '.oo............o'.padEnd(16, '.'),
    ],
    under: [],
    body: BODY, legsA: LEGS_A, legsB: LEGS_B, hand: 's',
    colors: { P: '#ff8fc1', h: '#e0523a', H: '#ff8a5a', b: '#ff7fb5', p: '#a84f8f', f: '#5a2a4a', x: '#a84f8f', y: '#ffd34d' },
  },
  // Barnabé: chapéu pontudo e barba branca
  mago: {
    over: [
      '.......oo.......',
      '......ohho......',
      '.....ohhhho.....',
      '....ohhYhhho....',
      '...ohhhhhhhho...',
      '..oGGGGGGGGGGo..',
      'ohhhhhhhhhhhhhho',
      '.oodddddddddoo..'.slice(0, 16),
    ],
    under: [[7, '.oww........wwo.'], [8, '.oww........wwo.'], [9, '..oww......wwo..'], [10, '....wwwwwwww....'], [11, '......wwww......']],
    body: BODY, legsA: LEGS_A, legsB: LEGS_B, hand: 's',
    colors: { h: '#6a3fb5', H: '#9a6fe0', Y: '#ffe08a', G: '#f5b83d', d: '#3a2a7a', w: '#e8ecff', b: '#7a4fc5', p: '#4a2a85', f: '#2a1a50', x: '#f5b83d', y: '#fff3a8' },
  },
  // Pip: capuz verde com pena
  arqueiro: {
    over: [
      '.........ooo.rr.',
      '....ooooooooorro',
      '..ooHHHHHHHHooo.',
      '.oHHhhhhhhhhhHo.',
      '.ohhhhhhhhhhhho.',
      'ohhhHHHHHHHHhhho',
      'ohhhsssssssshhho',
      'ohh..........hho',
    ],
    body: BODY, legsA: LEGS_A, legsB: LEGS_B, hand: 's',
    colors: { h: '#2f8a3a', H: '#58c25a', r: '#e0523a', b: '#3a9a4a', p: '#5a3a1a', f: '#3a2410', x: '#3a2410', y: '#cdbf95' },
  },
  // Bit: robozinho
  robo: {
    head: [
      '.......oo.......',
      '.......or.......',
      '..oooooooooooo..',
      '.oMMMMMMMMMMMMo.',
      '.oMkkkkkkkkkkMo.',
      'oMMkeekkkkeekMMo',
      'oMMkeekkkkeekMMo',
      '.oMkkkkkkkkkkMo.',
      '.oMMmmmmmmmmMMo.',
      '..oMMMMMMMMMMo..',
      '...ooooooooo....'.padEnd(16, '.'),
      '......oMMo......',
    ],
    body: [
      '....oooooooo....',
      '...obbbbbbbbo...',
      '..oMobbyybbboMo.'.slice(0, 16),
      '..oMobbbbbbboMo.'.slice(0, 16),
      '....obbbbbbo....',
    ],
    legsA: ['....ommooommo...'.slice(0, 16), '....oMMooMMo....', '....oMMooMMo....', '...oMMMooMMMo...', '...oooo..oooo...'],
    legsB: ['....ommooommo...'.slice(0, 16), '....oMMooMMo....', '...oMMo..oMMo...', '..oMMMo..oMMMo..', '..oooo....oooo..'],
    hand: 'M',
    colors: { M: '#c4d2e6', m: '#5a6a88', b: '#5a7aa8', y: '#ffd34d', r: '#ff5d5d', e: '#7ff3ff', k: '#1b2a48' },
  },
  // Gosmo: criaturinha de gosma
  gosma: {
    head: [
      '......gg........',
      '.....oGGo.......',
      '....ooGGGoo.....',
      '...oGGHHGGGo....',
      '..oGHHGGGGGGo...',
      '.oGHGGGGGGGGGo..',
      '.oGGGeeGGGeeGo..',
      '.oGGGeeGGGeeGo..',
      '.oGGGGGGGGGGGo..',
      '.oGGGGmmmGGGGo..',
      '.oGGGGGGGGGGGo..',
      '..oGGGGGGGGGo...',
    ],
    body: [
      '.oGGGGGGGGGGo...',
      '.oGGGGGGGGGGGo..',
      '..oGGGGGGGGGGo..',
      '..oGGGgGGGGGGo..',
      '...ooGGGGGGoo...',
    ],
    legsA: ['................', '................', '................', '..oGGo....oGGo..', '..oooo....oooo..'],
    legsB: ['................', '................', '................', '.oGGGo....oGGGo.', '.ooooo....ooooo.'],
    hand: 'G',
    colors: { G: '#5fd36b', H: '#c4f7b0', g: '#9be37a', m: '#1b4a2a', e: '#1b1030' },
  },
};

// Os mapas "head" e "body" do Gosma foram desenhados como blob centrado com 15 colunas úteis: normaliza para 16.
function norm(rows: string[]): string[] { return rows.map((r) => r.padEnd(SPRITE_W, '.').slice(0, SPRITE_W)); }
for (const id of CHARACTER_IDS) {
  const d = DEFS[id];
  if (d.head) d.head = norm(d.head);
  d.body = norm(d.body); d.legsA = norm(d.legsA); d.legsB = norm(d.legsB);
  if (d.over) d.over = norm(d.over);
  if (d.under) d.under = d.under.map(([y, r]) => [y, norm([r])[0]!] as [number, string]);
}

const BLANK = '.'.repeat(SPRITE_W);

function headRows(def: CharDef): string[] {
  if (def.head) return [...def.head];
  const base = humanHead().map((r) => r.split(''));
  (def.over ?? []).forEach((row, y) => { if (y < HEAD_ROWS) for (let x = 0; x < SPRITE_W; x++) if (row[x] !== '.') base[y]![x] = row[x]!; });
  for (const [y0, row] of def.under ?? []) for (let x = 0; x < SPRITE_W; x++) if (row[x] !== '.') base[y0]![x] = row[x]!;
  return base.map((r) => r.join(''));
}

function composeRows(def: CharDef, anim: CharAnim, frame: number): { rows: string[]; dy: number } {
  const head = headRows(def);
  const upper = [...head, ...def.body];
  const handsUp = (r: string[]) => {
    const out = [...r];
    const armRow = HEAD_ROWS + 3;
    out[armRow] = out[armRow - 1]!; // braços sobem: corpo sem as mãos laterais
    for (const y of [8, 9]) { const row = out[y]!.split(''); row[0] = def.hand; row[SPRITE_W - 1] = def.hand; out[y] = row.join(''); }
    return out;
  };
  const openMouth = (r: string[]) => {
    const out = [...r];
    for (const y of [10, 11]) { const row = out[y]!.split(''); if (def.head) break; row[7] = 'e'; row[8] = 'e'; out[y] = row.join(''); }
    return out;
  };
  let legs = def.legsA;
  let dy = 0;
  let rows: string[];
  switch (anim) {
    case 'walk':
      legs = frame % 2 === 0 ? def.legsA : def.legsB;
      rows = [...upper, ...legs];
      break;
    case 'idle':
      rows = frame % 2 === 0 ? [...upper, ...legs] : [BLANK, ...upper.slice(0, upper.length - 1), ...legs]; // "respirar": achata 1px
      break;
    case 'celebrate':
      rows = [...handsUp(upper), ...def.legsA];
      dy = frame % 2 === 0 ? 0 : -2;
      break;
    case 'lose': {
      const sad = upper.map((r) => r.replace(/[eu]/g, 'k'));
      rows = [BLANK, BLANK, ...sad.slice(0, upper.length - 2), ...legs]; // murcha 2px
      break;
    }
    case 'run':
      rows = [...upper, ...(frame % 2 === 0 ? def.legsB : def.legsA)];
      dy = frame % 2 === 0 ? 0 : -1;
      break;
    case 'jump':
      rows = [...handsUp(upper), ...def.legsB];
      dy = -1;
      break;
    case 'fall':
      rows = [...openMouth(handsUp(upper)), ...def.legsB];
      break;
    case 'surprised':
      rows = [...openMouth(handsUp(upper)), ...def.legsA];
      dy = frame % 2 === 0 ? -1 : 0;
      break;
  }
  return { rows, dy };
}

const cache = new Map<string, HTMLCanvasElement>();

/** Quadro 18x24 pronto (cacheado). Usado tanto pelo Phaser quanto pelas prévias em React. */
export function characterFrame(id: CharacterId, anim: CharAnim, frame: number): HTMLCanvasElement {
  const key = `${id}:${anim}:${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = DEFS[id];
  const c = document.createElement('canvas');
  c.width = FRAME_W; c.height = FRAME_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const colors: Record<string, string> = { o: PAL.ink, s: PAL.skin, e: PAL.ink, k: PAL.ink, u: '#ffffff', q: '#f08a8a', m: '#8a3a3a', ...def.colors };
  // letras 'w'/'b'/'m' do rosto humano têm cor fixa; as do personagem (ex.: barba 'w') vêm de def.colors
  const { rows, dy } = composeRows(def, anim, frame);
  const at = (x: number, y: number) => (y < 0 || y >= rows.length ? '.' : (rows[y]![x] ?? '.'));
  const isEdge = (ch: string) => ch === '.' || ch === 'o';
  const NOSHADE = new Set(['e', 'k', 'u', 'm', 'q']);
  const fillNear = (x: number, y: number): string | null => {
    for (const [ax, ay] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, 1]] as const) {
      const ch = at(x + ax, y + ay);
      if (ch !== '.' && ch !== 'o' && !NOSHADE.has(ch) && colors[ch]) return colors[ch]!;
    }
    return null;
  };
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.') continue;
      const base = colors[ch];
      if (!base) continue;
      let col = base;
      if (ch === 'o') {
        const f = fillNear(x, y);
        col = f ? mix(darken(f, 0.72), PAL.ink, 0.45) : PAL.ink;
      } else if (!NOSHADE.has(ch)) {
        const up = isEdge(at(x, y - 1)), left = isEdge(at(x - 1, y)), down = isEdge(at(x, y + 1)), right = isEdge(at(x + 1, y));
        if (up && left) col = lighten(base, 0.32);
        else if (up) col = lighten(base, 0.2);
        else if (left) col = lighten(base, 0.1);
        else if (down && right) col = darken(base, 0.3);
        else if (down) col = darken(base, 0.2);
        else if (right) col = darken(base, 0.12);
      }
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
    const groups: [string, string[], number][] = [['body', d.body, BODY_ROWS], ['legsA', d.legsA, LEG_ROWS], ['legsB', d.legsB, LEG_ROWS]];
    if (d.head) groups.push(['head', d.head, HEAD_ROWS]);
    for (const [name, rows, n] of groups) {
      if (rows.length !== n) errs.push(`${id}.${name}: ${rows.length} linhas (esperado ${n})`);
      rows.forEach((r, i) => { if (r.length !== SPRITE_W) errs.push(`${id}.${name}[${i}]: largura ${r.length}`); });
    }
    const all = [...headRows(d), ...d.body, ...d.legsA, ...d.legsB];
    for (const ch of new Set(all.join('').split(''))) {
      if (ch !== '.' && !({ o: 1, s: 1, e: 1, k: 1, u: 1, q: 1, m: 1, ...d.colors } as Record<string, unknown>)[ch]) errs.push(`${id}: letra sem cor '${ch}'`);
    }
  }
  return errs;
}

/** Os 6 personagens têm silhuetas diferentes? (conta pixels opacos por linha de cada um) */
export function silhouetteSignature(id: CharacterId): string {
  const d = DEFS[id];
  return [...headRows(d), ...d.body].map((r) => r.replace(/[^.]/g, '#')).join('|');
}
