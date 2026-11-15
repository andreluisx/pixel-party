/** Simulação de partida inteira só com bots, sem rede nem relógio, usando os minigames REAIS. Usada em testes e no script sim:games. */
import { buildBoard } from '../board/board';
import { REINO_DO_CASTELO } from '../board/maps/reino-do-castelo';
import { MINIGAME_LIST, getMinigame } from '../minigames';
import { simulateMatch } from '../sim';
import { makeBotProfile } from '../bots';
import type { BotDifficulty, ParticipantInfo, Slot } from '../types';
import { act, advance, awaiting, createGame, finishMinigame, type GameState } from './engine';
import { decide } from './boardBot';

export const BOARD = buildBoard(REINO_DO_CASTELO);

export function botParticipants(difficulty: BotDifficulty = 'medium'): ParticipantInfo[] {
  return [0, 1, 2, 3].map((i) => {
    const b = makeBotProfile(i as Slot, difficulty);
    return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty, personality: b.personality };
  });
}

export interface SimGame { state: GameState; minigames: string[]; ticks: number }

/** `fakeMinigames`: sorteia o ranking em vez de simular (rápido, para milhares de partidas). */
export function playFullGame(seed: number, o: { difficulty?: BotDifficulty; fakeMinigames?: boolean } = {}): SimGame {
  const parts = botParticipants(o.difficulty ?? 'medium');
  const s = createGame({
    board: BOARD, seed, mgIds: MINIGAME_LIST.map((m) => m.id),
    players: parts.map((p) => ({ id: p.id, slot: p.slot, name: p.name, characterId: p.characterId, isBot: true, difficulty: p.difficulty, personality: p.personality })),
  });
  const rng = { rng: seed ^ 0x51ed };
  const minigames: string[] = []; let ticks = 0; let guard = 0;
  while (s.phase !== 'final') {
    if (++guard > 40000) throw new Error(`partida travada (seed ${seed}, fase ${s.phase})`);
    if (s.phase === 'minigame') {
      const id = s.mg!.id; minigames.push(id);
      if (o.fakeMinigames) {
        const ord = [...s.players].sort((a, b) => ((a.id.charCodeAt(4) * 7 + seed + minigames.length) % 5) - ((b.id.charCodeAt(4) * 7 + seed + minigames.length) % 5));
        finishMinigame(s, { kind: 'ranking', ranking: ord.map((p, i) => ({ playerId: p.id, rank: i + 1, score: 4 - i })), kills: { [ord[0]!.id]: 1 } }, Object.fromEntries(ord.map((p, i) => [p.id, [8, 6, 4, 3][i]!])));
      } else {
        const out = simulateMatch(getMinigame(id)!, parts, seed * 31 + s.mg!.seq, 'medium');
        ticks += out.ticks; finishMinigame(s, out.result, out.rewards);
      }
    } else if (awaiting(s)) {
      const aw = awaiting(s)!; const i = decide(s, BOARD, rng)!;
      const r = act(s, BOARD, aw.pid, i); if (!r.ok) throw new Error(`bot inválido ${JSON.stringify(i)}: ${r.error}`);
    } else advance(s, BOARD);
  }
  return { state: s, minigames, ticks };
}
