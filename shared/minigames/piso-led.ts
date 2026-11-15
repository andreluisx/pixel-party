import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { createRng, nextRandom, type Rng } from '../rng';

/**
 * PISO DE LED — o chão acende em 3 configurações de cores, uma depois da outra. SÓ A ÚLTIMA VALE.
 * Tudo apaga, o telão anuncia uma cor e todos correm, no escuro, para uma placa que tinha essa cor
 * na última configuração. Quem estiver em outra cor é eliminado. As rodadas repetem (cada vez mais rápidas e
 * com menos placas certas) até sobrar um vencedor. Se os últimos caem juntos, ou se chegar à rodada final com
 * vários de pé, é empate.
 *
 * O servidor guarda as 3 configurações e a cor anunciada; os clientes só recebem o que já foi mostrado
 * (`publicState`), então ninguém consegue "espiar" a configuração final nem a cor antes da hora.
 */
export const COLS = 10;
export const ROWS = 6;
export const TILE = 34;
export const ARENA_X = 70;
export const ARENA_Y = 64;
export const TILES = COLS * ROWS;
const SPEED = 95;
const HALF = 5;
export const MAX_ROUNDS = 7;
export const DURATION_MS = 120000; // teto de segurança
export const COLOR_NAMES = ['VERMELHO', 'AZUL', 'VERDE', 'AMARELO', 'ROXO'] as const;
export const COLOR_HEX = ['#ff4d4d', '#3d8bff', '#3ddc6a', '#ffd23d', '#b46bff'] as const;

export type Phase = 'banner' | 'show' | 'dark' | 'judge' | 'over';

export interface RoundTimes { banner: number; showEach: number; gap: number; darkLead: number; move: number; judge: number; show: number; dark: number }
export function timesFor(round: number): RoundTimes {
  const showEach = Math.max(850, 1650 - (round - 1) * 140);
  const gap = 160, darkLead = 700;
  const move = Math.max(2200, 3600 - (round - 1) * 300);
  return { banner: 900, showEach, gap, darkLead, move, judge: 2000, show: showEach * 3 + gap * 2, dark: darkLead + move };
}
const COUNT_RANGE: [number, number][] = [[12, 16], [10, 14], [8, 12], [7, 10], [6, 9], [5, 8], [5, 7]];

export interface LedPlayer {
  slot: number; x: number; y: number; dx: number; dy: number;
  alive: boolean; elimRound: number; survived: number;
  verdict: 'ok' | 'out' | null; // só vale durante a fase "judge"
}
export interface LedState {
  rng: number; elapsedMs: number; round: number; phase: Phase; phaseMs: number;
  cfgs: number[][]; announced: number; colorsInPlay: number;
  order: PlayerId[]; players: Record<PlayerId, LedPlayer>;
}
/** O que o cliente enxerga. */
export interface LedPublic extends Omit<LedState, 'cfgs' | 'rng'> {
  rng: 0; cfgs: [];
  visible: number[] | null; // configuração acesa agora (null = tudo apagado)
  shownIdx: number; // 0..2 durante "show"
  finalCfg: number[] | null; // só na fase "judge"
  moveLeftMs: number; // tempo que resta para correr (fase "dark" depois do anúncio)
  announcedPublic: number; // -1 até o anúncio
  validTiles: number[]; // só na "judge": placas da cor anunciada
}
export interface LedInput { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }

export function tileAt(x: number, y: number): number {
  const c = Math.floor((x - ARENA_X) / TILE), r = Math.floor((y - ARENA_Y) / TILE);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
  return r * COLS + c;
}
export const tileCenter = (i: number) => ({ x: ARENA_X + (i % COLS) * TILE + TILE / 2, y: ARENA_Y + Math.floor(i / COLS) * TILE + TILE / 2 });

/** Qual configuração está acesa neste instante da fase "show". */
export function showState(s: Pick<LedState, 'phase' | 'phaseMs' | 'round' | 'cfgs'>): { idx: number; visible: number[] | null } {
  if (s.phase !== 'show') return { idx: -1, visible: null };
  const T = timesFor(s.round);
  const seg = T.showEach + T.gap;
  const idx = Math.min(2, Math.floor(s.phaseMs / seg));
  const within = s.phaseMs - idx * seg;
  return { idx, visible: within < T.showEach ? s.cfgs[idx]! : null };
}
/** Cor anunciada, ou -1 se ainda não foi revelada. */
export function revealedColor(s: Pick<LedState, 'phase' | 'phaseMs' | 'round' | 'announced'>): number {
  if (s.phase === 'judge') return s.announced;
  if (s.phase === 'dark' && s.phaseMs >= timesFor(s.round).darkLead) return s.announced;
  return -1;
}

function randomCfg(s: LedState): number[] {
  return Array.from({ length: TILES }, () => Math.floor(nextRandom(s) * s.colorsInPlay));
}

