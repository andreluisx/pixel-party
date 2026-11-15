import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { DIFFICULTY } from '../bots';
import { createRng, nextRandom, type Rng } from '../rng';
import { rankByScore } from '../rewards';

/**
 * QUEBRA-CABEÇA RELÂMPAGO — todos recebem a MESMA imagem pixel art em 16 peças (4x4), embaralhada do mesmo jeito.
 * Trocar duas peças de lugar por jogada. Quem montar primeiro vence; os outros têm mais 6 s depois do primeiro.
 * Quem não terminar vale pelas peças que estão no lugar certo. O servidor guarda cada tabuleiro e valida cada troca.
 */
export const GRID = 4;
export const PIECES = GRID * GRID;
export const PICTURES = 6; // imagens diferentes (desenhadas no cliente; o servidor só sorteia o número)
export const DURATION_MS = 45000;
export const LAST_CHANCE_MS = 6000;
const MIN_SWAP_GAP_MS = 90; // anti-spam: no máximo ~11 trocas por segundo
const MIN_MISPLACED = 13;

export interface PuzzlePlayer {
  slot: number;
  board: number[]; // board[posição] = id da peça (a peça k pertence à posição k)
  correct: number; swaps: number; invalid: number;
  lastN: number; lastSwapAt: number; finishedAtMs: number | null;
}
export interface PuzzleState {
  seed: number; picture: number; elapsedMs: number; firstFinishMs: number | null;
  order: PlayerId[]; players: Record<PlayerId, PuzzlePlayer>;
}
/** {a,b} = posições a trocar; n = contador (só um n novo vale como pedido de troca). */
export interface PuzzleInput { a: number; b: number; n: number }

export const countCorrect = (board: number[]) => board.reduce((c, v, i) => c + (v === i ? 1 : 0), 0);

/** Embaralha com garantia de bagunça (>= 13 peças fora do lugar), igual para todos os jogadores. */
function shuffled(s: { rng: number }): number[] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const b = Array.from({ length: PIECES }, (_, i) => i);
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(s) * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; }
    if (PIECES - countCorrect(b) >= MIN_MISPLACED) return b;
  }
  return Array.from({ length: PIECES }, (_, i) => (i + 1) % PIECES);
}

/** Menor número de trocas que resolve o tabuleiro (peças - ciclos). */
export function minSwaps(board: number[]): number {
  const seen = new Array(PIECES).fill(false);
  let cycles = 0;
  for (let i = 0; i < PIECES; i++) { if (seen[i]) continue; cycles++; let j = i; while (!seen[j]) { seen[j] = true; j = board[j]!; } }
  return PIECES - cycles;
}

// ---------------------------------------------------------------- bot
const SPEED: Record<BotDifficulty, { base: number; jitter: number; start: number }> = {
  easy: { base: 3300, jitter: 700, start: 1800 },
  medium: { base: 2100, jitter: 400, start: 1400 },
  hard: { base: 1350, jitter: 250, start: 1000 },
};

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<PuzzleState, PuzzleInput> {
  const rng: Rng = createRng(seed ^ 0x9a22);
  const sp = SPEED[difficulty];
  const err = DIFFICULTY[difficulty].errorRate * 0.5;
  let nextAt = sp.start;
  let n = 0, a = 0, b = 1;
  return {
    decide(s) {
      const me = s.players[playerId];
      if (!me || me.finishedAtMs !== null) return { a, b, n };
      if (s.elapsedMs >= nextAt) {
        nextAt = s.elapsedMs + sp.base + (rng.next() * 2 - 1) * sp.jitter;
        const wrong = me.board.map((v, i) => (v !== i ? i : -1)).filter((i) => i >= 0);
        if (wrong.length) {
          if (rng.chance(err)) { a = rng.int(0, PIECES - 1); b = (a + rng.int(1, PIECES - 1)) % PIECES; } // errou de peça
          else { const p = wrong[rng.int(0, wrong.length - 1)]!; a = p; b = me.board.indexOf(p); } // põe no lugar a peça certa daquela posição
          n++;
        }
      }
      return { a, b, n };
    },
  };
}

