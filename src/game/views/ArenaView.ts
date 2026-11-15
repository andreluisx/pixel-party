import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import { NameTags } from './nameTags';
import type { GameView, Pad, RenderCtx } from './GameView';
import type { PTState } from '@shared/minigames/caca-moedas';
import { ROCK_CELLS, TILE } from '@shared/minigames/caca-moedas';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import { FRAME_INDEX } from '../art/characters';

/** Visual do Caça-Moedas. Só desenha o que o servidor mandou. */
export class ArenaView implements GameView {
  private players = new Map<string, { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image; hitbox: Phaser.GameObjects.Rectangle; tx: number; ty: number; moving: boolean }>();
  private coins = new Map<number, Phaser.GameObjects.Sprite>();
  private coinData = new Map<number, { x: number; y: number; value: number }>();
  private items = new Map<number, Phaser.GameObjects.Sprite>();
  private prevBoost = new Map<string, number>();
  private lastTrail = 0;
  private debug = false;

  private tags: NameTags;
  constructor(private scene: Phaser.Scene, private participants: ParticipantInfo[], private myId: string | null) {
    this.tags = new NameTags(scene, participants, myId);
    scene.add.image(0, 0, 'arena-bg').setOrigin(0, 0).setDepth(0);
    for (const [c, r] of ROCK_CELLS) scene.add.image(c * TILE, r * TILE, 'rock').setOrigin(0, 0).setDepth(r * TILE + 10);
    for (const p of participants) {
      const shadow = scene.add.image(0, 0, 'shadow').setDepth(1).setAlpha(0.9);
      const sprite = scene.add.sprite(0, 0, `char-${p.characterId}`, 0).setOrigin(0.5, 0.78);
      const marker = scene.add.image(0, 0, 'marker').setTint(num(SLOT_COLORS[p.slot] ?? '#ffffff')).setDepth(9999);
      const hitbox = scene.add.rectangle(0, 0, 10, 10).setStrokeStyle(1, 0xff00ff).setVisible(false).setDepth(10000);
      this.players.set(p.id, { sprite, shadow, marker, hitbox, tx: -1, ty: -1, moving: false });
    }
  }

  setDebug(on: boolean) { this.debug = on; }
  readInput(pad: Pad) { return { dx: pad.dx, dy: pad.dy }; }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    const timeMs = ctx.time;
    if (!snap) return;
    this.tags.begin(ctx);
    const s = snap.state as PTState;
    // moedas
    const alive = new Set<number>();
    for (const c of s.coins) {
      alive.add(c.id);
      let spr = this.coins.get(c.id);
      if (!spr) {
        spr = this.scene.add.sprite(c.x, c.y, 'coin', 0).setScale(c.value === 3 ? 1.5 : 1).setDepth(c.y);
        this.coins.set(c.id, spr);
        this.coinData.set(c.id, { x: c.x, y: c.y, value: c.value });
        spr.setAlpha(0);
        this.scene.tweens.add({ targets: spr, alpha: 1, duration: 150 });
      }
      spr.setFrame(Math.floor(timeMs / 120 + c.id) % 4);
      spr.y = c.y + Math.round(Math.sin(timeMs / 260 + c.id) * 1.2);
    }
    for (const [id, spr] of this.coins) {
      if (alive.has(id)) continue;
      const d = this.coinData.get(id)!;
      this.coins.delete(id);
      this.coinData.delete(id);
      spr.destroy();
      this.sparkle(d.x, d.y, d.value === 3);
      // som só se foi o meu jogador (distância ao meu sprite)
      const me = this.myId ? this.players.get(this.myId) : null;
      if (me && Math.hypot(me.tx - d.x, me.ty - d.y) < 14) (d.value === 3 ? sfx.bigCoin() : sfx.coin());
    }
    // Bota Veloz
    const liveItems = new Set<number>();
    for (const it of s.items) {
      liveItems.add(it.id);
      let spr = this.items.get(it.id);
      if (!spr) { spr = this.scene.add.sprite(it.x, it.y, 'boot').setDepth(it.y + 5); this.items.set(it.id, spr); this.scene.tweens.add({ targets: spr, scale: { from: 0.2, to: 1 }, duration: 220, ease: 'Back.easeOut' }); }
      spr.y = it.y + Math.round(Math.sin(timeMs / 220 + it.id) * 1.5);
    }
    for (const [id, spr] of this.items) if (!liveItems.has(id)) { this.items.delete(id); this.sparkle(spr.x, spr.y, true); spr.destroy(); }
    const best = Math.max(...s.order.map((id) => s.players[id]!.score));
    // jogadores
    for (const id of s.order) {
      const p = s.players[id]!;
      const v = this.players.get(id);
      if (!v) continue;
      v.tx = p.x; v.ty = p.y;
      const first = v.sprite.x === 0 && v.sprite.y === 0;
      const k = first ? 1 : 0.4; // suaviza entre snapshots
      v.sprite.x += (p.x - v.sprite.x) * k;
      v.sprite.y += (p.y - v.sprite.y) * k;
      v.moving = p.dx !== 0 || p.dy !== 0;
      if (p.dx !== 0) v.sprite.setFlipX(p.dx < 0);
      const bob = v.moving ? (Math.floor(timeMs / (p.boostMs > 0 ? 80 : 120)) % 2) : 0;
      const result = ctx.phase === 'result';
      if (result) v.sprite.setFrame(p.score === best && best > 0 ? FRAME_INDEX.celebrate + (Math.floor(timeMs / 200) % 2) : FRAME_INDEX.lose);
      else v.sprite.setFrame(v.moving ? FRAME_INDEX.run + bob : FRAME_INDEX.idle + (Math.floor(timeMs / 500) % 2));
      // bota: brilho azul e rastro de poeira
      const was = this.prevBoost.get(id) ?? 0;
      if (p.boostMs > 0 && was <= 0 && id === this.myId) sfx.spring();
      this.prevBoost.set(id, p.boostMs);
      v.sprite.setTint(p.boostMs > 0 && Math.floor(timeMs / 120) % 2 ? 0x9ad0ff : 0xffffff);
      if (p.boostMs > 0 && v.moving && timeMs - this.lastTrail > 60) { this.lastTrail = timeMs; const tr = this.scene.add.image(p.x, p.y + 3, 'spark').setTint(0x9ad0ff).setDepth(p.y - 2); this.scene.tweens.add({ targets: tr, alpha: 0, scale: 2, duration: 260, onComplete: () => tr.destroy() }); }
      const px = Math.round(v.sprite.x), py = Math.round(v.sprite.y) - (v.moving && bob ? 1 : 0);
      v.sprite.setPosition(px, py).setDepth(p.y);
      v.shadow.setPosition(px, Math.round(p.y) + 4).setDepth(p.y - 1);
      v.marker.setPosition(px, py - 17 + Math.round(Math.sin(timeMs / 200) * 1));
      this.tags.place(id, px, py - 21);
      v.hitbox.setPosition(p.x, p.y).setVisible(this.debug);
    }
  }

  private sparkle(x: number, y: number, big: boolean) {
    const n = big ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const sp = this.scene.add.image(x, y, 'spark').setDepth(9998);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * (big ? 14 : 9), y: y + Math.sin(a) * (big ? 14 : 9), alpha: 0, duration: 320, onComplete: () => sp.destroy() });
    }
  }

  destroy() { this.coins.clear(); this.players.clear(); }
}
