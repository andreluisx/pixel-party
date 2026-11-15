import type Phaser from 'phaser';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import type { RenderCtx } from './GameView';

const FONT = "'Pixelify Sans', ui-monospace, monospace";
export const NAME_TAG_MS = 5000; // os nomes ficam na tela por 5 s e somem
const FADE_MS = 700;

/**
 * Nomes dos jogadores sobre os personagens, só para reconhecer quem é quem: aparecem quando o mapa surge
 * (contagem dentro da partida: 5 s depois que ela começa) e somem com um fade. `restart()` mostra de novo (ex.: depois de um gol).
 * Uso na view: `begin(ctx)` no começo do render e `place(id, x, y)` para cada personagem visível.
 */
export class NameTags {
  private items = new Map<string, Phaser.GameObjects.Text>();
  private startAt = -1;
  private alpha = 1;

  constructor(scene: Phaser.Scene, participants: ParticipantInfo[], private myId: string | null, private clampX = true) {
    for (const p of participants) {
      const name = p.name.length > 10 ? `${p.name.slice(0, 9)}.` : p.name;
      const t = scene.add.text(0, 0, name, { fontFamily: FONT, fontSize: '8px', color: SLOT_COLORS[p.slot] ?? '#ffffff', stroke: '#1b1030', strokeThickness: 3 })
        .setResolution(2).setOrigin(0.5, 1).setDepth(1000).setVisible(false);
      this.items.set(p.id, t);
    }
  }

  /** Mostra os nomes de novo por mais 5 s. */
  restart() { this.startAt = -2; }

  begin(ctx: RenderCtx) {
    if (this.startAt === -2) this.startAt = ctx.time;
    if (this.startAt < 0 && ctx.phase === 'active') this.startAt = ctx.time; // antes da partida (contagem) os nomes já aparecem
    const el = this.startAt < 0 ? 0 : ctx.time - this.startAt;
    this.alpha = ctx.phase === 'result' ? 0 : el >= NAME_TAG_MS ? 0 : el > NAME_TAG_MS - FADE_MS ? (NAME_TAG_MS - el) / FADE_MS : 1;
    for (const t of this.items.values()) t.setVisible(false);
  }

  place(id: string, x: number, y: number, visible = true) {
    const t = this.items.get(id);
    if (!t || !visible || this.alpha <= 0) return;
    const half = t.width / 2 + 2;
    const cx = this.clampX ? Math.max(half, Math.min(480 - half, x)) : x;
    t.setPosition(Math.round(cx), Math.round(y)).setAlpha(this.alpha).setVisible(true);
    void this.myId;
  }
}
