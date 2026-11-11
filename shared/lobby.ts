import type { BotDifficulty, ParticipantInfo, PlayerId, Slot } from './types';
import { SLOT_COUNT } from './types';
import { CHARACTER_IDS, isCharacterId } from './characters';
import { makeBotProfile } from './bots';

/** Lógica pura do lobby (usada pelo servidor e testada em tests/lobby.test.ts). */

export function botAt(slot: Slot, difficulty: BotDifficulty, characterId?: string): ParticipantInfo {
  const b = makeBotProfile(slot, difficulty);
  return { id: b.id, slot, name: b.name, characterId: characterId ?? b.characterId, isBot: true, connected: true, ready: true, difficulty, personality: b.personality };
}

export function firstFreeCharacter(participants: ParticipantInfo[]): string {
  const used = new Set(participants.map((p) => p.characterId));
  return CHARACTER_IDS.find((c) => !used.has(c)) ?? CHARACTER_IDS[0];
}

/** Sala nova: 4 slots, todos bots, com personagens diferentes. */
export function emptyLobby(difficulty: BotDifficulty = 'medium'): ParticipantInfo[] {
  return ([0, 1, 2, 3] as Slot[]).map((slot) => botAt(slot, difficulty, CHARACTER_IDS[slot]));
}

export function freeBotSlot(participants: ParticipantInfo[]): ParticipantInfo | undefined {
  return participants.find((p) => p.isBot);
}

/** Humano toma o lugar de um bot. O personagem escolhido é o primeiro livre. */
export function seatHuman(participants: ParticipantInfo[], slot: Slot, id: PlayerId, name: string): ParticipantInfo[] {
  const next = participants.map((p) => ({ ...p }));
  const current = next[slot]!;
  const others = next.filter((p) => p.slot !== slot);
  const character = firstFreeCharacter(others);
  next[slot] = { id, slot, name, characterId: others.some((p) => p.characterId === current.characterId) ? character : current.characterId, isBot: false, connected: true, ready: false };
  return next;
}

/** Humano sai: a vaga volta a ser bot, mantendo o personagem. */
export function releaseSlot(participants: ParticipantInfo[], slot: Slot, difficulty: BotDifficulty): ParticipantInfo[] {
  const next = participants.map((p) => ({ ...p }));
  const old = next[slot]!;
  next[slot] = botAt(slot, difficulty, old.characterId);
  return next;
}

/**
 * Escolha de personagem: únicos por sala.
 * - Se o personagem é de outro HUMANO, recusa.
 * - Se é de um BOT, o bot fica com o personagem que o humano largou (troca).
 */
export function pickCharacter(participants: ParticipantInfo[], playerId: PlayerId, characterId: unknown): ParticipantInfo[] | null {
  if (!isCharacterId(characterId)) return null;
  const me = participants.find((p) => p.id === playerId && !p.isBot);
  if (!me) return null;
  if (me.characterId === characterId) return participants;
  const holder = participants.find((p) => p.characterId === characterId);
  if (holder && !holder.isBot) return null;
  return participants.map((p) => {
    if (p.id === me.id) return { ...p, characterId };
    if (holder && p.id === holder.id) return { ...p, characterId: me.characterId };
    return p;
  });
}

export function setBotDifficulty(participants: ParticipantInfo[], slot: Slot, difficulty: BotDifficulty): ParticipantInfo[] | null {
  const p = participants[slot];
  if (!p || !p.isBot || !['easy', 'medium', 'hard'].includes(difficulty)) return null;
  return participants.map((x) => (x.slot === slot ? { ...x, difficulty } : x));
}

export function humans(participants: ParticipantInfo[]): ParticipantInfo[] {
  return participants.filter((p) => !p.isBot);
}

/** Começa quando TODOS os humanos estão conectados e prontos (bots sempre prontos). Mínimo 1 humano. */
export function canStart(participants: ParticipantInfo[]): { ok: true } | { ok: false; reason: string } {
  const hs = humans(participants);
  if (hs.length === 0) return { ok: false, reason: 'Nenhum jogador na sala.' };
  const off = hs.find((p) => !p.connected);
  if (off) return { ok: false, reason: `${off.name} está sem conexão.` };
  const waiting = hs.filter((p) => !p.ready);
  if (waiting.length > 0) return { ok: false, reason: `Aguardando ${waiting.map((p) => p.name).join(', ')}.` };
  return { ok: true };
}

export const MAX_PLAYERS = SLOT_COUNT;
