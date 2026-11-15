import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { DIFFICULTY } from '../bots';
import { createRng, type Rng } from '../rng';
import { rankByScore } from '../rewards';

/**
 * CORRIDA MALUCA — 4 pistas paralelas idênticas (mesma seed). Correr, PULAR (caixas, buracos), ABAIXAR (barras
 * penduradas), atravessar lama (lenta), pegar setas de impulso, moedas e CAIXAS "?" (turbo, escudo ou ataque
 * que joga um barril na pista de quem está na frente). Ganha quem chega primeiro.
 * Coordenadas: x em px ao longo da pista, y = altura acima do chão (0 = no chão).
 */
export const TRACK_LENGTH = 2500;
export const FINISH_X = TRACK_LENGTH;
export const DURATION_MS = 36000;
export const LAST_CHANCE_MS = 6000; // depois do 1º a chegar, os outros têm mais 6 s

// física
export const GRAVITY = 560;
export const JUMP_VY = 190;
export const SPRING_VY = 215;
export const BASE_SPEED = 98;
export const SPRINT_SPEED = 118;
export const BRAKE_SPEED = 58;
const TURBO_BONUS = 14;
const ACCEL = 420;
const HALF_W = 3; // meia largura do corredor
const COYOTE_MS = 90;
const JUMP_BUFFER_MS = 130;
const STUN_MS = 650;
const INVULN_MS = 500;
const RESPAWN_MS = 700;
const CRATE_W = 12;
const CRATE_H = 13;
const DUCK_H = 7; // altura do corredor agachado
const STAND_H = 14;
const BEAM_BOTTOM = 9; // a barra pendurada começa a 9 px do chão: só passa agachado
const MUD_SLOW = 0.5;
const BONK_INVULN_MS = 1100; // depois de bater, atravessa o obstáculo "fantasma": nunca fica preso
export const BIRD_SPEED = 170; // o pássaro voa contra o corredor
const BIRD_LO = 8; // faixa de altura do pássaro: cabeça de quem está em pé (14) e acima da cabeça de quem está abaixado (7)
const BIRD_HI = 15;
const BIRD_SPAWN = 390; // nasce fora da tela, à frente do corredor
const PAD_TURBO_MS = 1100;
const ITEM_TURBO_MS = 1900;
export const AIR_TIME = (2 * JUMP_VY) / GRAVITY;

// geometria de tela compartilhada com a view
export const LANE_H = 67;
export const GROUND_LOCAL_Y = 57;

export interface Crate { id: number; x: number } // x = centro
export interface Hole { id: number; x: number; w: number } // x = borda esquerda
export interface Spring { id: number; x: number }
export interface Platform { id: number; x: number; w: number; h: number } // x = borda esquerda, h = altura da superfície
export interface CoinItem { id: number; x: number; h: number }
export interface Beam { id: number; x: number; w: number } // x = centro
export interface Pad { id: number; x: number } // seta de impulso
export interface Mud { id: number; x: number; w: number } // x = borda esquerda
export interface ItemBox { id: number; x: number; h: number }
export interface BirdTrigger { id: number; x: number } // ao passar daqui, um pássaro voa contra o corredor
export interface Track {
  length: number; crates: Crate[]; holes: Hole[]; springs: Spring[]; platforms: Platform[]; coins: CoinItem[];
  beams: Beam[]; pads: Pad[]; muds: Mud[]; boxes: ItemBox[]; birds: BirdTrigger[];
}
export type ItemKind = 'turbo' | 'shield' | 'attack';
export const BEAM_W = 16;
export const MUD_W = 44;

// ---------------------------------------------------------------- geração da pista (determinística)
const trackCache = new Map<number, Track>();

export function getTrack(seed: number): Track {
  const hit = trackCache.get(seed);
  if (hit) return hit;
  const t = generateTrack(seed);
  if (trackCache.size > 24) trackCache.clear();
  trackCache.set(seed, t);
  return t;
}

type Pattern = 'rock1' | 'rock2' | 'hole' | 'bridge' | 'wide' | 'gauntlet' | 'combo' | 'coins' | 'beam' | 'beam2' | 'duckjump' | 'pad' | 'padhole' | 'mud' | 'mudcrate' | 'box' | 'bird';

