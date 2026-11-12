import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { DIFFICULTY } from '../bots';
import { createRng, type Rng } from '../rng';
import { rankByScore } from '../rewards';

/**
 * CORRIDA MALUCA — 4 pistas paralelas idênticas (mesma seed). Correr, pular, desviar, evitar buracos,
 * pegar o atalho da mola e coletar moedas (dão um impulso). Ganha quem chega primeiro.
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
export const AIR_TIME = (2 * JUMP_VY) / GRAVITY;

// geometria de tela compartilhada com a view
export const LANE_H = 67;
export const GROUND_LOCAL_Y = 57;

export interface Crate { id: number; x: number } // x = centro
export interface Hole { id: number; x: number; w: number } // x = borda esquerda
export interface Spring { id: number; x: number }
export interface Platform { id: number; x: number; w: number; h: number } // x = borda esquerda, h = altura da superfície
export interface CoinItem { id: number; x: number; h: number }
export interface Track { length: number; crates: Crate[]; holes: Hole[]; springs: Spring[]; platforms: Platform[]; coins: CoinItem[] }

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

type Pattern = 'rock1' | 'rock2' | 'hole' | 'bridge' | 'wide' | 'gauntlet' | 'combo' | 'coins';

export function generateTrack(seed: number): Track {
  const rng = createRng(seed ^ 0x5eed);
  const tr: Track = { length: TRACK_LENGTH, crates: [], holes: [], springs: [], platforms: [], coins: [] };
  let id = 1;
  let x = 230;
  const arc = (cx: number, n = 5) => {
    const hs = [8, 19, 26, 19, 8];
    for (let i = 0; i < n; i++) tr.coins.push({ id: id++, x: cx - 24 + i * 12, h: hs[i % hs.length]! });
  };
  const line = (x0: number, n: number, h = 6) => { for (let i = 0; i < n; i++) tr.coins.push({ id: id++, x: x0 + i * 11, h }); };

  while (x < TRACK_LENGTH - 260) {
    const p = x / TRACK_LENGTH;
    const pool: [Pattern, number][] =
      p < 0.25 ? [['rock1', 3], ['rock2', 2], ['hole', 3], ['coins', 1]]
      : p < 0.6 ? [['rock1', 2], ['rock2', 3], ['hole', 3], ['bridge', 3], ['gauntlet', 2], ['coins', 1]]
      : [['rock2', 3], ['bridge', 2], ['wide', 3], ['gauntlet', 3], ['hole', 2], ['combo', 2]];
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let r = rng.next() * total;
    let pat: Pattern = pool[0]![0];
    for (const [k, w] of pool) { if ((r -= w) < 0) { pat = k; break; } }

    let len = 0;
    switch (pat) {
      case 'rock1': tr.crates.push({ id: id++, x: x + 6 }); arc(x + 6); len = 12; break;
      case 'rock2': tr.crates.push({ id: id++, x: x + 6 }, { id: id++, x: x + 36 }); len = 42; break;
      case 'hole': { const w = rng.int(28, 36); tr.holes.push({ id: id++, x, w }); arc(x + w / 2); len = w; break; }
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
    }
    const gap = Math.round(110 - 34 * p) + rng.int(0, 24);
    x += len + gap;
  }
  return tr;
}

// ---------------------------------------------------------------- estado
export interface Runner {
  slot: number;
  x: number; y: number; vy: number; speed: number;
  grounded: boolean; coyoteMs: number; jumpBufMs: number; prevJump: boolean;
  stunMs: number; invulnMs: number; turboMs: number;
  falling: boolean; respawnMs: number; respawnX: number;
  coins: number; collected: number[];
  finishedAtMs: number | null;
  springMs: number; // > 0 logo após usar a mola (para o visual)
}
export interface CorridaState {
  seed: number;
  elapsedMs: number;
  order: PlayerId[];
  players: Record<PlayerId, Runner>;
  firstFinishMs: number | null;
}
export interface CorridaInput { run: -1 | 0 | 1; jump: boolean }

function holeAt(track: Track, x: number): Hole | undefined {
  return track.holes.find((h) => x > h.x + 3 && x < h.x + h.w - 3);
}

/** Maior superfície sólida sob o corredor (plataformas e topo de caixas são "de mão única"). */
function floorAt(track: Track, x: number, prevY: number): number {
  let floor = holeAt(track, x) ? -Infinity : 0;
  for (const pl of track.platforms) {
    if (x >= pl.x - HALF_W + 1 && x <= pl.x + pl.w + HALF_W - 1 && prevY >= pl.h - 0.5 && pl.h > floor) floor = pl.h;
  }
  for (const c of track.crates) {
    if (Math.abs(x - c.x) <= CRATE_W / 2 + 2 && prevY >= CRATE_H - 0.5 && CRATE_H > floor) floor = CRATE_H;
  }
  return floor;
}

