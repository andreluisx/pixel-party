import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { AX0, AX1, AY0, AY1, R, isMoving, warnProgress, type RainState, type Rock } from '@shared/minigames/chuva-de-pedras';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import { FRAME_INDEX } from '../art/characters';
import { NameTags } from './nameTags';
import type { GameView, Pad, RenderCtx } from './GameView';
import { PixelNumber, popup } from './pixelNumber';

const CHIP_X = [4, 108, 272, 376];
const ascii = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || '?';

interface PV {
  id: string; slot: number; color: number; name: string;
  sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image;
  chipBg: Phaser.GameObjects.Rectangle; face: Phaser.GameObjects.Sprite; killNum: PixelNumber; impNum: PixelNumber; tag: PixelNumber;
  prev: { alive: boolean; impacts: number; kills: number } | null; fresh: boolean;
}

/** Chuva de Pedras: arena pequena vista de cima, marcações vermelhas pulsantes, pedras que caem, deslizam e se quebram. */
export class RainView implements GameView {
  private pv: PV[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private rocks = new Map<number, { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse; prev: { x: number; y: number; moving: boolean } }>();
  private falling = new Map<number, { img: Phaser.GameObjects.Image; x: number; y: number }>();
  private seenIncoming = new Map<number, { x: number; y: number }>();
  private timer!: PixelNumber;
  private lastSec = -1; private lastTrail = 0; private lastWarnBeep = 0;

  private tags: NameTags;
  constructor(private scene: Phaser.Scene, participants: ParticipantInfo[], private myId: string | null) {
    this.tags = new NameTags(scene, participants, myId);
    scene.add.image(0, 0, 'rain-bg').setOrigin(0, 0).setDepth(0);
    this.g = scene.add.graphics().setDepth(2);
    this.timer = new PixelNumber(scene, 240, 8, 3, 0xffffff, 50);
    [...participants].sort((a, b) => a.slot - b.slot).forEach((p) => {
      const color = num(SLOT_COLORS[p.slot] ?? '#ffffff');
      const x0 = CHIP_X[p.slot] ?? 4;
      const chipBg = scene.add.rectangle(x0 + 50, 16, 100, 26, 0x1a1240).setStrokeStyle(2, color).setDepth(50);
      const face = scene.add.sprite(x0 + 11, 14, `char-${p.characterId}`, 0).setDepth(51);
      scene.add.image(x0 + 30, 15, 'ico-skull').setDepth(51);
      const killNum = new PixelNumber(scene, x0 + 43, 12, 2, 0xffffff, 51); killNum.set('0');
      const impNum = new PixelNumber(scene, x0 + 83, 12, 2, 0xff9a6a, 51); impNum.set('I0');
      const tag = new PixelNumber(scene, x0 + 60, 24, 1, 0x9a8fc8, 51); tag.set(ascii(p.name));
      const shadow = scene.add.image(0, 0, 'shadow').setDepth(1).setAlpha(0.9);
      const sprite = scene.add.sprite(0, 0, `char-${p.characterId}`, 0).setOrigin(0.5, 0.78);
      const marker = scene.add.image(0, 0, 'marker').setTint(color).setDepth(9999);
      this.pv.push({ id: p.id, slot: p.slot, color, name: ascii(p.name), sprite, shadow, marker, chipBg, face, killNum, impNum, tag, prev: null, fresh: true });
    });
  }

  setDebug() { /* sem hitboxes */ }
  readInput(pad: Pad) { return { dx: Math.sign(pad.dx) as -1 | 0 | 1, dy: Math.sign(pad.dy) as -1 | 0 | 1 }; }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    this.tags.begin(ctx);
    const s = snap.state as RainState;
    const t = ctx.time;
    this.g.clear();

    // ---- marcações vermelhas (pulsam cada vez mais rápido) e a pedra caindo
    const liveInc = new Set<number>();
    let soonest = 1;
    for (const inc of s.incoming) {
      liveInc.add(inc.id); this.seenIncoming.set(inc.id, { x: inc.x, y: inc.y });
      const q = warnProgress(inc); soonest = Math.min(soonest, 1 - q);
      const pulse = 0.5 + 0.5 * Math.sin(t / 1000 * (2 * Math.PI) * (2.5 + 7 * q));
      this.g.fillStyle(0xff2a2a, 0.22 + 0.3 * pulse).fillCircle(inc.x, inc.y, R + 3);
      this.g.lineStyle(2, 0xff4a4a, 0.55 + 0.45 * pulse).strokeCircle(inc.x, inc.y, R + 3);
      this.g.lineStyle(1, 0xffe0e0, 0.9).strokeCircle(inc.x, inc.y, R + 3 + (1 - q) * 18); // anel que fecha
      this.g.fillStyle(0xffe0e0, 0.9).fillRect(inc.x - 4, inc.y - 1, 8, 2).fillRect(inc.x - 1, inc.y - 4, 2, 8); // alvo
      let f = this.falling.get(inc.id);
      if (q > 0.55) {
        const u = (q - 0.55) / 0.45;
        if (!f) { f = { img: this.scene.add.image(inc.x, inc.y, 'boulder').setDepth(9000), x: inc.x, y: inc.y }; this.falling.set(inc.id, f); }
        f.img.setPosition(inc.x, Math.round(inc.y - 170 * (1 - u) * (1 - u))).setScale(0.75 + 0.25 * u).setRotation(u * 2.2);
        this.g.fillStyle(0x000000, 0.12 + 0.28 * u).fillCircle(inc.x, inc.y + 2, (R - 2) * (0.5 + 0.5 * u)); // sombra que cresce no chão
      }
    }
    if (soonest < 0.35 && t - this.lastWarnBeep > 260 && ctx.phase === 'active') { this.lastWarnBeep = t; sfx.tick(); }
    for (const [id, f] of this.falling) if (!liveInc.has(id)) { f.img.destroy(); this.falling.delete(id); }
    for (const [id, pos] of this.seenIncoming) if (!liveInc.has(id)) { this.seenIncoming.delete(id); this.impactFx(pos.x, pos.y); }

    // ---- pedras no chão
    const liveRocks = new Set<number>();
    for (const r of s.rocks) {
      liveRocks.add(r.id);
      let o = this.rocks.get(r.id);
      const moving = isMoving(r);
      if (!o) {
        const img = this.scene.add.image(r.x, r.y, 'boulder').setDepth(r.y);
        const shadow = this.scene.add.ellipse(r.x, r.y + 8, 22, 8, 0x000000, 0.3).setDepth(1);
        o = { img, shadow, prev: { x: r.x, y: r.y, moving } }; this.rocks.set(r.id, o);
        this.scene.tweens.add({ targets: img, scaleY: { from: 0.7, to: 1 }, scaleX: { from: 1.2, to: 1 }, duration: 220, ease: 'Bounce.easeOut' });
      }
      const k = moving ? 0.6 : 1;
      const nx = o.img.x + (r.x - o.img.x) * k, ny = o.img.y + (r.y - o.img.y) * k;
      if (moving) {
        o.img.rotation += (Math.hypot(r.vx, r.vy) / 60) * 0.033 * Math.sign(r.vx + 0.001);
        if (!o.prev.moving) { this.ring(r.x, r.y, 0xffffff, R + 10); sfx.spring(); this.burst(r.x, r.y + 4, 0xe8dcc0, 6, 12); }
        if (t - this.lastTrail > 45) { this.lastTrail = t; const d = this.scene.add.image(r.x - r.vx * 0.03, r.y + 6, 'spark').setTint(0xe8dcc0).setDepth(r.y - 1).setScale(2.2); this.scene.tweens.add({ targets: d, alpha: 0, scale: 4, duration: 330, onComplete: () => d.destroy() }); }
      }
      o.img.setPosition(Math.round(nx), Math.round(ny)).setDepth(ny);
      o.shadow.setPosition(Math.round(nx), Math.round(ny) + 9);
      if (o.prev.moving && !moving) { this.burst(r.x, r.y + 6, 0xe8dcc0, 5, 10); }
      o.prev = { x: r.x, y: r.y, moving };
    }
    for (const [id, o] of this.rocks) {
      if (liveRocks.has(id)) continue;
      this.rocks.delete(id); this.shatter(o.prev.x, o.prev.y); o.img.destroy(); o.shadow.destroy();
    }

    // ---- jogadores
    const best = s.order.filter((id) => s.players[id]!.alive);
    for (const P of this.pv) {
      const a = s.players[P.id];
      if (!a) continue;
      const mine = P.id === this.myId;
      const moving = a.dx !== 0 || a.dy !== 0;
      const sp = P.sprite;
      if (P.fresh) { sp.setPosition(a.x, a.y); P.fresh = false; }
      sp.x += (a.x - sp.x) * 0.45; sp.y += (a.y - sp.y) * 0.45;
      if (a.dx !== 0) sp.setFlipX(a.dx < 0);
      const bob = moving ? Math.floor(t / 120) % 2 : 0;
      let frame = moving ? FRAME_INDEX.run + bob : FRAME_INDEX.idle + (Math.floor(t / 500) % 2);
      if (!a.alive) frame = FRAME_INDEX.lose;
      else if (ctx.phase === 'result') frame = FRAME_INDEX.celebrate + (Math.floor(t / 200) % 2);
      sp.setFrame(frame);
      const shock = a.shockMs > 0 && Math.floor(t / 60) % 2 === 0;
      sp.setTint(shock ? 0xff9a6a : 0xffffff);
      if (!a.alive) { sp.setAlpha(0.55).setScale(1, a.cause === 'crush' ? 0.3 : 0.8).setTint(0x9a8fc8); } else sp.setAlpha(1).setScale(1);
      const px = Math.round(sp.x), py = Math.round(sp.y) - (moving && bob ? 1 : 0);
      sp.setPosition(px, py).setDepth(a.alive ? a.y : a.y - 5);
      P.shadow.setPosition(px, Math.round(a.y) + 4).setDepth(a.y - 1).setVisible(a.alive);
      P.marker.setPosition(px, py - 17 + Math.round(Math.sin(t / 200))).setVisible(a.alive);
      this.tags.place(P.id, px, py - 21, a.alive);
      void mine;

      // placar
      P.chipBg.setAlpha(a.alive ? 1 : 0.45); P.face.setFrame(a.alive ? FRAME_INDEX.idle : FRAME_INDEX.lose).setAlpha(a.alive ? 1 : 0.5);
      P.killNum.set(String(a.kills)); P.impNum.set(`I${a.impacts}`);

      const pv = P.prev;
      if (pv) {
        if (pv.alive && !a.alive) {
          const crush = a.cause === 'crush';
          this.burst(a.x, a.y - 4, crush ? 0xe8dcc0 : 0xff5d5d, 16, 30); this.ring(a.x, a.y, 0xff5d5d, 26);
          popup(this.scene, a.x, a.y - 14, crush ? 'ESMAGADO' : 'KO', 0xff6b6b, 1);
          sfx.hit(); sfx.fall(); this.scene.cameras.main.shake(crush ? 240 : 180, crush ? 0.01 : 0.007);
        }
        if (a.impacts > pv.impacts && a.alive) { this.ring(a.x, a.y, 0xff9a6a, 20); popup(this.scene, a.x, a.y - 14, 'IMPACTO', 0xff9a6a, 1); if (mine) sfx.hit(); }
        if (a.kills > pv.kills) { popup(this.scene, a.x, a.y - 20, '+1', 0xffe08a, 2); sfx.coin(); }
      }
      P.prev = { alive: a.alive, impacts: a.impacts, kills: a.kills };
    }
    void best; void AX0; void AX1; void AY0; void AY1;

    const sec = Math.ceil(snap.timeLeftMs / 1000);
    this.timer.set(String(sec)); this.timer.setColor(sec <= 10 ? 0xff5d5d : 0xffffff);
    if (sec !== this.lastSec) { this.lastSec = sec; if (sec <= 5 && sec > 0 && ctx.phase === 'active') sfx.beep(); }
  }