function setupRound(s: LedState) {
  s.colorsInPlay = s.round <= 2 ? 4 : 5;
  s.announced = Math.floor(nextRandom(s) * s.colorsInPlay);
  const [lo, hi] = COUNT_RANGE[Math.min(s.round, MAX_ROUNDS) - 1]!;
  const count = lo + Math.floor(nextRandom(s) * (hi - lo + 1));
  // configuração final: exatamente `count` placas da cor anunciada, o resto das outras cores
  const idx = Array.from({ length: TILES }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(s) * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
  const final = new Array<number>(TILES).fill(-1);
  for (let k = 0; k < count; k++) final[idx[k]!] = s.announced;
  const others = Array.from({ length: s.colorsInPlay }, (_, c) => c).filter((c) => c !== s.announced);
  for (let i = 0; i < TILES; i++) if (final[i] === -1) final[i] = others[Math.floor(nextRandom(s) * others.length)]!;
  // as duas primeiras só servem para confundir
  s.cfgs = [randomCfg(s), randomCfg(s), final];
  s.phase = 'banner';
  s.phaseMs = 0;
  for (const id of s.order) s.players[id]!.verdict = null;
}

function judge(s: LedState) {
  const final = s.cfgs[2]!;
  for (const id of s.order) {
    const p = s.players[id]!;
    if (!p.alive) { p.verdict = null; continue; }
    const t = tileAt(p.x, p.y);
    if (t >= 0 && final[t] === s.announced) { p.verdict = 'ok'; p.survived++; }
    else { p.verdict = 'out'; p.alive = false; p.elimRound = s.round; }
  }
}

function toPublic(s: LedState): LedPublic {
  const sh = showState(s);
  const ann = revealedColor(s);
  const T = timesFor(s.round);
  return {
    ...s, rng: 0, cfgs: [], visible: s.phase === 'judge' ? s.cfgs[2]! : sh.visible, shownIdx: sh.idx,
    finalCfg: s.phase === 'judge' ? s.cfgs[2]! : null,
    announcedPublic: ann, announced: ann,
    moveLeftMs: s.phase === 'dark' && ann >= 0 ? Math.max(0, T.dark - s.phaseMs) : 0,
    validTiles: s.phase === 'judge' ? s.cfgs[2]!.flatMap((c, i) => (c === s.announced ? [i] : [])) : [],
  };
}

// ---------------------------------------------------------------- bot
const MEMORY: Record<BotDifficulty, { acc: number; react: number; center: boolean }> = {
  easy: { acc: 0.55, react: 650, center: false },
  medium: { acc: 0.78, react: 380, center: true },
  hard: { acc: 0.93, react: 160, center: true },
};

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<LedState, LedInput> {
  const rng: Rng = createRng(seed ^ 0x1ed);
  const prm = MEMORY[difficulty];
  let memRound = -1;
  let memory: number[] = [];
  let announcedAtMs = -1;
  let target = -1;
  return {
    decide(state) {
      const me = state.players[playerId];
      if (!me || !me.alive || state.phase === 'judge' || state.phase === 'over') return { dx: 0, dy: 0 };
      // o bot só "enxerga" o que está aceso, como um humano, e lembra imperfeitamente da última configuração
      const sh = showState(state);
      if (state.phase === 'show' && sh.idx === 2 && sh.visible && memRound !== state.round) {
        memRound = state.round;
        memory = sh.visible.map((c) => (rng.chance(prm.acc) ? c : rng.int(0, state.colorsInPlay - 1)));
        target = -1; announcedAtMs = -1;
      }
      const ann = revealedColor(state);
      if (ann < 0) {
        // antes do anúncio: bots bons esperam no meio do piso
        if (prm.center && state.phase !== 'banner') {
          const cx = ARENA_X + (COLS * TILE) / 2, cy = ARENA_Y + (ROWS * TILE) / 2;
          return { dx: Math.abs(cx - me.x) < 6 ? 0 : cx > me.x ? 1 : -1, dy: Math.abs(cy - me.y) < 6 ? 0 : cy > me.y ? 1 : -1 };
        }
        return { dx: 0, dy: 0 };
      }
      if (announcedAtMs < 0) {
        announcedAtMs = state.phaseMs;
        target = -1;
      }
      if (target < 0 && state.phaseMs - announcedAtMs >= prm.react && memory.length === TILES) {
        let best = -1, bestD = Infinity;
        for (let i = 0; i < TILES; i++) {
          if (memory[i] !== ann) continue;
          const c = tileCenter(i);
          const d = Math.hypot(c.x - me.x, c.y - me.y);
          if (d < bestD) { bestD = d; best = i; }
        }
        target = best >= 0 ? best : rng.int(0, TILES - 1);
      }
      if (target < 0) return { dx: 0, dy: 0 };
      const c = tileCenter(target);
      const ddx = c.x - me.x, ddy = c.y - me.y;
      return { dx: Math.abs(ddx) < 4 ? 0 : ddx > 0 ? 1 : -1, dy: Math.abs(ddy) < 4 ? 0 : ddy > 0 ? 1 : -1 };
    },
  };
}

// ---------------------------------------------------------------- definição
const START_CELLS: ReadonlyArray<readonly [number, number]> = [[2.5, 1.5], [7.5, 1.5], [2.5, 4.5], [7.5, 4.5]];

export const pisoLed: MinigameDefinition<LedState, LedInput> = {
  id: 'piso-led',
  name: 'Piso de LED',
  category: 'memory',
  mode: 'ffa',
  durationMs: DURATION_MS,
  hudUnit: ' ✓',
  hideHud: true,
  instructions: {
    title: 'Piso de LED',
    lines: [
      'O chão acende em 3 cores, uma depois da outra. SÓ A ÚLTIMA VALE: memorize essa!',
      'Tudo apaga e o telão anuncia uma cor. Corra para uma placa que tinha essa cor na última iluminação.',
      'Quem parar em outra cor é eliminado. O último de pé vence. As rodadas ficam cada vez mais rápidas.',
    ],
    controls: [{ keys: 'WASD / Setas', action: 'mover (vale se mexer já durante as luzes)' }],
    touch: { stick: true },
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
    const s: LedState = { rng: seed | 0, elapsedMs: 0, round: 1, phase: 'banner', phaseMs: 0, cfgs: [], announced: 0, colorsInPlay: 4, order: [], players: {} };
    for (const p of players) {
      const [c, r] = START_CELLS[p.slot]!;
      s.order.push(p.id);
      s.players[p.id] = { slot: p.slot, x: ARENA_X + c * TILE, y: ARENA_Y + r * TILE, dx: 0, dy: 0, alive: true, elimRound: 0, survived: 0, verdict: null };
    }
    setupRound(s);
    return s;
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    s.elapsedMs += dtMs;
    s.phaseMs += dtMs;
    const dt = dtMs / 1000;
    // movimento: livre em todas as fases, menos no julgamento
    for (const id of s.order) {
      const p = s.players[id]!;
      const inp = s.phase === 'judge' || !p.alive ? { dx: 0, dy: 0 } : (inputs[id] ?? { dx: 0, dy: 0 });
      p.dx = inp.dx; p.dy = inp.dy;
      const len = Math.hypot(inp.dx, inp.dy) || 1;
      p.x = Math.min(ARENA_X + COLS * TILE - HALF, Math.max(ARENA_X + HALF, p.x + (inp.dx / len) * SPEED * dt));
      p.y = Math.min(ARENA_Y + ROWS * TILE - HALF, Math.max(ARENA_Y + HALF, p.y + (inp.dy / len) * SPEED * dt));
    }
    const T = timesFor(s.round);
    if (s.phase === 'banner' && s.phaseMs >= T.banner) { s.phase = 'show'; s.phaseMs = 0; }
    else if (s.phase === 'show' && s.phaseMs >= T.show) { s.phase = 'dark'; s.phaseMs = 0; }
    else if (s.phase === 'dark' && s.phaseMs >= T.dark) { judge(s); s.phase = 'judge'; s.phaseMs = 0; }
    else if (s.phase === 'judge' && s.phaseMs >= T.judge) {
      const alive = s.order.filter((id) => s.players[id]!.alive).length;
      if (alive <= 1 || s.round >= MAX_ROUNDS) { s.phase = 'over'; s.phaseMs = 0; }
      else { s.round++; setupRound(s); }
    }
    return s;
  },
  isFinished: (s) => s.phase === 'over' || s.elapsedMs >= DURATION_MS,
  computeResult(s) {
    // vivos no fim empatam no topo; eliminados ficam por rodada (quem caiu depois, ficou melhor); quem caiu junto empata
    const scored = s.order.map((id) => { const p = s.players[id]!; return { playerId: id, score: p.alive ? 1000 : p.elimRound }; }).sort((a, b) => b.score - a.score);
    let rank = 1;
    return { kind: 'ranking', ranking: scored.map((e, i) => { if (i > 0 && e.score < scored[i - 1]!.score) rank = i + 1; return { playerId: e.playerId, rank, score: e.score }; }) };
  },
  formatScore(score) { return score >= 1000 ? 'sobreviveu' : `caiu na rodada ${score}`; },
  timeLeftMs: (s) => Math.max(0, DURATION_MS - s.elapsedMs),
  liveScores(s) {
    const out: Record<PlayerId, number> = {};
    for (const id of s.order) out[id] = s.players[id]!.survived;
    return out;
  },
  hudText: (s) => `R${s.round}`,
  publicState: (s) => toPublic(s),
  createBot: createBrain,
};