function stepRunner(s: CorridaState, track: Track, r: Runner, inp: CorridaInput, dtMs: number) {
  const dt = dtMs / 1000;
  if (r.finishedAtMs !== null) {
    // depois da linha: freia e para
    r.speed = Math.max(0, r.speed - 260 * dt);
    r.x = Math.min(TRACK_LENGTH + 70, r.x + r.speed * dt);
    r.y = 0; r.vy = 0; r.grounded = true;
    return;
  }
  r.springMs = Math.max(0, r.springMs - dtMs);

  // queda no buraco → afunda, espera, reaparece antes dele
  if (r.falling) {
    r.vy -= GRAVITY * dt;
    r.y += r.vy * dt;
    r.speed = 0;
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

  // velocidade horizontal
  let target = inp.run > 0 ? SPRINT_SPEED : inp.run < 0 ? BRAKE_SPEED : BASE_SPEED;
  if (r.turboMs > 0) target += TURBO_BONUS;
  if (r.stunMs > 0) target *= 0.3;
  const dv = target - r.speed;
  r.speed += Math.sign(dv) * Math.min(Math.abs(dv), ACCEL * dt);

  // pulo (borda de subida + buffer + coyote + altura variável)
  const edge = inp.jump && !r.prevJump;
  r.prevJump = inp.jump;
  if (edge) r.jumpBufMs = JUMP_BUFFER_MS; else r.jumpBufMs = Math.max(0, r.jumpBufMs - dtMs);
  if (r.grounded) r.coyoteMs = COYOTE_MS; else r.coyoteMs = Math.max(0, r.coyoteMs - dtMs);
  if (r.jumpBufMs > 0 && r.coyoteMs > 0) { r.vy = JUMP_VY; r.grounded = false; r.coyoteMs = 0; r.jumpBufMs = 0; }
  if (!inp.jump && r.vy > 90 && r.springMs <= 0) r.vy *= 0.55; // soltou cedo: pulo curto

  // integra
  const prevY = r.y;
  const prevX = r.x;
  r.x += r.speed * dt;
  r.vy -= GRAVITY * dt;
  r.y += r.vy * dt;

  // caixas: batida lateral
  if (r.invulnMs <= 0) {
    for (const c of track.crates) {
      if (r.y < CRATE_H - 2 && Math.abs(r.x - c.x) < CRATE_W / 2 + HALF_W && prevX < c.x) {
        r.x = c.x - CRATE_W / 2 - HALF_W - 0.5;
        r.stunMs = STUN_MS; r.invulnMs = INVULN_MS; r.speed *= 0.3;
        break;
      }
    }
  }

  // chão / plataformas
  const floor = floorAt(track, r.x, prevY);
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

  // moedas = impulso
  for (const c of track.coins) {
    if (Math.abs(r.x - c.x) < 6 && Math.abs(r.y - c.h) < 10 && !r.collected.includes(c.id)) {
      r.collected.push(c.id); r.coins++; r.turboMs = Math.min(1500, r.turboMs + 700);
    }
  }

  // linha de chegada
  if (r.x >= FINISH_X) { r.finishedAtMs = s.elapsedMs; r.stunMs = 0; }
}

// ---------------------------------------------------------------- bot
interface Group { a: number; b: number; kind: 'crate' | 'hole' | 'spring'; ids: number[]; wide: boolean }

function buildGroups(track: Track): Group[] {
  const raw: Group[] = [
    ...track.crates.map((c) => ({ a: c.x - CRATE_W / 2 - HALF_W, b: c.x + CRATE_W / 2 + HALF_W, kind: 'crate' as const, ids: [c.id], wide: false })),
    ...track.holes.map((h) => ({ a: h.x + 3, b: h.x + h.w - 3, kind: 'hole' as const, ids: [h.id], wide: h.w >= 48 })),
    ...track.springs.map((s) => ({ a: s.x - 6, b: s.x + 6, kind: 'spring' as const, ids: [s.id], wide: false })),
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

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<CorridaState, CorridaInput> {
  const params = DIFFICULTY[difficulty];
  const rng: Rng = createRng(seed ^ 0xb07);
  let groups: Group[] | null = null;
  let groupsSeed = -1;
  const plan = new Map<number, { offset: number; skip: boolean; spring?: boolean }>();
  let holdMs = 0; // o bot segura o botão por um tempo, como um humano, para o pulo sair completo

  return {
    decide(state, dtMs) {
      const me = state.players[playerId];
      if (!me) return { run: 0, jump: false };
      if (groups === null || groupsSeed !== state.seed) { groups = buildGroups(getTrack(state.seed)); groupsSeed = state.seed; plan.clear(); }
      if (me.falling || me.finishedAtMs !== null) { holdMs = 0; return { run: 0, jump: false }; }

      const run: -1 | 0 | 1 = difficulty === 'hard' ? 1 : 0;
      const D = Math.max(40, me.speed) * AIR_TIME;
      let jump = false;
      let sprint: -1 | 0 | 1 = run;

      // próximo grupo de perigo à frente
      const g = groups.find((q) => q.b > me.x - 1);
      if (g) {
        const key = g.ids[0]!;
        let p = plan.get(key);
        if (!p) {
          const err = TIMING_ERR[difficulty];
          p = {
            offset: (rng.next() * 2 - 1) * err * (rng.chance(params.errorRate) ? 2.5 : 1), // de vez em quando erra feio
            skip: g.kind === 'crate' ? rng.chance(params.errorRate * 0.5) : g.kind === 'hole' ? rng.chance(params.errorRate * 0.4) : false,
            spring: g.kind === 'spring' ? rng.chance(SPRING_TAKE[difficulty]) : undefined,
          };
          plan.set(key, p);
        }
        const dist = (g.a + g.b) / 2 - me.x;
        const width = g.b - g.a;
        if (g.wide && difficulty !== 'easy' && dist < 110) sprint = 1; // buraco largo: acelera
        const airborne = me.y > 3;
        if (me.grounded && !airborne && !p.skip) {
          if (g.kind === 'spring') {
            if (p.spring) { sprint = difficulty === 'hard' ? 1 : sprint; }
            else if (dist - p.offset <= D / 2) jump = true;
          } else if (width > D - 8) {
            // grupo largo demais para um só pulo (ex.: sequência de caixas): pula na entrada
            if (g.a - me.x <= 8 + p.offset) jump = true;
          } else if (dist - p.offset <= D / 2) jump = true;
        }
      }
      if (holdMs > 0) { holdMs -= dtMs; return { run: sprint, jump: true }; }
      if (jump) holdMs = 260;
      return { run: sprint, jump };
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
      'Pule caixas e buracos. Caiu no buraco? Você perde uns segundos.',
      'A mola leva você por cima de um trecho cheio de caixas. Moedas dão impulso!',
    ],
    controls: [
      { keys: 'Espaço / ↑ / W', action: 'pular (segure para pular mais alto)' },
      { keys: '→ / D', action: 'correr mais rápido' },
      { keys: '← / A', action: 'frear' },
    ],
    touch: { stick: true, action: 'PULAR' },
  },
  neutralInput: () => ({ run: 0, jump: false }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { run, jump } = raw as Record<string, unknown>;
    if (!(run === -1 || run === 0 || run === 1) || typeof jump !== 'boolean') return null;
    return { run, jump };
  },
  createInitialState(seed, players: ParticipantInfo[]) {
    const s: CorridaState = { seed, elapsedMs: 0, order: [], players: {}, firstFinishMs: null };
    for (const p of players) {
      s.order.push(p.id);
      s.players[p.id] = {
        slot: p.slot, x: 24, y: 0, vy: 0, speed: 0, grounded: true, coyoteMs: 0, jumpBufMs: 0, prevJump: false,
        stunMs: 0, invulnMs: 0, turboMs: 0, falling: false, respawnMs: 0, respawnX: 24, coins: 0, collected: [],
        finishedAtMs: null, springMs: 0,
      };
    }
    return s;
  },
  step(s, inputs, dtMs) {
    const track = getTrack(s.seed);
    s.elapsedMs += dtMs;
    for (const id of s.order) stepRunner(s, track, s.players[id]!, inputs[id] ?? { run: 0, jump: false }, dtMs);
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
