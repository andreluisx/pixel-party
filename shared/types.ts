export type PlayerId = string;
export type Slot = 0 | 1 | 2 | 3;
export const SLOT_COUNT = 4;

export type BotDifficulty = 'easy' | 'medium' | 'hard';
export type BotPersonality = 'collector' | 'aggressive' | 'careful' | 'gambler';

export interface BotProfile {
  id: PlayerId;
  name: string;
  characterId: string;
  difficulty: BotDifficulty;
  personality: BotPersonality;
}

/** Um dos 4 participantes da partida (humano ou bot). */
export interface ParticipantInfo {
  id: PlayerId;
  slot: Slot;
  name: string;
  characterId: string;
  isBot: boolean;
  connected: boolean;
  ready?: boolean;
  difficulty?: BotDifficulty;
  personality?: BotPersonality;
}

export const SLOT_COLORS = ['#ff5d5d', '#4da3ff', '#4fd36b', '#ffd34d'] as const;
export { CHARACTER_IDS } from './characters';
