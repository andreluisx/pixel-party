import type { BotDifficulty, ParticipantInfo, PlayerId } from './types';
import type { MinigameDefinition, MinigameResult } from './minigame';
import { rewardsForRanking } from './rewards';

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

export interface SimOutcome<S = unknown> {
  result: MinigameResult;
  rewards: Record<PlayerId, number>;
  ticks: number;
  finalState: S;
}

export function computeRewards(result: MinigameResult, players: ParticipantInfo[]): Record<PlayerId, number> {
  if (result.kind === 'ranking') return rewardsForRanking(result.ranking);
  const out: Record<PlayerId, number> = {};
  for (const p of players) out[p.id] = result.success ? 6 + Math.min(3, Math.round(result.contribution[p.id] ?? 0)) : 0;
  return out;
}

/** Simulação completa sem rede e sem esperar o relógio. Usada em testes e no botão "só bots". */
export function simulateMatch<S, I>(
  def: MinigameDefinition<S, I>,
  players: ParticipantInfo[],
  seed: number,
  difficulty: BotDifficulty = 'medium',
): SimOutcome<S> {
  const state = def.createInitialState(seed, players);
  const brains = new Map(players.map((p) => [p.id, def.createBot(p.id, p.difficulty ?? difficulty, seed + p.slot * 101)]));
  let ticks = 0;
  const maxTicks = Math.ceil((def.durationMs * 2) / TICK_MS) + 10; // trava de segurança
  while (!def.isFinished(state) && ticks < maxTicks) {
    const inputs: Record<PlayerId, I> = {};
    for (const p of players) inputs[p.id] = brains.get(p.id)!.decide(state, TICK_MS);
    def.step(state, inputs, TICK_MS);
    ticks++;
  }
  if (!def.isFinished(state)) throw new Error(`Minigame ${def.id} não terminou (possível travamento)`);
  const result = def.computeResult(state);
  return { result, rewards: computeRewards(result, players), ticks, finalState: state };
}