/**
 * ESTRUTURAS PRONTAS ("prefabs") sorteadas pela seed. Regras que mantêm a pista justa:
 * - cada estrutura só aparece numa faixa da pista (`from`..`to`, em % do percurso) e tem um custo de dificuldade;
 * - nunca duas estruturas difíceis seguidas (custo somado ≤ 4) e nunca a mesma estrutura de perigo duas vezes seguidas;
 * - nunca duas de "abaixar" seguidas (barra, barra dupla, abaixar+pular, pássaro);
 * - o pássaro ocupa um trecho livre só dele (nada mais acontece enquanto ele voa);
 * - sempre há espaço para pousar entre estruturas e uma caixa "?" a cada ~430 px.
 */
const PREFABS: Record<Pattern, { cost: number; from: number; to: number; w: number; duck?: boolean }> = {
  rock1: { cost: 1, from: 0, to: 0.5, w: 3 },
  rock2: { cost: 2, from: 0, to: 1, w: 3 },
  hole: { cost: 2, from: 0, to: 1, w: 3 },
  bridge: { cost: 2, from: 0.2, to: 1, w: 2 },
  wide: { cost: 3, from: 0.5, to: 1, w: 2 },
  gauntlet: { cost: 3, from: 0.25, to: 1, w: 2 },
  combo: { cost: 3, from: 0.55, to: 1, w: 2 },
  coins: { cost: 0, from: 0, to: 0.4, w: 1 },
  beam: { cost: 2, from: 0, to: 0.75, w: 3, duck: true },
  beam2: { cost: 3, from: 0.3, to: 1, w: 2, duck: true },
  duckjump: { cost: 3, from: 0.3, to: 1, w: 3, duck: true },
  bird: { cost: 2, from: 0.12, to: 1, w: 3, duck: true },
  pad: { cost: 0, from: 0, to: 1, w: 2 },
  padhole: { cost: 2, from: 0.25, to: 1, w: 2 },
  mud: { cost: 1, from: 0, to: 1, w: 2 },
  mudcrate: { cost: 3, from: 0.3, to: 1, w: 2 },
  box: { cost: 0, from: 0, to: 1, w: 2 },
};
export const BIRD_WINDOW = 210; // trecho livre depois do gatilho do pássaro

/** Os primeiros trechos ensinam uma mecânica por vez, sempre na mesma ordem. */
const INTRO: Pattern[] = ['rock1', 'beam', 'bird', 'pad', 'mud', 'box', 'hole'];

