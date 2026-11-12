import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import type { ReflexState } from '@shared/minigames/reflexo-relampago';
import { ANIMS, FRAME_INDEX, type CharAnim } from '../art/characters';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import type { GameView, Pad, RenderCtx } from './GameView';
import { PixelNumber, popup } from './pixelNumber';

const PW = 114, PH = 252, TOP = 9, GAP = 4, LEFT = 6;
// 0=← 1=↑ 2=↓ 3=→ ; ângulo da seta (a textura aponta para a direita)
const ANGLE = [180, 270, 90, 0];
const ARROW_TINT = [0x4da3ff, 0x4fd36b, 0xff9a3c, 0xff5d5d];
const GOLD = 0xffd34d;
const KEY_TO_SYMBOL = { L: 0, U: 1, D: 2, R: 3 } as const;

interface Panel {
  id: string; slot: number; cx: number;
  sprite: Phaser.GameObjects.Sprite; score: PixelNumber; stars: Phaser.GameObjects.Image[];
  plate: Phaser.GameObjects.Rectangle; arrow: Phaser.GameObjects.Image; dots: Phaser.GameObjects.Image[];
  barBg: Phaser.GameObjects.Rectangle; bar: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Rectangle;
  gold: Phaser.GameObjects.Image[];
  resSeq: number; flashUntil: number; flashAnim: CharAnim; lastPoints: number;
}

/** Reflexo Relâmpago: um painel por jogador, a mesma seta aparece para todos. */
export class ReflexView implements GameView {
  private panels: Panel[] = [];
  private n = 0;
  private k = 0;
  private lastNo = 0;

  constructor(private scene: Phaser.Scene, participants: ParticipantInfo[], private myId: string | null) {
    const sorted = [...participants].sort((a, b) => a.slot - b.slot);
    sorted.forEach((p, i) => {
      const x0 = LEFT + i * (PW + GAP);
      const cx = x0 + PW / 2;
      const color = num(SLOT_COLORS[p.slot] ?? '#ffffff');
      scene.add.rectangle(cx, TOP + PH / 2, PW, PH, 0x1a1240).setStrokeStyle(2, color).setDepth(1);
      scene.add.rectangle(cx, TOP + 4, PW - 2, 6, color).setDepth(2);
      const sprite = scene.add.sprite(cx, TOP + 84, `char-${p.characterId}`, 0).setOrigin(0.5, 1).setScale(3).setDepth(5);
      const score = new PixelNumber(scene, cx, TOP + 94, 2, num('#ffe08a'), 6);
      score.set('0');
      const stars = [0, 1, 2, 3, 4].map((j) => scene.add.image(cx - 24 + j * 12, TOP + 122, 'star8').setAlpha(0.2).setDepth(5));
      const plate = scene.add.rectangle(cx, TOP + 174, 88, 88, 0x120a2e).setStrokeStyle(2, 0x3a2c78).setDepth(3);
      const arrow = scene.add.image(cx, TOP + 174, 'arrow').setScale(4).setVisible(false).setDepth(6);
      const dots = [-12, 0, 12].map((dx) => scene.add.image(cx + dx, TOP + 174, 'spark').setScale(2).setTint(0x4a3a8c).setDepth(5));
      const barBg = scene.add.rectangle(cx, TOP + 230, 96, 7, 0x120a2e).setStrokeStyle(1, 0x3a2c78).setDepth(5);
      const bar = scene.add.rectangle(cx - 47, TOP + 230, 94, 5, 0x4fd36b).setOrigin(0, 0.5).setDepth(6).setVisible(false);
      const icon = scene.add.image(cx + 30, TOP + 140, 'check').setScale(2).setVisible(false).setDepth(9);
      const lock = scene.add.rectangle(cx, TOP + PH / 2, PW, PH, 0x7a2a2a, 0.5).setVisible(false).setDepth(8);
      const gold = [[-38, -38], [38, -38], [-38, 38], [38, 38]].map(([dx, dy]) => scene.add.image(cx + dx!, TOP + 174 + dy!, 'star8').setVisible(false).setDepth(7));
      this.panels.push({ id: p.id, slot: p.slot, cx, sprite, score, stars, plate, arrow, dots, barBg, bar, icon, lock, gold, resSeq: 0, flashUntil: 0, flashAnim: 'idle', lastPoints: 0 });
    });
  }

  setDebug() { /* sem hitboxes neste minigame */ }