// ---------------------------------------------------------------- definição
export const quebraCabeca: MinigameDefinition<PuzzleState, PuzzleInput> = {
  id: 'quebra-cabeca',
  name: 'Quebra-Cabeça Relâmpago',
  category: 'logic',
  mode: 'ffa',
  durationMs: DURATION_MS,
  hudUnit: '/16',
  hideHud: true,
  instructions: {
    title: 'Quebra-Cabeça Relâmpago',
    lines: [
      'Todos recebem a mesma imagem em pixel art, embaralhada em 16 peças. Use o MODELO como guia.',
      'Toque numa peça e depois em outra para trocá-las de lugar. No teclado: setas para escolher, Espaço ou Enter para pegar e soltar.',
      'Quem montar primeiro vence! Se ninguém terminar, vence quem tiver mais peças no lugar certo.',
    ],
    controls: [
      { keys: 'Mouse / toque', action: 'clicar em duas peças para trocar' },
      { keys: 'Setas + Espaço/Enter', action: 'escolher e trocar pelo teclado' },
    ],
    touch: { stick: false },
  },
  neutralInput: () => ({ a: 0, b: 0, n: 0 }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { a, b, n } = raw as Record<string, unknown>;
    const idx = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < PIECES;
    if (!idx(a) || !idx(b) || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 1_000_000) return null;
    return { a, b, n };
  },
  createInitialState(seed, players: ParticipantInfo[]) {
    const g = { rng: seed | 0 };
    const picture = Math.abs(seed) % PICTURES;
    const start = shuffled(g);
    const s: PuzzleState = { seed, picture, elapsedMs: 0, firstFinishMs: null, order: [], players: {} };
    for (const p of players) {
      s.order.push(p.id);
      s.players[p.id] = { slot: p.slot, board: [...start], correct: countCorrect(start), swaps: 0, invalid: 0, lastN: 0, lastSwapAt: -9999, finishedAtMs: null };
    }
    return s;
  },
  step(s, inputs, dtMs) {
    s.elapsedMs += dtMs;
    for (const id of s.order) {
      const p = s.players[id]!;
      const inp = inputs[id];
      if (!inp || inp.n === p.lastN) continue;
      p.lastN = inp.n;
      if (p.finishedAtMs !== null) continue; // já terminou: tabuleiro travado
      if (inp.a === inp.b || s.elapsedMs - p.lastSwapAt < MIN_SWAP_GAP_MS) { p.invalid++; continue; }
      [p.board[inp.a], p.board[inp.b]] = [p.board[inp.b]!, p.board[inp.a]!];
      p.swaps++; p.lastSwapAt = s.elapsedMs;
      p.correct = countCorrect(p.board);
      if (p.correct === PIECES) { p.finishedAtMs = s.elapsedMs; if (s.firstFinishMs === null) s.firstFinishMs = s.elapsedMs; }
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
      ranking: rankByScore(s.order.map((id) => { const p = s.players[id]!; return { playerId: id, score: p.finishedAtMs !== null ? 1_000_000 - Math.round(p.finishedAtMs / 10) : p.correct }; })),
    };
  },
  formatScore(score) {
    if (score >= 900_000) return `${((1_000_000 - score) / 100).toFixed(1).replace('.', ',')} s`;
    return `${score}/${PIECES} peças`;
  },
  timeLeftMs(s) {
    const end = s.firstFinishMs !== null ? Math.min(DURATION_MS, s.firstFinishMs + LAST_CHANCE_MS) : DURATION_MS;
    return Math.max(0, end - s.elapsedMs);
  },
  liveScores(s) {
    const out: Record<PlayerId, number> = {};
    for (const id of s.order) out[id] = s.players[id]!.correct;
    return out;
  },
  createBot: createBrain,
};
