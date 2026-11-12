import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { FINISH_X, GROUND_LOCAL_Y as GY, LANE_H, getTrack, TRACK_LENGTH, type CorridaState, type Runner } from '@shared/minigames/corrida-maluca';
import type { CharacterId } from '@shared/characters';
import { ANIMS, FRAME_INDEX, type CharAnim } from '../art/characters';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import type { GameView, Pad, RenderCtx } from './GameView';

const W = 480;
const H = 270;
const SPACING = 100; // cada pista vive numa faixa de y própria do mundo (a câmera de cada pista só enxerga a sua)
const RUNNER_SCREEN_X = 110;

interface Lane {
  id: string; slot: number; base: number;
  cam: Phaser.Cameras.Scene2D.Camera;
  sky: Phaser.GameObjects.Image; hills: Phaser.GameObjects.TileSprite; clouds: Phaser.GameObjects.TileSprite;
  stripe: Phaser.GameObjects.Rectangle; edge: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image;
  coins: Map<number, Phaser.GameObjects.Sprite>;
  dispX: number; lastDust: number; prev: Pick<Runner, 'grounded' | 'stunMs' | 'falling' | 'coins' | 'finishedAtMs' | 'springMs'> | null;
}

/** Corrida Maluca: 4 pistas lado a lado, cada uma com sua própria câmera que segue o corredor. */
export class CorridaView implements GameView {
  private lanes: Lane[] = [];
  private built = false;
  private debug = false;

  constructor(private scene: Phaser.Scene, private participants: ParticipantInfo[], private myId: string | null) {
    const main = scene.cameras.main;
    main.setViewport(0, LANE_H * 4, W, H - LANE_H * 4);
    main.setScroll(0, 5000); // a câmera principal não mostra nada do mundo
  }

  setDebug(on: boolean) { this.debug = on; }
  readInput(pad: Pad) { return { run: Math.sign(pad.dx) as -1 | 0 | 1, jump: pad.action || pad.dy < 0 }; }

  private build(seed: number) {
    const sc = this.scene;
    const track = getTrack(seed);
    const holes = [...track.holes].sort((a, b) => a.x - b.x);
    const sorted = [...this.participants].sort((a, b) => a.slot - b.slot);

    sorted.forEach((p, i) => {
      const base = i * SPACING;
      const cam = sc.cameras.add(0, i * LANE_H, W, LANE_H);
      cam.setScroll(0, base);
      cam.roundPixels = true;

      const sky = sc.add.image(0, base, 'sky-lane').setOrigin(0, 0).setDepth(0);
      const hills = sc.add.tileSprite(0, base + 17, W, 40, 'hills').setOrigin(0, 0).setDepth(1);
      const clouds = sc.add.tileSprite(0, base + 3, W, 30, 'clouds').setOrigin(0, 0).setDepth(1);

      // chão em segmentos entre os buracos; buracos mostram água
      let cursor = -700;
      for (const h of holes) {
        if (h.x > cursor) sc.add.tileSprite(cursor, base + GY, h.x - cursor, 10, 'ground').setOrigin(0, 0).setDepth(3);
        sc.add.tileSprite(h.x, base + GY, h.w, 10, 'pit').setOrigin(0, 0).setDepth(2);
        cursor = h.x + h.w;
      }
      sc.add.tileSprite(cursor, base + GY, TRACK_LENGTH + 700 - cursor, 10, 'ground').setOrigin(0, 0).setDepth(3);

      for (const pl of track.platforms) sc.add.tileSprite(pl.x, base + GY - pl.h, pl.w, 6, 'plank').setOrigin(0, 0).setDepth(4);
      for (const c of track.crates) sc.add.image(c.x, base + GY, 'crate').setOrigin(0.5, 1).setDepth(5);
      for (const s of track.springs) sc.add.image(s.x, base + GY, 'spring').setOrigin(0.5, 1).setDepth(5);
      const coins = new Map<number, Phaser.GameObjects.Sprite>();
      for (const c of track.coins) coins.set(c.id, sc.add.sprite(c.x, base + GY - c.h - 4, 'coin', c.id % 4).setDepth(6));

      // linha de chegada
      sc.add.tileSprite(FINISH_X - 4, base, 8, GY, 'checker').setOrigin(0, 0).setDepth(4).setAlpha(0.9);
      sc.add.rectangle(FINISH_X - 5, base, 1, GY, num('#1b1030')).setOrigin(0, 0).setDepth(4);
      sc.add.rectangle(FINISH_X + 4, base, 1, GY, num('#1b1030')).setOrigin(0, 0).setDepth(4);

      const shadow = sc.add.image(0, base + GY, 'shadow').setDepth(7).setAlpha(0.9);
      const sprite = sc.add.sprite(0, base + GY, `char-${p.characterId}`, 0).setOrigin(0.5, 0.97).setDepth(10);
      const marker = sc.add.image(0, base + GY - 24, 'marker').setTint(num(SLOT_COLORS[p.slot] ?? '#ffffff')).setDepth(70);
      const stripe = sc.add.rectangle(0, base, 3, LANE_H, num(SLOT_COLORS[p.slot] ?? '#ffffff')).setOrigin(0, 0).setDepth(80);
      const edge = sc.add.rectangle(0, base + LANE_H - 1, W, 1, num('#1b1030')).setOrigin(0, 0).setDepth(80);

      this.lanes.push({ id: p.id, slot: p.slot, base, cam, sky, hills, clouds, stripe, edge, sprite, shadow, marker, coins, dispX: 24, lastDust: 0, prev: null });
    });
    this.built = true;
  }

