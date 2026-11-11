import type { LabClient } from '@/net/labClient';
import { createMinigameSceneClass } from './MinigameScene';

export const INTERNAL_W = 480;
export const INTERNAL_H = 270;

/** Cria o Phaser com renderização pixel-perfect (resolução interna fixa, escala proporcional, sem suavização). */
export async function createGame(parent: HTMLElement, client: LabClient, getDebug: () => boolean) {
  const Phaser = (await import('phaser')).default;
  const Scene = createMinigameSceneClass(Phaser, { client, getDebug });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: INTERNAL_W,
    height: INTERNAL_H,
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    backgroundColor: '#1a1240',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: { capture: [] } },
    scene: [Scene],
  });
  return game;
}
