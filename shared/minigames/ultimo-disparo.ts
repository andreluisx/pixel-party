import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { createRng, type Rng } from '../rng';

/**
 * ÚLTIMO DISPARO — arena vista de cima. Cada rodada:
 *  1) POSICIONAMENTO: todos ficam invisíveis uns para os outros, mas se movem e escolhem a direção de tiro (8 direções).
 *     O botão de alternância liga o MODO MIRA: o personagem para e os direcionais só mudam a mira.
 *  2) REVELAÇÃO: movimentos travam e todos aparecem ao mesmo tempo, com a linha de tiro à mostra.
 *  3) DISPAROS: todos atiram ao mesmo tempo, em linha reta. O tiro atravessa jogadores (pode acertar vários),
 *     para em obstáculos e nos limites da arena. Quem atira também pode ser atingido (eliminação simultânea).
 *  4) RESULTADO: eliminados saem; a arena fecha um anel e a próxima rodada começa.
 *
 * O SERVIDOR faz tudo: fases, posições, trajetórias e eliminações. Durante o posicionamento cada cliente recebe
 * apenas a própria posição/mira (`viewFor`), então ninguém consegue "ver" os adversários mexendo no navegador.
 */
export const COLS = 16;
export const ROWS = 10;
export const C = 16; // lado da célula
export const AX = 112;
export const AY = 52;
export const MAX_ROUNDS = 6;
export const DURATION_MS = 140000; // teto de segurança
const HALF = 5;
const SPEED = 88;
const PUSH_SPEED = 80;
export const HIT_R = 10;
export const SHOT_SPEED = 430; // px/s (animação do projétil)
const RAY_STEP = 2;

export const PHASE_MS = { intro: 1300, shrink: 1500, reveal: 1500, fire: 1900, result: 1900, over: 1700 } as const;
export const positionMs = (round: number) => Math.max(5000, 9500 - (round - 1) * 900);
export const insetFor = (round: number) => Math.min(round - 1, 3);

export type Phase = 'intro' | 'shrink' | 'position' | 'reveal' | 'fire' | 'result' | 'over';

// ------------------------------------------------------------------ geometria
/** Obstáculos (coluna, linha). Simétricos e sempre dentro da arena final (colunas 3..12, linhas 3..6). */
export const OBST_CELLS: ReadonlyArray<readonly [number, number]> = [
  [4, 3], [4, 6], [11, 3], [11, 6], [7, 4], [8, 4], [7, 5], [8, 5],
];
export const OBSTACLES = OBST_CELLS.map(([c, r]) => ({ x: AX + c * C, y: AY + r * C, w: C, h: C }));
const OBST_SET = new Set(OBST_CELLS.map(([c, r]) => r * COLS + c));

export function boundsFor(inset: number) { return { l: AX + inset * C, r: AX + (COLS - inset) * C, t: AY + inset * C, b: AY + (ROWS - inset) * C }; }

const S = Math.SQRT1_2;
/** 0=↑ 1=↗ 2=→ 3=↘ 4=↓ 5=↙ 6=← 7=↖ — vetores unitários (as diagonais são normalizadas, sem distorção). */
export const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [S, -S], [1, 0], [S, S], [0, 1], [-S, S], [-1, 0], [-S, -S]];
const SIGN_TO_DIR: Record<string, number> = { '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3, '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7 };
export function dirIndex(dx: number, dy: number): number { return SIGN_TO_DIR[`${Math.sign(dx)},${Math.sign(dy)}`] ?? -1; }

const isObstaclePx = (x: number, y: number) => OBST_SET.has(Math.floor((y - AY) / C) * COLS + Math.floor((x - AX) / C));
function hitsObstacle(x: number, y: number): boolean {
  for (const o of OBSTACLES) if (x + HALF > o.x && x - HALF < o.x + o.w && y + HALF > o.y && y - HALF < o.y + o.h) return true;
  return false;
}

