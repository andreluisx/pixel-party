import type { BotDifficulty, ParticipantInfo, PlayerId } from './types';
import type { MinigameMeta, MinigameResult } from './minigame';

export type LabPhase = 'lobby' | 'intro' | 'countdown' | 'active' | 'result';

export interface LabConfig {
  minigameId: string;
  difficulty: BotDifficulty;
  seed: number;
}

export interface LabLobby {
  code: string;
  phase: LabPhase;
  hostId: PlayerId;
  config: LabConfig;
  participants: ParticipantInfo[];
  minigames: MinigameMeta[];
  matchNo: number;
}

export interface Snapshot { tick: number; timeLeftMs: number; scores: Record<PlayerId, number>; state: unknown }

export interface ResultPayload {
  rewardEventId: string; // id único: a recompensa só pode ser aplicada uma vez
  result: MinigameResult;
  rewards: Record<PlayerId, number>;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServerEvents {
  'lab:create': (cfg: Partial<LabConfig> & { name?: string }, ack: (r: Ack<{ you: PlayerId; lobby: LabLobby }>) => void) => void;
  'lab:join': (p: { code: string; name?: string }, ack: (r: Ack<{ you: PlayerId; lobby: LabLobby }>) => void) => void;
  'lab:rejoin': (p: { code: string; you: PlayerId }, ack: (r: Ack<{ you: PlayerId; lobby: LabLobby }>) => void) => void;
  'lab:setConfig': (cfg: Partial<LabConfig>) => void;
  'lab:start': () => void;
  'lab:restart': () => void;
  'lab:simulate': (cfg: Partial<LabConfig>, ack: (r: Ack<{ result: MinigameResult; rewards: Record<PlayerId, number>; ticks: number; players: ParticipantInfo[] }>) => void) => void;
  'mg:input': (p: { seq: number; input: unknown }) => void;
}

export interface ServerToClientEvents {
  'lab:lobby': (l: LabLobby) => void;
  'mg:intro': (p: { meta: MinigameMeta; participants: ParticipantInfo[]; durationMs: number }) => void;
  'mg:countdown': (n: number) => void; // 3,2,1,0(=GO)
  'mg:snapshot': (s: Snapshot) => void;
  'mg:result': (r: ResultPayload) => void;
  'lab:error': (msg: string) => void;
}

// Dados anexados ao socket pelo servidor.
declare module 'socket.io' {
  interface SocketData { roomCode?: string; playerId?: string }
}