  /** Impacto da queda: poeira, onda de choque, tremor de tela. */
  private impactFx(x: number, y: number) {
    this.burst(x, y, 0xe8dcc0, 16, 34); this.burst(x, y, 0x847da3, 8, 22);
    this.ring(x, y, 0xffffff, 40); this.ring(x, y, 0xff9a6a, 28);
    const flash = this.scene.add.circle(x, y, R + 6, 0xffffff, 0.8).setDepth(9500);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 1.6, duration: 160, onComplete: () => flash.destroy() });
    this.scene.cameras.main.shake(190, 0.007);
    sfx.hit();
  }
  /** Pedra destruída: estilhaços. */
  private shatter(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.5, d = 14 + Math.random() * 20;
      const f = this.scene.add.rectangle(x, y, 3 + Math.floor(Math.random() * 3), 3, [0x645d82, 0x847da3, 0xa9a3c4][i % 3]).setDepth(9600);
      this.scene.tweens.add({ targets: f, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 6, angle: 200, alpha: 0, duration: 480, ease: 'Cubic.easeOut', onComplete: () => f.destroy() });
    }
    this.burst(x, y, 0xe8dcc0, 8, 22); this.scene.cameras.main.shake(130, 0.005); sfx.vanish(); sfx.hit();
  }
  private burst(x: number, y: number, tint: number, n: number, dist: number) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = this.scene.add.image(x, y, 'spark').setTint(tint).setDepth(9500).setScale(2);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0, duration: 400, onComplete: () => sp.destroy() });
    }
  }
  private ring(x: number, y: number, color: number, radius: number) {
    const c = this.scene.add.circle(x, y, 4).setStrokeStyle(2, color).setDepth(9500);
    this.scene.tweens.add({ targets: c, scale: radius / 4, alpha: 0, duration: 380, onComplete: () => c.destroy() });
  }

  destroy() { this.pv = []; this.rocks.clear(); this.falling.clear(); this.seenIncoming.clear(); }
}

export type { Rock };
