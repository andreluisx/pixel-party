import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { DIFFICULTY } from '../bots';
import { createRng, nextRandom } from '../rng';
import { rankByScore } from '../rewards';

// ---------- constantes de arena (mundo = 480x270, tiles de 16) ----------
export const ARENA_W = 480;
export const ARENA_H = 270;
export const TILE = 16;
export const WALL = 16; // anel de árvores
const HALF = 5; // meia-hitbox do jogador
const SPEED = 82; // px/s
const MAX_COINS = 7;
const SPAWN_EVERY_MS = 800;
const PICKUP_R = 9;
export const DURATION_MS = 20000;

/** Pedras (células da grade 30x16), simétricas para não favorecer ninguém. */
export const ROCK_CELLS: ReadonlyArray<readonly [number, number]> = [
  [6, 4], [7, 4], [22, 4], [23, 4], [6, 11], [7, 11], [22, 11], [23, 11],
  [14, 7], [15, 7], [14, 8], [15, 8], [10, 2], [19, 2], [10, 13], [19, 13],
];
const ROCKS = ROCK_CELLS.map(([c, r]) => ({ x: c * TILE, y: r * TILE, w: TILE, h: TILE }));

const START: ReadonlyArray<readonly [number, number]> = [[44, 44], [436, 44], [44, 226], [436, 226]];

export interface Coin { id: number; x: number; y: number; value: 1 | 3 }
export interface PTPlayer { x: number; y: number; score: number; dx: number; dy: number; slot: number }
export interface PTState {
  rng: number;
  elapsedMs: number;
  spawnTimer: number;
  nextCoinId: number;
  order: PlayerId[];
  players: Record<PlayerId, PTPlayer>;
  coins: Coin[];
}
export interface PTInput { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }

function hitsRock(x: number, y: number): boolean {
  for (const r of ROCKS) {
    if (x + HALF > r.x && x - HALF < r.x + r.w && y + HALF > r.y && y - HALF < r.y + r.h) return true;
  }
  return false;
}

function spawnCoin(s: PTState): void {
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = Math.floor(WALL + 8 + nextRandom(s) * (ARENA_W - 2 * WALL - 16));
    const y = Math.floor(WALL + 8 + nextRandom(s) * (ARENA_H - 2 * WALL - 16));
    if (hitsRock(x, y)) continue;
    const value: 1 | 3 = nextRandom(s) < 0.2 ? 3 : 1;
    s.coins.push({ id: s.nextCoinId++, x, y, value });
    return;
  }
}

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<PTState, PTInput> {
  const params = DIFFICULTY[difficulty];
  const rng = createRng(seed);
  let thinkMs = 0;
  let targetId = -1;
  let wander: PTInput | null = null;
  let wanderMs = 0;
  let stuckMs = 0;
  let lastX = -1;
  let lastY = -1;
  let current: PTInput = { dx: 0, dy: 0 };

  return {
    decide(state, dtMs) {
      const me = state.players[playerId];
      if (!me) return { dx: 0, dy: 0 };
      // detecta travamento em pedra
      if (Math.abs(me.x - lastX) < 0.2 && Math.abs(me.y - lastY) < 0.2 && (current.dx || current.dy)) stuckMs += dtMs;
      else stuckMs = 0;
      lastX = me.x;
      lastY = me.y;
      if (stuckMs > 220) {
        wander = { dx: (rng.int(-1, 1) as -1 | 0 | 1), dy: (rng.int(-1, 1) as -1 | 0 | 1) };
        wanderMs = 350;
        stuckMs = 0;
      }
      if (wanderMs > 0 && wander) {
        wanderMs -= dtMs;
        current = wander;
        return current;
      }
      thinkMs -= dtMs;
      if (thinkMs <= 0) {
        thinkMs = params.reactionMs + rng.int(0, params.jitterMs);
        if (rng.chance(params.errorRate) && state.coins.length > 0) {
          targetId = state.coins[rng.int(0, state.coins.length - 1)]!.id; // escolha ruim de propósito
        } else {
          let best = -Infinity;
          targetId = -1;
          for (const c of state.coins) {
            const d = Math.hypot(c.x - me.x, c.y - me.y);
            const val = c.value / (d + 12);
            if (val > best) { best = val; targetId = c.id; }
          }
        }
      }
      const target = state.coins.find((c) => c.id === targetId);
      if (!target) { current = { dx: 0, dy: 0 }; return current; }
      const ddx = target.x - me.x;
      const ddy = target.y - me.y;
      current = { dx: Math.abs(ddx) < 3 ? 0 : ddx > 0 ? 1 : -1, dy: Math.abs(ddy) < 3 ? 0 : ddy > 0 ? 1 : -1 };
      return current;
    },
  };
}

