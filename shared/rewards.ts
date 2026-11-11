import type { PlayerId } from './types';

export interface RankEntry { playerId: PlayerId; rank: number; score: number }

/** Tabela por colocação (configurável). 1º..4º. O último sempre recebe 3. */
export const RANK_REWARDS = [8, 6, 4, 3] as const;
export const COOP_COMPLETION_REWARD = 6;
export const COOP_BONUS_MAX = 3;

/** Empates dividem as posições e recebem a média (arredondada para baixo). */
export function rewardsForRanking(entries: RankEntry[], table: readonly number[] = RANK_REWARDS): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  let i = 0;
  while (i < sorted.length) {
    const rank = sorted[i]!.rank;
    let j = i;
    while (j < sorted.length && sorted[j]!.rank === rank) j++;
    const slice = table.slice(i, j);
    const avg = Math.floor(slice.reduce((s, v) => s + v, 0) / Math.max(1, slice.length));
    for (let k = i; k < j; k++) out[sorted[k]!.playerId] = avg;
    i = j;
  }
  return out;
}

/** Ranking por pontuação (maior = melhor), com empates de mesma posição. */
export function rankByScore(scores: { playerId: PlayerId; score: number }[]): RankEntry[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  let rank = 1;
  return sorted.map((e, idx) => {
    if (idx > 0 && e.score < sorted[idx - 1]!.score) rank = idx + 1;
    return { playerId: e.playerId, rank, score: e.score };
  });
}