export function generateTrack(seed: number): Track {
  const rng = createRng(seed ^ 0x5eed);
  const tr: Track = { length: TRACK_LENGTH, crates: [], holes: [], springs: [], platforms: [], coins: [], beams: [], pads: [], muds: [], boxes: [], birds: [] };
  let n = 0;
  let lastBox = 0;
  const prev: Pattern[] = [];
  let id = 1;
  let x = 230;
  const arc = (cx: number, n = 5) => {
    const hs = [8, 19, 26, 19, 8];
    for (let i = 0; i < n; i++) tr.coins.push({ id: id++, x: cx - 24 + i * 12, h: hs[i % hs.length]! });
  };
  const line = (x0: number, n: number, h = 6) => { for (let i = 0; i < n; i++) tr.coins.push({ id: id++, x: x0 + i * 11, h }); };

  while (x < TRACK_LENGTH - 260) {
    const p = x / TRACK_LENGTH;
    let pat: Pattern;
    if (n < INTRO.length) pat = INTRO[n]!;
    else if (x - lastBox > 430) pat = 'box'; // sempre há uma caixa "?" por perto
    else {
      const pool = (Object.keys(PREFABS) as Pattern[]).filter((k) => {
        const f = PREFABS[k];
        if (p < f.from || p > f.to) return false;
        if (f.cost > 0 && k === prev[0]) return false; // sem repetir perigo
        if (prev[0] && PREFABS[prev[0]].cost + f.cost > 4) return false; // sem dois difíceis seguidos
        if (f.duck && prev[0] && PREFABS[prev[0]].duck) return false; // sem duas de abaixar seguidas
        return true;
      });
      const total = pool.reduce((sum, k) => sum + PREFABS[k].w, 0);
      let r = rng.next() * total;
      pat = pool[0] ?? 'coins';
      for (const k of pool) { if ((r -= PREFABS[k].w) < 0) { pat = k; break; } }
    }
    n++;
    prev.unshift(pat); prev.length = Math.min(prev.length, 2);
    if (pat === 'box') lastBox = x;

    let len = 0;
    switch (pat) {
      case 'rock1': tr.crates.push({ id: id++, x: x + 6 }); arc(x + 6); len = 12; break;
      case 'rock2': tr.crates.push({ id: id++, x: x + 6 }, { id: id++, x: x + 36 }); len = 42; break;
      case 'hole': { const w = rng.int(28, 36); tr.holes.push({ id: id++, x, w }); arc(x + w / 2); if (n > INTRO.length && rng.chance(0.35)) { tr.boxes.push({ id: id++, x: x + w / 2, h: 24 }); lastBox = x; } len = w; break; }
      case 'bridge': tr.holes.push({ id: id++, x, w: 44 }); tr.platforms.push({ id: id++, x: x + 12, w: 20, h: 14 }); tr.coins.push({ id: id++, x: x + 22, h: 20 }); len = 44; break;
      case 'wide': tr.holes.push({ id: id++, x, w: 52 }); tr.platforms.push({ id: id++, x: x + 15, w: 22, h: 18 }); tr.coins.push({ id: id++, x: x + 26, h: 24 }); len = 52; break;
      case 'gauntlet': {
        tr.springs.push({ id: id++, x });
        tr.platforms.push({ id: id++, x: x + 34, w: 112, h: 28 });
        for (const dx of [60, 84, 108, 132]) tr.crates.push({ id: id++, x: x + dx });
        line(x + 46, 8, 34);
        len = 146; break;
      }
      case 'combo': tr.crates.push({ id: id++, x: x + 6 }); tr.holes.push({ id: id++, x: x + 62, w: 32 }); len = 94; break;
      case 'coins': line(x, 6); len = 66; break;
      case 'beam': tr.beams.push({ id: id++, x: x + 8, w: BEAM_W }); line(x - 6, 3, 4); len = 16; break; // moedas embaixo: abaixar compensa
      case 'beam2': tr.beams.push({ id: id++, x: x + 8, w: BEAM_W }, { id: id++, x: x + 60, w: BEAM_W }); line(x - 4, 7, 4); len = 68; break;
      case 'duckjump': tr.beams.push({ id: id++, x: x + 8, w: BEAM_W }); tr.crates.push({ id: id++, x: x + 70 }); len = 76; break;
      case 'pad': tr.pads.push({ id: id++, x: x + 8 }); line(x + 40, 4, 6); len = 16; break;
      case 'padhole': tr.pads.push({ id: id++, x: x + 8 }); tr.holes.push({ id: id++, x: x + 60, w: 40 }); arc(x + 80); len = 100; break;
      case 'mud': tr.muds.push({ id: id++, x, w: MUD_W }); arc(x + MUD_W / 2); len = MUD_W; break;
      case 'mudcrate': tr.muds.push({ id: id++, x, w: 36 }); tr.crates.push({ id: id++, x: x + 56 }); len = 62; break;
      case 'box': tr.boxes.push({ id: id++, x: x + 8, h: 10 }); len = 16; break;
      case 'bird': tr.birds.push({ id: id++, x }); line(x + 30, 10, 5); len = BIRD_WINDOW; break;
    }
    const gap = Math.round(82 - 26 * p) + rng.int(0, 18) + (n <= INTRO.length ? 44 : 0);
    x += len + gap;
  }
  return tr;
}

// ---------------------------------------------------------------- estado
export type FxKind = '' | 'turbo' | 'shield' | 'attack' | 'pad' | 'block' | 'warn';
export interface Runner {
  slot: number;
  x: number; y: number; vy: number; speed: number;
  grounded: boolean; coyoteMs: number; jumpBufMs: number; prevJump: boolean;
  stunMs: number; invulnMs: number; turboMs: number;
  falling: boolean; respawnMs: number; respawnX: number;
  coins: number; collected: number[];
  finishedAtMs: number | null;
  springMs: number; // > 0 logo após usar a mola (para o visual)
  ducking: boolean; inMud: boolean; shield: boolean;
  birds: Bird[]; // pássaros voando na pista deste corredor
  fx: FxKind; fxSeq: number; // último evento (o visual mostra um aviso quando fxSeq muda)
}
export interface Bird { id: number; x: number }
/** Barril lançado por um ataque: existe só na pista de `to`. */
export interface Hazard { id: number; x: number; to: PlayerId; by: PlayerId }
export interface CorridaState {
  seed: number;
  elapsedMs: number;
  order: PlayerId[];
  players: Record<PlayerId, Runner>;
  firstFinishMs: number | null;
  hazards: Hazard[];
  nextHazardId: number;
}
export interface CorridaInput { run: -1 | 0 | 1; jump: boolean; duck?: boolean }