export interface RayResult { len: number; ex: number; ey: number; hits: { id: PlayerId; dist: number }[] }
/** Projétil em linha reta: para no obstáculo ou no limite da arena; atravessa jogadores. */
export function castRay(inset: number, x: number, y: number, dir: number, targets: { id: PlayerId; x: number; y: number }[] = []): RayResult {
  const b = boundsFor(inset);
  const [vx, vy] = DIRS[dir]!;
  const hits: { id: PlayerId; dist: number }[] = [];
  const hit = new Set<PlayerId>();
  let len = 0;
  for (let k = 1; k <= 600; k++) {
    const d = k * RAY_STEP;
    const px = x + vx * d, py = y + vy * d;
    if (px < b.l || px > b.r || py < b.t || py > b.b) break;
    if (isObstaclePx(px, py)) break;
    len = d;
    for (const t of targets) if (!hit.has(t.id) && Math.hypot(px - t.x, py - t.y) < HIT_R) { hit.add(t.id); hits.push({ id: t.id, dist: d }); }
  }
  return { len, ex: x + vx * len, ey: y + vy * len, hits };
}

// ------------------------------------------------------------------ estado
export interface DuelPlayer {
  slot: number; x: number; y: number; dx: number; dy: number;
  aim: number; aimMode: boolean;
  alive: boolean; elimRound: number; kills: number;
}
export interface Shot { owner: PlayerId; x0: number; y0: number; dir: number; len: number; hits: { id: PlayerId; dist: number }[] }
export interface DuelState {
  elapsedMs: number; round: number; phase: Phase; phaseMs: number; inset: number;
  order: PlayerId[]; players: Record<PlayerId, DuelPlayer>;
  shots: Shot[]; fallen: PlayerId[]; // fallen: eliminados na rodada que acabou
}
export interface DuelInput { dx: -1 | 0 | 1; dy: -1 | 0 | 1; aim: boolean }

const START_CELLS: ReadonlyArray<readonly [number, number]> = [[1, 1], [14, 1], [1, 8], [14, 8]];
const START_AIM = [3, 5, 1, 7]; // cada um começa olhando para o centro

function clampTo(inset: number, p: { x: number; y: number }) {
  const b = boundsFor(inset);
  return { x: Math.min(b.r - HALF, Math.max(b.l + HALF, p.x)), y: Math.min(b.b - HALF, Math.max(b.t + HALF, p.y)) };
}
/** Se sobrar sobreposição com obstáculo, procura o ponto livre mais próximo (determinístico). */
function resolveOverlap(inset: number, p: { x: number; y: number }) {
  if (!hitsObstacle(p.x, p.y)) return;
  for (let r = 2; r <= 60; r += 2) {
    for (let k = 0; k < 8; k++) {
      const q = clampTo(inset, { x: p.x + DIRS[k]![0] * r, y: p.y + DIRS[k]![1] * r });
      if (!hitsObstacle(q.x, q.y)) { p.x = q.x; p.y = q.y; return; }
    }
  }
}

function startPhase(s: DuelState, phase: Phase) { s.phase = phase; s.phaseMs = 0; }

function fireShots(s: DuelState) {
  s.shots = [];
  const targets = s.order.filter((id) => s.players[id]!.alive).map((id) => ({ id, x: s.players[id]!.x, y: s.players[id]!.y }));
  for (const id of s.order) {
    const p = s.players[id]!;
    if (!p.alive) continue;
    const r = castRay(s.inset, p.x, p.y, p.aim, targets.filter((t) => t.id !== id));
    s.shots.push({ owner: id, x0: p.x, y0: p.y, dir: p.aim, len: r.len, hits: r.hits });
  }
}

function applyHits(s: DuelState) {
  const victims = new Set<PlayerId>();
  for (const sh of s.shots) { s.players[sh.owner]!.kills += sh.hits.length; for (const h of sh.hits) victims.add(h.id); }
  s.fallen = [...victims];
  for (const id of victims) { const p = s.players[id]!; p.alive = false; p.elimRound = s.round; }
}

