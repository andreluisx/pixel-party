import type { MinigameDefinition } from '../minigame';
import { pipelineTest } from './pipeline-test';
import { corridaMaluca } from './corrida-maluca';
import { reflexoRelampago } from './reflexo-relampago';

// Novos minigames entram aqui (um arquivo por minigame, um registro por linha).
const ALL: MinigameDefinition<any, any>[] = [corridaMaluca, reflexoRelampago, pipelineTest];

export const MINIGAMES: Record<string, MinigameDefinition<any, any>> = Object.fromEntries(ALL.map((m) => [m.id, m]));
export const MINIGAME_LIST = ALL;
export function getMinigame(id: string): MinigameDefinition<any, any> | undefined {
  return MINIGAMES[id];
}