function holeAt(track: Track, x: number): Hole | undefined {
  return track.holes.find((h) => x > h.x + 3 && x < h.x + h.w - 3);
}

/** Hash inteiro determinístico (para sortear itens sem consumir o gerador do estado). */
function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

/** Caixas "sólidas" da pista de um corredor: as da pista + os barris que os rivais jogaram nele. */
function solidsFor(s: CorridaState, track: Track, id: PlayerId): { x: number }[] {
  const mine = s.hazards.filter((h) => h.to === id);
  return mine.length ? [...track.crates, ...mine] : track.crates;
}

/** Maior superfície sólida sob o corredor (plataformas e topo de caixas são "de mão única"). */
function floorAt(track: Track, crates: { x: number }[], x: number, prevY: number): number {
  let floor = holeAt(track, x) ? -Infinity : 0;
  for (const pl of track.platforms) {
    if (x >= pl.x - HALF_W + 1 && x <= pl.x + pl.w + HALF_W - 1 && prevY >= pl.h - 0.5 && pl.h > floor) floor = pl.h;
  }
  for (const c of crates) {
    if (Math.abs(x - c.x) <= CRATE_W / 2 + 2 && prevY >= CRATE_H - 0.5 && CRATE_H > floor) floor = CRATE_H;
  }
  return floor;
}

function setFx(r: Runner, kind: FxKind) { r.fx = kind; r.fxSeq++; }

/** Sorteia o item da caixa "?": quem está atrás ganha mais turbo; quem lidera, mais escudo. */
function pickItem(s: CorridaState, boxId: number, id: PlayerId): ItemKind {
  const r = s.players[id]!;
  const u = hash3(s.seed, boxId, r.slot) % 100;
  const ahead = s.order.filter((o) => s.players[o]!.x > r.x + 1).length;
  const last = ahead === s.order.length - 1 && s.order.length > 1;
  let k: ItemKind;
  if (ahead === 0) k = u < 60 ? 'shield' : 'turbo';
  else if (last) k = u < 55 ? 'turbo' : 'attack';
  else k = u < 45 ? 'attack' : u < 80 ? 'turbo' : 'shield';
  return k;
}

function useItem(s: CorridaState, track: Track, id: PlayerId, r: Runner, kind: ItemKind) {
  if (kind === 'attack') {
    // alvo: o rival mais próximo à frente
    let target: PlayerId | null = null;
    let best = Infinity;
    for (const o of s.order) {
      const t = s.players[o]!;
      if (o === id || t.finishedAtMs !== null || t.falling || t.x <= r.x + 2) continue;
      if (t.x - r.x < best) { best = t.x - r.x; target = o; }
    }
    if (target) {
      const t = s.players[target]!;
      let hx = t.x + 120;
      for (let k = 0; k < 8 && (holeAt(track, hx) || track.beams.some((b) => Math.abs(b.x - hx) < 26) || track.crates.some((c) => Math.abs(c.x - hx) < 26)); k++) hx += 28;
      if (hx < FINISH_X - 40) {
        s.hazards.push({ id: s.nextHazardId++, x: hx, to: target, by: id });
        setFx(r, 'attack');
        setFx(t, 'warn');
        return;
      }
    }
    kind = 'turbo'; // ninguém à frente para atacar
  }
  if (kind === 'turbo') { r.turboMs = Math.max(r.turboMs, ITEM_TURBO_MS); setFx(r, 'turbo'); }
  else if (kind === 'shield') { r.shield = true; setFx(r, 'shield'); }
}

/** Batida: o escudo absorve; senão trava o corredor por um instante. */
function bonk(r: Runner, clampX: number | null) {
  if (r.shield) { r.shield = false; r.invulnMs = INVULN_MS; setFx(r, 'block'); return; }
  if (clampX !== null) r.x = clampX;
  r.stunMs = STUN_MS; r.invulnMs = BONK_INVULN_MS; r.speed *= 0.3;
}

