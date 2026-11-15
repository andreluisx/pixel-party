import type { GameState } from '../shared/game/engine';

/** Resumo de uma partida terminada. Sem contas: só dados da partida (a estrutura aceita trocar por banco depois). */
export interface MatchSummary {
  id: string; code: string; finishedAt: number; rounds: number;
  players: Array<{ name: string; isBot: boolean; rank: number; stars: number; coins: number; boardStars: number; awardStars: number }>;
  awards: Array<{ id: string; title: string; winner: string | null }>;
}
export interface MatchStore { save(s: MatchSummary): void; recent(n: number): MatchSummary[] }

/** Armazenamento em memória (as últimas 50 partidas). Para persistir de verdade, implemente MatchStore (ex.: Supabase) e troque aqui. */
export class MemoryStore implements MatchStore {
  private items: MatchSummary[] = [];
  save(s: MatchSummary) { this.items.push(s); if (this.items.length > 50) this.items.shift(); }
  recent(n: number) { return this.items.slice(-n).reverse(); }
}
export const store: MatchStore = new MemoryStore();

export function summarize(code: string, s: GameState): MatchSummary {
  const name = (id: string) => s.players.find((p) => p.id === id)!;
  return {
    id: `${code}-${Date.now().toString(36)}`, code, finishedAt: Date.now(), rounds: s.round,
    players: (s.final ?? []).map((f) => ({ name: name(f.pid).name, isBot: name(f.pid).isBot, rank: f.rank, stars: f.stars, coins: f.coins, boardStars: f.boardStars ?? f.stars, awardStars: f.awardStars ?? 0 })),
    awards: (s.awards ?? []).map((a) => ({ id: a.id, title: a.title, winner: a.winner ? name(a.winner).name : null })),
  };
}
