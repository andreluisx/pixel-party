import type { GameUpdate, LabPhase, ResultPayload, Snapshot } from '@shared/protocol';
import type { MinigameMeta } from '@shared/minigame';
import type { ParticipantInfo, PlayerId } from '@shared/types';

export interface BridgeState {
  you: PlayerId | null;
  intro: { meta: MinigameMeta; participants: ParticipantInfo[]; durationMs: number } | null;
  countdown: number | null;
  result: ResultPayload | null;
  aimMode: boolean;
  /** Só o que a cena precisa saber: fase do minigame ('lobby' = nenhum minigame rodando) e o número da partida. */
  lobby: { phase: LabPhase; matchNo: number } | null;
  /** Estado do tabuleiro (só na partida); o laboratório não tem. */
  game?: GameUpdate | null;
  toast?: { key: number; text: string; tone: 'good' | 'bad' | 'info' } | null;
}

/** O que a cena Phaser e os controles de toque usam. LabClient (laboratório) e RoomClient (partida) cumprem. */
export interface BridgeClient {
  state: BridgeState;
  latest: Snapshot | null;
  touch: { dx: number; dy: number; action: boolean; fire: boolean; run: boolean };
  touchPresses: Array<'L' | 'U' | 'D' | 'R'>;
  onSnapshotEvents: Array<(s: Snapshot) => void>;
  sendInput(input: unknown): void;
  toggleAim(): void;
  /** Tabuleiro (opcionais: o laboratório não tem). */
  roll?(): void;
  choose?(tile: string): void;
  buy?(yes: boolean): void;
  /** Atualizações do tabuleiro ainda não animadas pela cena. */
  drainGame?(): GameUpdate[];
}