function stepRunner(s: CorridaState, track: Track, id: PlayerId, r: Runner, inp: CorridaInput, dtMs: number) {
  const dt = dtMs / 1000;
  const wantDuck = inp.duck === true;
  if (r.finishedAtMs !== null) {
    // depois da linha: freia e para
    r.speed = Math.max(0, r.speed - 260 * dt);
    r.x = Math.min(TRACK_LENGTH + 70, r.x + r.speed * dt);
    r.y = 0; r.vy = 0; r.grounded = true; r.ducking = false; r.inMud = false; r.birds = [];
    return;
  }
  r.springMs = Math.max(0, r.springMs - dtMs);

  // queda no buraco → afunda, espera, reaparece antes dele
  if (r.falling) {
    r.vy -= GRAVITY * dt;
    r.y += r.vy * dt;
    r.speed = 0; r.ducking = false; r.inMud = false;
    for (const b of r.birds) b.x -= BIRD_SPEED * dt;
    if (r.y < -30) {
      r.respawnMs -= dtMs;
      r.y = -30; r.vy = 0;
      if (r.respawnMs <= 0) { r.falling = false; r.x = r.respawnX; r.y = 0; r.vy = 0; r.invulnMs = INVULN_MS + 150; r.grounded = true; r.stunMs = 0; r.speed = 0; }
    }
    r.prevJump = inp.jump;
    return;
  }

  r.stunMs = Math.max(0, r.stunMs - dtMs);
  r.invulnMs = Math.max(0, r.invulnMs - dtMs);
  r.turboMs = Math.max(0, r.turboMs - dtMs);
  const crates = solidsFor(s, track, id);

  // abaixar: só no chão (no ar, apertar "baixo" faz cair mais rápido)
  r.ducking = wantDuck && r.grounded && r.stunMs <= 0;
  r.inMud = r.grounded && track.muds.some((m) => r.x > m.x && r.x < m.x + m.w);

  // velocidade horizontal
  let target = inp.run > 0 ? SPRINT_SPEED : inp.run < 0 ? BRAKE_SPEED : BASE_SPEED;
  if (r.turboMs > 0) target += r.turboMs > 1500 ? TURBO_BONUS + 10 : TURBO_BONUS;
  if (r.inMud) target *= MUD_SLOW;
  if (r.ducking) target *= 0.88;
  if (r.stunMs > 0) target *= 0.3;
  const dv = target - r.speed;
  r.speed += Math.sign(dv) * Math.min(Math.abs(dv), ACCEL * dt);

  // pulo (borda de subida + buffer + coyote + altura variável)
  const edge = inp.jump && !r.prevJump;
  r.prevJump = inp.jump;
  if (edge) r.jumpBufMs = JUMP_BUFFER_MS; else r.jumpBufMs = Math.max(0, r.jumpBufMs - dtMs);
  if (r.grounded) r.coyoteMs = COYOTE_MS; else r.coyoteMs = Math.max(0, r.coyoteMs - dtMs);
  if (r.jumpBufMs > 0 && r.coyoteMs > 0 && !r.ducking) { r.vy = JUMP_VY; r.grounded = false; r.coyoteMs = 0; r.jumpBufMs = 0; }
  if (!inp.jump && r.vy > 90 && r.springMs <= 0) r.vy *= 0.55; // soltou cedo: pulo curto
  if (wantDuck && !r.grounded && r.vy < 60 && r.springMs <= 0) r.vy -= 700 * dt; // queda rápida

  // integra
  const prevY = r.y;
  const prevX = r.x;
  r.x += r.speed * dt;
  r.vy -= GRAVITY * dt;
  r.y += r.vy * dt;

  // caixas e barris: batida lateral
  if (r.invulnMs <= 0) {
    for (const c of crates) {
      if (r.y < CRATE_H - 2 && Math.abs(r.x - c.x) < CRATE_W / 2 + HALF_W && prevX < c.x) {
        bonk(r, c.x - CRATE_W / 2 - HALF_W - 0.5);
        break;
      }
    }
  }
  // barras penduradas: só passa quem está abaixado
  if (r.invulnMs <= 0) {
    const h = r.ducking ? DUCK_H : STAND_H;
    for (const b of track.beams) {
      if (r.y + h > BEAM_BOTTOM && Math.abs(r.x - b.x) < b.w / 2 + HALF_W) {
        bonk(r, Math.min(r.x, b.x - b.w / 2 - HALF_W - 0.5));
        break;
      }
    }
  }

  // pássaros: nascem quando o corredor passa do gatilho e voam contra ele, na altura da cabeça
  for (const tg of track.birds) {
    if (r.x >= tg.x && !r.collected.includes(tg.id)) { r.collected.push(tg.id); r.birds.push({ id: tg.id, x: r.x + BIRD_SPAWN }); }
  }
  if (r.birds.length) {
    for (const b of r.birds) b.x -= BIRD_SPEED * dt;
    if (r.invulnMs <= 0) {
      const h = r.ducking ? DUCK_H : STAND_H;
      for (const b of r.birds) {
        if (Math.abs(r.x - b.x) < 5 + HALF_W && r.y + h > BIRD_LO && r.y < BIRD_HI) { bonk(r, null); break; }
      }
    }
    r.birds = r.birds.filter((b) => b.x > r.x - 40);
  }

  // chão / plataformas
  const floor = floorAt(track, crates, r.x, prevY);
  if (floor === -Infinity) {
    if (r.y <= -2 && !r.grounded) { r.falling = true; r.respawnMs = RESPAWN_MS; const h = holeAt(track, r.x)!; r.respawnX = h.x - 10; }
    else if (r.grounded) { r.grounded = false; }
  }
  if (r.vy <= 0 && r.y <= floor && floor > -Infinity) { r.y = floor; r.vy = 0; r.grounded = true; }
  else if (floor === -Infinity || r.y > floor + 0.01) r.grounded = false;

  // mola (atalho)
  if (r.grounded && r.y < 1) {
    for (const sp of track.springs) {
      if (Math.abs(r.x - sp.x) < 6) { r.vy = SPRING_VY; r.grounded = false; r.springMs = 500; r.y += 0.5; break; }
    }
  }

  // seta de impulso (no chão)
  if (r.grounded && r.y < 1) {
    for (const pd of track.pads) {
      if (Math.abs(r.x - pd.x) < 8 && !r.collected.includes(pd.id)) { r.collected.push(pd.id); r.turboMs = Math.max(r.turboMs, PAD_TURBO_MS); setFx(r, 'pad'); }
    }
  }

  // moedas = impulso
  for (const c of track.coins) {
    if (Math.abs(r.x - c.x) < 6 && Math.abs(r.y - c.h) < 10 && !r.collected.includes(c.id)) {
      r.collected.push(c.id); r.coins++; r.turboMs = Math.max(r.turboMs, Math.min(1500, r.turboMs + 700));
    }
  }

  // caixas "?": pegar no chão ou pulando
  for (const b of track.boxes) {
    if (Math.abs(r.x - b.x) < 8 && Math.abs(r.y - b.h) < 14 && !r.collected.includes(b.id)) {
      r.collected.push(b.id);
      useItem(s, track, id, r, pickItem(s, b.id, id));
    }
  }

  // linha de chegada
  if (r.x >= FINISH_X) { r.finishedAtMs = s.elapsedMs; r.stunMs = 0; }
}