export const pipelineTest: MinigameDefinition<PTState, PTInput> = {
  id: 'pipeline-test',
  name: 'Arena de Teste',
  category: 'skill',
  mode: 'ffa',
  durationMs: DURATION_MS,
  instructions: {
    title: 'Arena de Teste',
    lines: [
      'Minigame provisório que valida o pipeline (servidor, bots, arte e áudio).',
      'Colete moedas. As douradas grandes valem 3 pontos.',
      'Quem tiver mais pontos em 20 segundos vence.',
    ],
    controls: [
      { keys: 'WASD / Setas', action: 'mover' },
      { keys: 'Toque', action: 'joystick virtual' },
    ],
  },
  neutralInput: () => ({ dx: 0, dy: 0 }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { dx, dy } = raw as Record<string, unknown>;
    const ok = (v: unknown): v is -1 | 0 | 1 => v === -1 || v === 0 || v === 1;
    if (!ok(dx) || !ok(dy)) return null;
    return { dx, dy };
  },
  createInitialState(seed, players: ParticipantInfo[]) {
    const s: PTState = { rng: seed | 0, elapsedMs: 0, spawnTimer: 0, nextCoinId: 1, order: [], players: {}, coins: [] };
    for (const p of players) {
      const [x, y] = START[p.slot]!;
      s.order.push(p.id);
      s.players[p.id] = { x, y, score: 0, dx: 0, dy: 0, slot: p.slot };
    }
    for (let i = 0; i < 4; i++) spawnCoin(s);
    return s;
  },
  step(s, inputs, dtMs) {
    const dt = dtMs / 1000;
    s.elapsedMs += dtMs;
    for (const id of s.order) {
      const p = s.players[id]!;
      const inp = inputs[id] ?? { dx: 0, dy: 0 };
      p.dx = inp.dx;
      p.dy = inp.dy;
      const len = Math.hypot(inp.dx, inp.dy) || 1;
      const vx = (inp.dx / len) * SPEED * dt;
      const vy = (inp.dy / len) * SPEED * dt;
      const minX = WALL + HALF, maxX = ARENA_W - WALL - HALF;
      const minY = WALL + HALF, maxY = ARENA_H - WALL - HALF;
      const nx = Math.min(maxX, Math.max(minX, p.x + vx));
      if (!hitsRock(nx, p.y)) p.x = nx;
      const ny = Math.min(maxY, Math.max(minY, p.y + vy));
      if (!hitsRock(p.x, ny)) p.y = ny;
    }
    // coleta: se dois alcançam a mesma moeda no mesmo tick, vence a ordem de slot (determinístico)
    for (const id of s.order) {
      const p = s.players[id]!;
      for (let i = s.coins.length - 1; i >= 0; i--) {
        const c = s.coins[i]!;
        if (Math.hypot(c.x - p.x, c.y - p.y) <= PICKUP_R) {
          p.score += c.value;
          s.coins.splice(i, 1);
        }
      }
    }
    s.spawnTimer += dtMs;
    while (s.spawnTimer >= SPAWN_EVERY_MS) {
      s.spawnTimer -= SPAWN_EVERY_MS;
      if (s.coins.length < MAX_COINS) spawnCoin(s);
    }
    return s;
  },
  isFinished: (s) => s.elapsedMs >= DURATION_MS,
  computeResult(s) {
    return { kind: 'ranking', ranking: rankByScore(s.order.map((id) => ({ playerId: id, score: s.players[id]!.score }))) };
  },
  timeLeftMs: (s) => Math.max(0, DURATION_MS - s.elapsedMs),
  liveScores(s) {
    const out: Record<PlayerId, number> = {};
    for (const id of s.order) out[id] = s.players[id]!.score;
    return out;
  },
  createBot: createBrain,
};
