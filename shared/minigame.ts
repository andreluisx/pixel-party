import type { BotDifficulty, ParticipantInfo, PlayerId } from './types';
import type { RankEntry } from './rewards';

export type MinigameCategory = 'speed' | 'reaction' | 'skill' | 'survival' | 'memory' | 'logic' | 'combat' | 'coop';

export type MinigameResult =
  | { kind: 'ranking'; ranking: RankEntry[] }
  | { kind: 'coop'; success: boolean; contribution: Record<PlayerId, number> };

export interface ControlHint { keys: string; action: string }

export interface MinigameInstructions {
  title: string;
  lines: string[];
  controls: ControlHint[];
  /** Controles de toque: joystick e/ou botão de ação (rótulo). */
  touch?: { stick: boolean; action?: string; dpad?: boolean };
}

/** Um "cérebro" de bot para um minigame. Vê o mesmo estado que um humano veria. */
export interface MinigameBrain<S, I> {
  decide(state: Readonly<S>, dtMs: number): I;
}

export interface MinigameDefinition<S = unknown, I = unknown> {
  id: string;
  name: string;
  category: MinigameCategory;
  mode: 'ffa' | 'coop';
  durationMs: number;
  instructions: MinigameInstructions;
  /** Unidade exibida ao lado do placar ao vivo (ex.: '%'). */
  hudUnit?: string;
  /** Como mostrar a pontuação no resultado (ex.: tempo de corrida). Padrão: "N pts". */
  formatScore?(score: number): string;
  /** Versão do estado enviada aos clientes (esconde segredos, ex.: o gerador aleatório). */
  publicState?(state: S): unknown;
  /** Input neutro (ninguém tocando). */
  neutralInput(): I;
  /** Valida input vindo do cliente. Retorna null se for inválido. */
  sanitizeInput(raw: unknown): I | null;
  createInitialState(seed: number, players: ParticipantInfo[]): S;
  /** Determinístico. Pode mutar e retornar o próprio state. */
  step(state: S, inputs: Record<PlayerId, I>, dtMs: number): S;
  isFinished(state: S): boolean;
  computeResult(state: S): MinigameResult;
  /** Tempo restante para o HUD. */
  timeLeftMs(state: S): number;
  /** Placar ao vivo para o HUD. */
  liveScores(state: S): Record<PlayerId, number>;
  createBot(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<S, I>;
}

export interface MinigameMeta {
  hudUnit?: string;
  id: string;
  name: string;
  category: MinigameCategory;
  mode: 'ffa' | 'coop';
  durationMs: number;
  instructions: MinigameInstructions;
}

export function metaOf(def: MinigameDefinition<any, any>): MinigameMeta {
  return { id: def.id, name: def.name, category: def.category, mode: def.mode, durationMs: def.durationMs, instructions: def.instructions, hudUnit: def.hudUnit };
}