// ---------------------------------------------------------------- bot
interface Group { a: number; b: number; kind: 'crate' | 'hole' | 'spring' | 'beam' | 'mud'; ids: number[]; wide: boolean }

function buildGroups(track: Track): Group[] {
  const raw: Group[] = [
    ...track.crates.map((c) => ({ a: c.x - CRATE_W / 2 - HALF_W, b: c.x + CRATE_W / 2 + HALF_W, kind: 'crate' as const, ids: [c.id], wide: false })),
    ...track.holes.map((h) => ({ a: h.x + 3, b: h.x + h.w - 3, kind: 'hole' as const, ids: [h.id], wide: h.w >= 48 })),
    ...track.springs.map((s) => ({ a: s.x - 6, b: s.x + 6, kind: 'spring' as const, ids: [s.id], wide: false })),
    ...track.beams.map((b) => ({ a: b.x - b.w / 2 - HALF_W, b: b.x + b.w / 2 + HALF_W, kind: 'beam' as const, ids: [b.id], wide: false })),
    ...track.muds.map((m) => ({ a: m.x, b: m.x + m.w, kind: 'mud' as const, ids: [m.id], wide: false })),
  ].sort((p, q) => p.a - q.a);
  const out: Group[] = [];
  for (const g of raw) {
    const last = out[out.length - 1];
    if (last && g.a - last.b < 14 && last.kind === g.kind && g.kind === 'crate') { last.b = g.b; last.ids.push(...g.ids); } else out.push({ ...g });
  }
  return out;
}