  private puff(x: number, y: number, tint: number, n: number, spread: number, up: number) {
    for (let i = 0; i < n; i++) {
      const sp = this.scene.add.image(x, y, 'spark').setTint(tint).setDepth(60);
      this.scene.tweens.add({ targets: sp, x: x + (Math.random() * 2 - 1) * spread, y: y - up * (0.4 + Math.random() * 0.6), alpha: 0, duration: 280 + Math.random() * 120, onComplete: () => sp.destroy() });
    }
  }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    const st = snap.state as CorridaState;
    if (!this.built) this.build(st.seed);
    const t = ctx.time;

    for (const L of this.lanes) {
      const r = st.players[L.id];
      if (!r) continue;
      const mine = L.id === this.myId;
      // suaviza entre snapshots; teleporte (reaparecer) vai direto
      L.dispX = Math.abs(r.x - L.dispX) > 30 ? r.x : L.dispX + (r.x - L.dispX) * 0.5;
      const camX = Math.max(0, L.dispX - RUNNER_SCREEN_X);
      L.cam.setScroll(camX, L.base);
      L.sky.x = camX; L.hills.x = camX; L.clouds.x = camX; L.stripe.x = camX; L.edge.x = camX;
      L.hills.tilePositionX = camX * 0.25;
      L.clouds.tilePositionX = camX * 0.1 + t * 0.004;

      // animação
      let anim: CharAnim;
      if (r.finishedAtMs !== null) anim = r.speed < 30 ? 'celebrate' : 'run';
      else if (ctx.phase === 'result') anim = 'lose';
      else if (r.falling) anim = 'fall';
      else if (!r.grounded) anim = 'jump';
      else if (r.stunMs > 0) anim = 'surprised';
      else if (r.speed < 8) anim = 'idle';
      else anim = 'run';
      const info = ANIMS[anim];
      const frame = FRAME_INDEX[anim] + (info.frames > 1 ? Math.floor((t / 1000) * (anim === 'run' ? 8 + r.speed / 20 : info.fps)) % info.frames : 0);
      const groundY = L.base + GY;
      L.sprite.setFrame(frame);
      L.sprite.setPosition(Math.round(L.dispX), Math.round(groundY - r.y));
      L.sprite.setAlpha(r.invulnMs > 0 && Math.floor(t / 80) % 2 ? 0.45 : r.falling && r.y < -12 ? 0.5 : 1);
      L.shadow.setPosition(Math.round(L.dispX), groundY - (r.grounded ? r.y : 0) + 1).setVisible(r.grounded && !r.falling);
      L.marker.setPosition(Math.round(L.dispX), Math.round(groundY - r.y) - 21 + Math.round(Math.sin(t / 200) * (mine ? 2 : 1)));

      // moedas já coletadas somem (por pista)
      if (r.collected.length) for (const id of r.collected) { const c = L.coins.get(id); if (c?.visible) c.setVisible(false); }
      for (const [id, c] of L.coins) if (c.visible) c.setFrame(Math.floor(t / 120 + id) % 4);

      // efeitos e sons (som só do meu corredor)
      const p = L.prev;
      if (p) {
        if (r.coins > p.coins) { this.puff(L.dispX, groundY - r.y - 8, 0xffe08a, 4, 10, 10); if (mine) sfx.coin(); }
        if (r.stunMs > 0 && p.stunMs <= 0) { this.puff(L.dispX, groundY - r.y - 10, 0xff8a5a, 6, 12, 8); if (mine) sfx.hit(); }
        if (r.falling && !p.falling) { this.puff(L.dispX, groundY, 0x9ad0ff, 8, 14, 18); if (mine) sfx.fall(); }
        if (r.springMs > 400 && p.springMs <= 400) { this.puff(L.dispX, groundY - 3, 0xff9a8a, 6, 10, 14); if (mine) sfx.spring(); }
        else if (p.grounded && !r.grounded && r.vy > 150 && r.springMs <= 0 && mine) sfx.jump();
        if (r.finishedAtMs !== null && p.finishedAtMs === null) { this.puff(L.dispX, groundY - 12, 0xffe08a, 10, 20, 20); if (mine) sfx.win(); }
      }
      if (r.grounded && r.speed > 40 && r.finishedAtMs === null && t - L.lastDust > 140) { L.lastDust = t; this.puff(L.dispX - 4, groundY, 0xd8c79a, 1, 4, 5); }
      L.prev = { grounded: r.grounded, stunMs: r.stunMs, falling: r.falling, coins: r.coins, finishedAtMs: r.finishedAtMs, springMs: r.springMs };
    }
  }

  destroy() {
    for (const L of this.lanes) this.scene.cameras.remove(L.cam);
    this.lanes = [];
    const main = this.scene.cameras.main;
    main.setViewport(0, 0, W, H);
    main.setScroll(0, 0);
  }
}
