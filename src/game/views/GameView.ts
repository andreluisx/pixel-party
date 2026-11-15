import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';

/** Estado dos controles já unificado (teclado + toque) que a cena entrega para o minigame. */
export type PressKey = 'L' | 'U' | 'D' | 'R' | 'A'; // A = Espaço/Enter (evento)
export interface Pad { dx: number; dy: number; action: boolean; /** botão MIRAR ligado (alternância) */ aim: boolean; /** Shift segurado / joystick no máximo */ run: boolean; /** F ou botão ATIRAR (toque) */ fire: boolean; /** direções apertadas neste quadro (evento, não estado) */ pressed: PressKey[] }

export interface RenderCtx { phase: string; myId: string | null; time: number }

/** Contrato de "visual de minigame" no Phaser: só desenha o que o servidor mandou e traduz controles em input. */
export interface GameView {
  render(snap: Snapshot | null, ctx: RenderCtx): void;
  readInput(pad: Pad): unknown;
  setDebug(on: boolean): void;
  destroy(): void;
}

export type ViewFactory = (scene: Phaser.Scene, participants: ParticipantInfo[], myId: string | null) => GameView;