const SPRING_TAKE: Record<BotDifficulty, number> = { easy: 0.1, medium: 0.5, hard: 0.9 };
const TIMING_ERR: Record<BotDifficulty, number> = { easy: 10, medium: 5, hard: 2.5 };
const MUD_AVOID: Record<BotDifficulty, number> = { easy: 0, medium: 0.4, hard: 0.85 };

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<CorridaState, CorridaInput> {
  const params = DIFFICULTY[difficulty];
  const rng: Rng = createRng(seed ^ 0xb07);
  let groups: Group[] | null = null;
  let groupsSeed = -1;
  const plan = new Map<number, { offset: number; skip: boolean; spring?: boolean }>();
  const birdSkip = new Map<number, boolean>();
  let holdMs = 0; // o bot segura o botão por um tempo, como um humano, para o pulo sair completo

  return {
    decide(state, dtMs) {
      const me = state.players[playerId];
      if (!me) return { run: 0, jump: false, duck: false };
      if (groups === null || groupsSeed !== state.seed) { groups = buildGroups(getTrack(state.seed)); groupsSeed = state.seed; plan.clear(); }
      if (me.falling || me.finishedAtMs !== null) { holdMs = 0; return { run: 0, jump: false, duck: false }; }

      const run: -1 | 0 | 1 = difficulty === 'hard' ? 1 : 0;
      const D = Math.max(40, me.speed) * AIR_TIME;
      let jump = false;
      let duck = false;
      let sprint: -1 | 0 | 1 = run;

      // próximo perigo à frente: da pista ou um barril jogado por um rival (o que vier primeiro)
      let g = groups.find((q) => q.b > me.x - 1);
      for (const h of state.hazards) {
        if (h.to !== playerId || h.x + CRATE_W / 2 + HALF_W <= me.x - 1) continue;
        const a = h.x - CRATE_W / 2 - HALF_W;
        if (!g || a < g.a) g = { a, b: h.x + CRATE_W / 2 + HALF_W, kind: 'crate', ids: [100000 + h.id], wide: false };
      }
      if (g) {
        const key = g.ids[0]!;
        let p = plan.get(key);
        if (!p) {
          const err = TIMING_ERR[difficulty];
          p = {
            offset: (rng.next() * 2 - 1) * err * (rng.chance(params.errorRate) ? 2.5 : 1), // de vez em quando erra feio
            skip: g.kind === 'crate' ? rng.chance(params.errorRate * 0.5)
              : g.kind === 'hole' ? rng.chance(params.errorRate * 0.4)
              : g.kind === 'beam' ? rng.chance(params.errorRate * 0.6)
              : g.kind === 'mud' ? !rng.chance(MUD_AVOID[difficulty])
              : false,
            spring: g.kind === 'spring' ? rng.chance(SPRING_TAKE[difficulty]) : undefined,
          };
          plan.set(key, p);
        }
        if (p.skip && me.stunMs > 0) p.skip = false; // levou a batida: agora presta atenção
        const dist = (g.a + g.b) / 2 - me.x;
        const width = g.b - g.a;
        if (g.wide && difficulty !== 'easy' && dist < 110) sprint = 1; // buraco largo: acelera
        const airborne = me.y > 3;
        if (g.kind === 'beam') {
          // abaixa um pouco antes e levanta depois de passar
          if (!p.skip && g.a - me.x <= 16 + p.offset && me.x < g.b + 1) duck = true;
        } else if (me.grounded && !airborne && !p.skip) {
          if (g.kind === 'spring') {
            if (p.spring) { sprint = difficulty === 'hard' ? 1 : sprint; }
            else if (dist - p.offset <= D / 2) jump = true;
          } else if (width > D - 8) {
            // grupo largo demais para um só pulo (ex.: sequência de caixas): pula na entrada
            if (g.a - me.x <= 8 + p.offset) jump = true;
          } else if (dist - p.offset <= D / 2) jump = true;
        }
      }
      // pássaro vindo: abaixa um instante antes de ele chegar (e levanta quando passa)
      for (const b of me.birds) {
        if (b.x < me.x - 10) continue;
        let skip = birdSkip.get(b.id);
        if (skip === undefined) { skip = rng.chance(params.errorRate * 0.6); birdSkip.set(b.id, skip); }
        const eta = (b.x - me.x) / (me.speed + BIRD_SPEED);
        if (!skip && eta < 0.42 + (difficulty === 'easy' ? 0.1 : 0)) { duck = true; jump = false; holdMs = 0; }
      }
      if (holdMs > 0) { holdMs -= dtMs; return { run: sprint, jump: true, duck: false }; }
      if (jump) holdMs = 260;
      return { run: sprint, jump, duck };
    },
  };
}

