import type { BotDifficulty, BotPersonality, BotProfile, Slot } from './types';
import { CHARACTER_IDS } from './types';

/** Parâmetros que tornam o bot "humano": reação lenta, erros, nada de trapaça. */
export interface DifficultyParams {
  reactionMs: number; // intervalo entre decisões
  errorRate: number; // chance de decisão errada
  jitterMs: number; // variação aleatória da reação
}

export const DIFFICULTY: Record<BotDifficulty, DifficultyParams> = {
  easy: { reactionMs: 480, errorRate: 0.28, jitterMs: 220 },
  medium: { reactionMs: 260, errorRate: 0.1, jitterMs: 120 },
  hard: { reactionMs: 130, errorRate: 0.02, jitterMs: 60 },
};

const BOT_NAMES = ['Beto', 'Luma', 'Pico', 'Nina'];
const PERSONALITIES: BotPersonality[] = ['collector', 'aggressive', 'careful', 'gambler'];

export function makeBotProfile(slot: Slot, difficulty: BotDifficulty): BotProfile {
  return {
    id: `bot-${slot}`,
    name: BOT_NAMES[slot] ?? `Bot ${slot + 1}`,
    characterId: CHARACTER_IDS[slot] ?? CHARACTER_IDS[0],
    difficulty,
    personality: PERSONALITIES[slot] ?? 'collector',
  };
}