  readInput(pad: Pad) {
    for (const key of pad.pressed) { this.n++; this.k = KEY_TO_SYMBOL[key]; }
    return { k: this.k, n: this.n };
  }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    const st = snap.state as ReflexState;
    const t = ctx.time;
    const a = st.active;

    if (a && a.no !== this.lastNo) {
      this.lastNo = a.no;
      sfx.tick();
      for (const P of this.panels) {
        P.arrow.setScale(2);
        this.scene.tweens.add({ targets: P.arrow, scale: 4, duration: 140, ease: 'Back.easeOut' });
      }
    }
    const best = Math.max(...st.order.map((id) => st.players[id]!.points));

    for (const P of this.panels) {
      const pl = st.players[P.id];
      if (!pl) continue;
      const mine = P.id === this.myId;

      // seta
      if (a) {
        const done = pl.resolvedNo === a.no;
        P.arrow.setVisible(true).setAngle(ANGLE[a.symbol]!).setTint(a.gold ? GOLD : ARROW_TINT[a.symbol]!).setAlpha(done ? 0.3 : 1);
        P.plate.setStrokeStyle(2, a.gold ? GOLD : 0x3a2c78);
        P.gold.forEach((g, i) => g.setVisible(a.gold && !done).setAngle(Math.sin(t / 200 + i) * 12));
        P.dots.forEach((d) => d.setVisible(false));
        const ratio = Math.max(0, (a.startMs + a.windowMs - st.elapsedMs) / a.windowMs);
        P.bar.setVisible(!done).setScale(ratio, 1).setFillStyle(ratio > 0.55 ? 0x4fd36b : ratio > 0.25 ? 0xffb03c : 0xff5d5d);
      } else {
        P.arrow.setVisible(false);
        P.plate.setStrokeStyle(2, 0x3a2c78);
        P.gold.forEach((g) => g.setVisible(false));
        P.bar.setVisible(false);
        P.dots.forEach((d, i) => d.setVisible(true).setAlpha(0.35 + 0.4 * Math.abs(Math.sin(t / 300 + i * 0.8))));
      }

      // placar e sequência
      if (pl.points !== P.lastPoints) { P.lastPoints = pl.points; P.score.set(String(pl.points)); }
      P.stars.forEach((s, i) => s.setAlpha(i < Math.min(5, pl.streak) ? 1 : 0.2));

      // resultado da seta (acerto, erro, perdeu)
      if (pl.resSeq !== P.resSeq) {
        P.resSeq = pl.resSeq;
        const r = pl.res;
        if (r) {
          if (r.kind === 'hit') {
            P.icon.setTexture('check').setVisible(true);
            popup(this.scene, P.cx, TOP + 120, `+${r.pts}`, num('#6dff8a'));
            P.flashUntil = t + 450; P.flashAnim = 'celebrate';
            this.burst(P.cx, TOP + 174, 0xffe08a, r.pts >= 25 ? 10 : 6);
            if (mine) (r.pts >= 25 ? sfx.bigCoin() : sfx.hitNote(pl.streak));
          } else if (r.kind === 'error') {
            P.icon.setTexture('cross').setVisible(true);
            if (r.pts < 0) popup(this.scene, P.cx, TOP + 120, `${r.pts}`, num('#ff6b6b'));
            P.flashUntil = t + 700; P.flashAnim = 'surprised';
            if (mine) sfx.error();
          } else {
            P.icon.setTexture('cross').setVisible(true).setAlpha(0.45);
            if (mine) sfx.miss();
          }
          this.scene.time.delayedCall(550, () => P.icon.setVisible(false).setAlpha(1));
        }
      }
      P.lock.setVisible(pl.lockMs > 0);

      // personagem
      let anim: CharAnim = 'idle';
      if (ctx.phase === 'result') anim = pl.points === best && best > 0 ? 'celebrate' : 'lose';
      else if (pl.lockMs > 0) anim = 'surprised';
      else if (t < P.flashUntil) anim = P.flashAnim;
      const info = ANIMS[anim];
      P.sprite.setFrame(FRAME_INDEX[anim] + (info.frames > 1 ? Math.floor((t / 1000) * info.fps) % info.frames : 0));
    }
  }

  private burst(x: number, y: number, tint: number, n: number) {
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n;
      const sp = this.scene.add.image(x, y, 'spark').setTint(tint).setDepth(40).setScale(2);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(ang) * 34, y: y + Math.sin(ang) * 34, alpha: 0, duration: 380, onComplete: () => sp.destroy() });
    }
  }

  destroy() { this.panels = []; }
}