// ---------------------------------------------------------------- definição
export const corridaMaluca: MinigameDefinition<CorridaState, CorridaInput> = {
  id: 'corrida-maluca',
  name: 'Corrida Maluca',
  category: 'speed',
  mode: 'ffa',
  durationMs: DURATION_MS,
  hudUnit: '%',
  formatScore(score) {
    // quem chegou tem pontuação alta (1.000.000 - tempo em centésimos); quem não chegou, a distância percorrida
    if (score >= 900_000) return `${((1_000_000 - score) / 100).toFixed(1).replace('.', ',')} s`;
    return `${Math.min(99, Math.floor((score / FINISH_X) * 100))}% da pista`;
  },
  instructions: {
    title: 'Corrida Maluca',
    lines: [
      'Corra até a linha de chegada. Cada um na sua pista, todas iguais.',
      'PULE caixas, buracos e lama. ABAIXE para passar sob o muro baixo e sob o PÁSSARO (ou pule na hora certa).',
      'Setas dão impulso. Pegue a caixa "?": turbo, escudo ou um barril na pista de quem está na frente!',
    ],
    controls: [
      { keys: 'Espaço / ↑ / W', action: 'pular (segure para pular mais alto)' },
      { keys: '↓ / S', action: 'abaixar (túnel baixo e pássaros)' },
      { keys: '→ / D', action: 'correr mais rápido' },
      { keys: '← / A', action: 'frear' },
    ],
    touch: { stick: true, action: 'PULAR' },
  },
  neutralInput: () => ({ run: 0, jump: false, duck: false }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { run, jump, duck } = raw as Record<string, unknown>;
    if (!(run === -1 || run === 0 || run === 1) || typeof jump !== 'boolean') return null;
    return { run, jump, duck: duck === true };
  },
  createInitialState(seed, players: ParticipantInfo[]) {
    const s: CorridaState = { seed, elapsedMs: 0, order: [], players: {}, firstFinishMs: null, hazards: [], nextHazardId: 1 };
    for (const p of players) {
      s.order.push(p.id);
      s.players[p.id] = {
        slot: p.slot, x: 24, y: 0, vy: 0, speed: 0, grounded: true, coyoteMs: 0, jumpBufMs: 0, prevJump: false,
        stunMs: 0, invulnMs: 0, turboMs: 0, falling: false, respawnMs: 0, respawnX: 24, coins: 0, collected: [],
        finishedAtMs: null, springMs: 0, ducking: false, inMud: false, shield: false, birds: [], fx: '', fxSeq: 0,
      };
    }
    return s;
  },
  step(s, inputs, dtMs) {
    const track = getTrack(s.seed);
    s.elapsedMs += dtMs;
    for (const id of s.order) stepRunner(s, track, id, s.players[id]!, inputs[id] ?? { run: 0, jump: false, duck: false }, dtMs);
    if (s.hazards.length) s.hazards = s.hazards.filter((h) => { const t = s.players[h.to]!; return t.finishedAtMs === null && t.x < h.x + 60; });
    if (s.firstFinishMs === null) {
      const times = s.order.map((id) => s.players[id]!.finishedAtMs).filter((t): t is number => t !== null);
      if (times.length) s.firstFinishMs = Math.min(...times);
    }
    return s;
  },
  isFinished(s) {
    if (s.elapsedMs >= DURATION_MS) return true;
    if (s.order.every((id) => s.players[id]!.finishedAtMs !== null)) return true;
    return s.firstFinishMs !== null && s.elapsedMs >= s.firstFinishMs + LAST_CHANCE_MS;
  },
  computeResult(s) {
    return {
      kind: 'ranking',
      ranking: rankByScore(s.order.map((id) => {
        const r = s.players[id]!;
        return { playerId: id, score: r.finishedAtMs !== null ? 1_000_000 - Math.round(r.finishedAtMs / 10) : Math.floor(r.x) };
      })),
    };
  },
  timeLeftMs(s) {
    const end = s.firstFinishMs !== null ? Math.min(DURATION_MS, s.firstFinishMs + LAST_CHANCE_MS) : DURATION_MS;
    return Math.max(0, end - s.elapsedMs);
  },
  liveScores(s) {
    const out: Record<PlayerId, number> = {};
    for (const id of s.order) out[id] = Math.min(100, Math.floor((s.players[id]!.x / FINISH_X) * 100));
    return out;
  },
  createBot: createBrain,
};