// ------------------------------------------------------------------ bot
const BOT: Record<BotDifficulty, { aimNoise: number; skill: number; samples: number; think: boolean }> = {
  easy: { aimNoise: 0.6, skill: 0.1, samples: 3, think: false },
  medium: { aimNoise: 0.2, skill: 0.6, samples: 9, think: false },
  hard: { aimNoise: 0.03, skill: 1, samples: 12, think: true },
};

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<DuelState, DuelInput> {
  const prm = BOT[difficulty];
  const rng: Rng = createRng(seed ^ 0xd15c);
  const known: Record<PlayerId, { x: number; y: number }> = {}; // só o que já foi VISTO (revelação/resultado)
  let planRound = -1;
  let target = { x: 0, y: 0 };
  let aimIdx = 0;

  const freeSpot = (b: ReturnType<typeof boundsFor>) => {
    for (let k = 0; k < 20; k++) {
      const c = { x: b.l + HALF + rng.next() * (b.r - b.l - 2 * HALF), y: b.t + HALF + rng.next() * (b.b - b.t - 2 * HALF) };
      if (!hitsObstacle(c.x, c.y)) return c;
    }
    return { x: (b.l + b.r) / 2, y: b.t + HALF };
  };
  const openness = (inset: number, c: { x: number; y: number }) => { let o = 0; for (let d = 0; d < 8; d++) o += castRay(inset, c.x, c.y, d).len; return o; };

  const plan = (s: DuelState, me: DuelPlayer) => {
    const b = boundsFor(s.inset);
    const foes = s.order.filter((id) => id !== playerId && s.players[id]!.alive && known[id]).map((id) => ({ id, ...known[id]! }));
    // "o que um jogador esperto faria": onde os adversários provavelmente vão ficar (cantos e atrás de pilares)
    let prior: { id: string; x: number; y: number; w: number }[] = [];
    if (prm.think) {
      for (let i = 0; i < 28; i++) { const c = freeSpot(b); const o = openness(s.inset, c); prior.push({ id: `p${i}`, ...c, w: 1 / Math.pow(o + 60, 2) }); }
      const tot = prior.reduce((a, q) => a + q.w, 0);
      prior = prior.map((q) => ({ ...q, w: q.w / tot }));
    }
    const exposure = (c: { x: number; y: number }) => { // chance de algum inimigo plausível ter uma linha de tiro até mim
      let e = 0;
      for (let d = 0; d < 8; d++) for (const h of castRay(s.inset, c.x, c.y, d, prior).hits) e += prior.find((q) => q.id === h.id)!.w;
      return e;
    };
    const cand: { c: { x: number; y: number }; score: number }[] = [];
    for (let i = 0; i < prm.samples; i++) {
      const c = freeSpot(b);
      const open = prm.think ? 0 : openness(s.inset, c);
      let seen = 0;
      for (const f of foes) for (let d = 0; d < 8; d++) { if (castRay(s.inset, f.x, f.y, d, [{ id: playerId, x: c.x, y: c.y }]).hits.length) { seen++; break; } }
      const score = prm.skill * ((prm.think ? exposure(c) * 900 : open) + seen * 120) + (1 - prm.skill) * rng.next() * 900 + Math.hypot(c.x - me.x, c.y - me.y) * 0.08;
      cand.push({ c, score });
    }
    cand.sort((a, b2) => a.score - b2.score);
    target = (prm.think ? cand[rng.int(0, Math.min(2, cand.length - 1))] : cand[0])!.c; // difícil mistura entre os 3 melhores (imprevisível)
    // mira: linha com mais probabilidade de cruzar alguém (modelo de onde ficam) + inimigo conhecido na linha
    const targets = prm.think ? [...prior, ...foes.map((f) => ({ ...f, w: 0.05 }))] : foes.map((f) => ({ ...f, w: 1 }));
    const rays = Array.from({ length: 8 }, (_, d) => {
      const r = castRay(s.inset, target.x, target.y, d, targets);
      const hitScore = r.hits.reduce((a, h) => a + (targets.find((q) => q.id === h.id)?.w ?? 0), 0);
      return { d, sc: (prm.think ? hitScore * 1000 : r.hits.length * 300) + r.len * (prm.think ? 0.05 : prm.skill) + rng.next() * (prm.think ? 2 : 60) };
    }).sort((x, y) => y.sc - x.sc);
    aimIdx = rays[0]!.d;
    if (rng.chance(prm.aimNoise)) aimIdx = rng.int(0, 7);
  };

  return {
    decide(s) {
      const me = s.players[playerId];
      if (!me) return { dx: 0, dy: 0, aim: false };
      // só atualiza o que viu quando todos estão visíveis (fora do posicionamento)
      if (s.phase !== 'position') for (const id of s.order) if (id !== playerId) { const p = s.players[id]!; known[id] = { x: p.x, y: p.y }; }
      if (!me.alive || s.phase !== 'position') return { dx: 0, dy: 0, aim: false };
      if (planRound !== s.round) { planRound = s.round; plan(s, me); }
      const left = positionMs(s.round) - s.phaseMs;
      const ddx = target.x - me.x, ddy = target.y - me.y;
      const arrived = Math.hypot(ddx, ddy) < 5;
      if (arrived || left < 1100) {
        const [ax, ay] = DIRS[aimIdx]!;
        return { dx: Math.sign(Math.round(ax * 1.01)) as -1 | 0 | 1, dy: Math.sign(Math.round(ay * 1.01)) as -1 | 0 | 1, aim: true };
      }
      return { dx: Math.abs(ddx) < 3 ? 0 : ddx > 0 ? 1 : -1, dy: Math.abs(ddy) < 3 ? 0 : ddy > 0 ? 1 : -1, aim: false };
    },
  };
}

