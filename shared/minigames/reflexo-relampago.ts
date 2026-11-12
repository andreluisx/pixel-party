import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { DIFFICULTY } from '../bots';
import { createRng, nextRandom, type Rng } from '../rng';
import { rankByScore } from '../rewards';

/**
 * REFLEXO RELÂMPAGO — setas aparecem em intervalos imprevisíveis; aperte a seta igual o mais rápido possível.
 * A sequência é gerada no servidor, ao vivo (nunca existe inteira), igual para os 4 jogadores.
 * Símbolos: 0=←  1=↑  2=↓  3=→
 */
export const DURATION_MS = 25000;
export const SYMBOLS = 4;
const FIRST_AT_MS = 1200;
const STOP_SPAWN_MS = DURATION_MS - 700;
const LOCK_MS = 700; // penalidade por errar
const GRACE_MS = 150; // aperto atrasado logo após a seta sumir não é erro
const ERROR_PENALTY = 3;
const BASE_POINTS = 10;
const SPEED_BONUS_MAX = 10;
const STREAK_BONUS_MAX = 5;

export interface Prompt { no: number; startMs: number; windowMs: number; symbol: number; gold: boolean }
export type ResultKind = 'hit' | 'miss' | 'error';
export interface Outcome { no: number; kind: ResultKind; pts: number; ms: number }
export interface ReflexPlayer {
  slot: number; points: number; streak: number; bestStreak: number;
  hits: number; misses: number; errors: number;
  lockMs: number; lastN: number; resolvedNo: number; reactionSum: number;
  res: Outcome | null; resSeq: number;
}
export interface ReflexState {
  rng: number; elapsedMs: number; nextAtMs: number; promptCount: number; lastExpiredAt: number;
  active: Prompt | null;
  order: PlayerId[];
  players: Record<PlayerId, ReflexPlayer>;
  history: number[]; // últimos símbolos (para não repetir demais)
}
/** k = última tecla apertada (0..3), n = contador de apertos. Só um n novo vale como aperto. */
export interface ReflexInput { k: number; n: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function spawn(s: ReflexState) {
  const p = Math.min(1, s.elapsedMs / DURATION_MS);
  const gold = nextRandom(s) < 0.12;
  let symbol = Math.floor(nextRandom(s) * SYMBOLS);
  const h = s.history;
  if (h.length >= 2 && h[h.length - 1] === symbol && h[h.length - 2] === symbol) symbol = (symbol + 1 + Math.floor(nextRandom(s) * 3)) % SYMBOLS; // no máx. 2 iguais seguidas
  h.push(symbol); if (h.length > 4) h.shift();
  const windowMs = Math.round(lerp(1100, 520, p) * (gold ? 0.8 : 1));
  s.promptCount++;
  s.active = { no: s.promptCount, startMs: s.elapsedMs, windowMs, symbol, gold };
}

function scheduleNext(s: ReflexState) {
  const p = Math.min(1, s.elapsedMs / DURATION_MS);
  const lo = lerp(300, 150, p), hi = lerp(900, 450, p);
  s.nextAtMs = s.elapsedMs + lo + nextRandom(s) * (hi - lo); // intervalo imprevisível
}

function press(s: ReflexState, pl: ReflexPlayer, key: number) {
  if (pl.lockMs > 0) return; // travado: aperto ignorado
  const a = s.active;
  if (!a && s.elapsedMs - s.lastExpiredAt < GRACE_MS) return;
  if (a && pl.resolvedNo !== a.no && key === a.symbol) {
    const ms = Math.round(s.elapsedMs - a.startMs);
    pl.streak++; pl.bestStreak = Math.max(pl.bestStreak, pl.streak);
    const speed = Math.round(SPEED_BONUS_MAX * Math.max(0, 1 - ms / a.windowMs));
    const pts = (BASE_POINTS + speed + Math.min(STREAK_BONUS_MAX, pl.streak - 1)) * (a.gold ? 2 : 1);
    pl.points += pts; pl.hits++; pl.reactionSum += ms; pl.resolvedNo = a.no;
    pl.res = { no: a.no, kind: 'hit', pts, ms }; pl.resSeq++;
    return;
  }
  // errou a seta, apertou sem seta ou apertou de novo depois de acertar
  pl.lockMs = LOCK_MS; pl.streak = 0; pl.errors++;
  const lost = Math.min(pl.points, ERROR_PENALTY);
  pl.points -= lost;
  pl.res = { no: a?.no ?? 0, kind: 'error', pts: -lost, ms: 0 }; pl.resSeq++;
}

// ---------------------------------------------------------------- bot
const REACT: Record<BotDifficulty, { mean: number; sd: number }> = {
  easy: { mean: 560, sd: 130 }, medium: { mean: 400, sd: 90 }, hard: { mean: 280, sd: 55 },
};

function gaussian(rng: Rng) { return (rng.next() + rng.next() + rng.next() - 1.5) / 0.5; } // ~N(0,1) aproximada

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<ReflexState, ReflexInput> {
  const rng = createRng(seed ^ 0xbeef);
  const { mean, sd } = REACT[difficulty];
  const errRate = DIFFICULTY[difficulty].errorRate * 0.6;
  const missRate = DIFFICULTY[difficulty].errorRate * 0.4;
  let seenNo = -1, pressAt = Infinity, key = 0, n = 0, lastK = 0;
  return {
    decide(state) {
      const a = state.active;
      if (a && a.no !== seenNo) {
        seenNo = a.no;
        if (rng.chance(missRate)) pressAt = Infinity; // distraiu e perdeu
        else {
          pressAt = a.startMs + Math.max(140, mean + gaussian(rng) * sd);
          key = rng.chance(errRate) ? (a.symbol + 1 + rng.int(0, 2)) % SYMBOLS : a.symbol; // às vezes aperta a errada
        }
      }
      if (a && a.no === seenNo && state.elapsedMs >= pressAt) { n++; lastK = key; pressAt = Infinity; }
      return { k: lastK, n };
    },
  };
}

// ---------------------------------------------------------------- definição
export const reflexoRelampago: MinigameDefinition<ReflexState, ReflexInput> = {
  id: 'reflexo-relampago',
  name: 'Reflexo Relâmpago',
  category: 'reaction',
  mode: 'ffa',
  durationMs: DURATION_MS,
  hudUnit: ' pts',
  formatScore(score) { return `${Math.max(0, Math.ceil(score / 100000))} pts`; },
  instructions: {
    title: 'Reflexo Relâmpago',
    lines: [
      'Uma seta aparece na tela. Aperte a mesma direção o mais rápido que puder.',
      'Quanto mais rápido, mais pontos. Acertos seguidos dão bônus.',
      'Setas douradas valem o dobro. Errou ou apertou sem seta? Você trava por um instante.',
    ],
    controls: [{ keys: '← ↑ ↓ → ou A W S D', action: 'apertar a direção da seta' }],
    touch: { stick: false, dpad: true },
  },
  neutralInput: () => ({ k: 0, n: 0 }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { k, n } = raw as Record<string, unknown>;
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 0 || k >= SYMBOLS) return null;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 1_000_000) return null;
    return { k, n };
  },
  createInitialState(seed, players: ParticipantInfo[]) {
    const s: ReflexState = { rng: seed | 0, elapsedMs: 0, nextAtMs: FIRST_AT_MS, promptCount: 0, lastExpiredAt: -9999, active: null, order: [], players: {}, history: [] };
    for (const p of players) {
      s.order.push(p.id);
      s.players[p.id] = { slot: p.slot, points: 0, streak: 0, bestStreak: 0, hits: 0, misses: 0, errors: 0, lockMs: 0, lastN: 0, resolvedNo: 0, reactionSum: 0, res: null, resSeq: 0 };
    }
    return s;
  },
  step(s, inputs, dtMs) {
    s.elapsedMs += dtMs;
    const t = s.elapsedMs;
    // 1) apertos entram antes de qualquer mudança da seta (chutar antes dela aparecer é erro)
    for (const id of s.order) {
      const pl = s.players[id]!;
      pl.lockMs = Math.max(0, pl.lockMs - dtMs);
      const inp = inputs[id];
      if (inp && inp.n !== pl.lastN) { pl.lastN = inp.n; press(s, pl, inp.k); }
    }
    // 2) a seta expira
    if (s.active && t >= s.active.startMs + s.active.windowMs) {
      for (const id of s.order) {
        const pl = s.players[id]!;
        if (pl.resolvedNo !== s.active.no) { pl.misses++; pl.streak = 0; pl.res = { no: s.active.no, kind: 'miss', pts: 0, ms: 0 }; pl.resSeq++; }
      }
      s.active = null; s.lastExpiredAt = t;
      scheduleNext(s);
    }
    // 3) nasce a próxima
    if (!s.active && t >= s.nextAtMs && t <= STOP_SPAWN_MS) spawn(s);
    return s;
  },
  isFinished: (s) => s.elapsedMs >= DURATION_MS,
  computeResult(s) {
    // pontos primeiro; empate: menor soma de tempos de reação
    return { kind: 'ranking', ranking: rankByScore(s.order.map((id) => { const p = s.players[id]!; return { playerId: id, score: p.points * 100000 - Math.min(99999, p.reactionSum) }; })) };
  },
  timeLeftMs: (s) => Math.max(0, DURATION_MS - s.elapsedMs),
  liveScores(s) {
    const out: Record<PlayerId, number> = {};
    for (const id of s.order) out[id] = s.players[id]!.points;
    return out;
  },
  publicState: (s) => ({ ...s, rng: 0 }), // o cliente não pode prever as próximas setas
  createBot: createBrain,
};