// ------------------------------------------------------------------ definição
export const ultimoDisparo: MinigameDefinition<DuelState, DuelInput> = {
  id: 'ultimo-disparo',
  name: 'Último Disparo',
  category: 'combat',
  mode: 'ffa',
  durationMs: DURATION_MS,
  hudUnit: ' abates',
  hideHud: true,
  instructions: {
    title: 'Último Disparo',
    lines: [
      'Todos ficam INVISÍVEIS. Mova-se e escolha para onde vai atirar. Quando o tempo acabar, todos aparecem e disparam ao mesmo tempo!',
      'Aperte o botão MIRAR (ou E / Espaço): o personagem para e as setas só giram a mira, em 8 direções. Aperte de novo para voltar a andar.',
      'O tiro atravessa jogadores, mas para nas pedras e nas bordas. A arena fecha a cada rodada. O último de pé vence; empate é possível.',
    ],
    controls: [
      { keys: 'WASD / Setas', action: 'mover (ou mirar, no modo mira)' },
      { keys: 'E / Espaço', action: 'alternar MOVER ↔ MIRAR' },
    ],
    touch: { stick: true, aimToggle: true },
  },
  neutralInput: () => ({ dx: 0, dy: 0, aim: false }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { dx, dy, aim } = raw as Record<string, unknown>;
    const ok = (v: unknown): v is -1 | 0 | 1 => v === -1 || v === 0 || v === 1;
    if (!ok(dx) || !ok(dy) || typeof aim !== 'boolean') return null;
    return { dx, dy, aim };
  },
  createInitialState(_seed, players: ParticipantInfo[]) {
    const s: DuelState = { elapsedMs: 0, round: 1, phase: 'intro', phaseMs: 0, inset: 0, order: [], players: {}, shots: [], fallen: [] };
    for (const p of players) {
      const [c, r] = START_CELLS[p.slot]!;
      s.order.push(p.id);
      s.players[p.id] = { slot: p.slot, x: AX + c * C + C / 2, y: AY + r * C + C / 2, dx: 0, dy: 0, aim: START_AIM[p.slot]!, aimMode: false, alive: true, elimRound: 0, kills: 0 };
    }
    return s;
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over' && s.phaseMs >= PHASE_MS.over) return s;
    s.elapsedMs += dtMs;
    s.phaseMs += dtMs;
    const dt = dtMs / 1000;
    const b = boundsFor(s.inset);

    for (const id of s.order) {
      const p = s.players[id]!;
      p.dx = 0; p.dy = 0;
      if (!p.alive) continue;
      if (s.phase === 'position') {
        const inp = inputs[id] ?? { dx: 0, dy: 0, aim: false };
        p.aimMode = inp.aim;
        if (inp.aim) {
          const d = dirIndex(inp.dx, inp.dy);
          if (d >= 0) p.aim = d; // modo mira: o personagem NÃO se move, só gira a mira
        } else {
          p.dx = inp.dx; p.dy = inp.dy;
          const len = Math.hypot(inp.dx, inp.dy) || 1;
          const nx = Math.min(b.r - HALF, Math.max(b.l + HALF, p.x + (inp.dx / len) * SPEED * dt));
          if (!hitsObstacle(nx, p.y)) p.x = nx;
          const ny = Math.min(b.b - HALF, Math.max(b.t + HALF, p.y + (inp.dy / len) * SPEED * dt));
          if (!hitsObstacle(p.x, ny)) p.y = ny;
        }
      } else if (s.phase === 'shrink') {
        // a borda fecha: quem estava no anel é empurrado com suavidade (ninguém é eliminado por isso)
        const t = clampTo(s.inset, p);
        const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
        if (d > 0) { const m = Math.min(d, PUSH_SPEED * dt); p.x += (dx / d) * m; p.y += (dy / d) * m; }
      }
    }

    switch (s.phase) {
      case 'intro': if (s.phaseMs >= PHASE_MS.intro) startPhase(s, 'position'); break;
      case 'shrink':
        if (s.phaseMs >= PHASE_MS.shrink) {
          for (const id of s.order) { const p = s.players[id]!; Object.assign(p, clampTo(s.inset, p)); resolveOverlap(s.inset, p); }
          startPhase(s, 'position');
        }
        break;
      case 'position': if (s.phaseMs >= positionMs(s.round)) { for (const id of s.order) s.players[id]!.aimMode = false; startPhase(s, 'reveal'); } break;
      case 'reveal': if (s.phaseMs >= PHASE_MS.reveal) { fireShots(s); startPhase(s, 'fire'); } break;
      case 'fire': if (s.phaseMs >= PHASE_MS.fire) { applyHits(s); startPhase(s, 'result'); } break;
      case 'result':
        if (s.phaseMs >= PHASE_MS.result) {
          const alive = s.order.filter((id) => s.players[id]!.alive).length;
          if (alive <= 1 || s.round >= MAX_ROUNDS) startPhase(s, 'over');
          else {
            s.round++; s.shots = []; s.fallen = [];
            const next = insetFor(s.round);
            const closing = next !== s.inset;
            s.inset = next;
            startPhase(s, closing ? 'shrink' : 'position');
          }
        }
        break;
      case 'over': break;
    }
    return s;
  },
  isFinished: (s) => (s.phase === 'over' && s.phaseMs >= PHASE_MS.over) || s.elapsedMs >= DURATION_MS,
  computeResult(s) {
    // 1) sobreviventes no topo; senão, quem caiu mais tarde; 2) mais abates; 3) igual = EMPATE (mesma colocação)
    const scored = s.order.map((id) => { const p = s.players[id]!; return { playerId: id, score: (p.alive ? 1000 : p.elimRound) * 100 + Math.min(99, p.kills) }; }).sort((a, b) => b.score - a.score);
    let rank = 1;
    const kills: Record<PlayerId, number> = {};
    for (const id of s.order) kills[id] = s.players[id]!.kills;
    return { kind: 'ranking', ranking: scored.map((e, i) => { if (i > 0 && e.score < scored[i - 1]!.score) rank = i + 1; return { playerId: e.playerId, rank, score: e.score }; }), kills };
  },
  formatScore(score) {
    const base = Math.floor(score / 100), kills = score % 100;
    return `${base >= 1000 ? 'sobreviveu' : `caiu na rodada ${base}`} · ${kills} ${kills === 1 ? 'abate' : 'abates'}`;
  },
  timeLeftMs: (s) => Math.max(0, DURATION_MS - s.elapsedMs),
  liveScores(s) {
    const out: Record<PlayerId, number> = {};
    for (const id of s.order) out[id] = s.players[id]!.kills;
    return out;
  },
  hudText: (s) => `R${s.round}`,
  inputLocked: (s) => s.phase !== 'position',
  /** Cada jogador só enxerga a si mesmo durante o posicionamento (invisibilidade de verdade). */
  viewFor(s, viewer) {
    if (s.phase !== 'position') return s;
    const players: Record<PlayerId, DuelPlayer> = {};
    for (const id of s.order) {
      const p = s.players[id]!;
      players[id] = id === viewer ? p : { ...p, x: -1000, y: -1000, dx: 0, dy: 0, aim: -1, aimMode: false };
    }
    return { ...s, players };
  },
  createBot: createBrain,
};
