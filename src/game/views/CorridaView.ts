import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { FINISH_X, GROUND_LOCAL_Y as GY, LANE_H, getTrack, TRACK_LENGTH, type CorridaState, type Runner } from '@shared/minigames/corrida-maluca';
import type { CharacterId } from '@shared/characters';
import { ANIMS, FRAME_INDEX, type CharAnim } from '../art/characters';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import { NameTags } from './nameTags';
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
  boxes: Map<number, Phaser.GameObjects.Image>;
  hazards: Map<number, { barrel: Phaser.GameObjects.Image; sign: Phaser.GameObjects.Image }>;
  shield: Phaser.GameObjects.Image; rank: Phaser.GameObjects.Text;
  birds: Map<number, Phaser.GameObjects.Sprite>; birdWarn: Phaser.GameObjects.Image;
  dispX: number; lastDust: number; lastStreak: number;
  prev: Pick<Runner, 'grounded' | 'stunMs' | 'falling' | 'coins' | 'finishedAtMs' | 'springMs' | 'fxSeq' | 'shield' | 'ducking'> | null;
}

const FONT = "'Pixelify Sans', ui-monospace, monospace";
const POPUP: Record<string, { text: string; color: string }> = {
  turbo: { text: 'TURBO!', color: '#ffe08a' },
  pad: { text: 'IMPULSO!', color: '#ffb02e' },
  shield: { text: 'ESCUDO!', color: '#8fe8ff' },
  attack: { text: 'ATAQUE!', color: '#ff8a5a' },
  block: { text: 'BLOQUEOU!', color: '#8fe8ff' },
  warn: { text: 'CUIDADO: BARRIL!', color: '#ff6a6a' },
};
interface Hint { x: number; text: string }

/** Corrida Maluca: 4 pistas lado a lado, cada uma com sua própria câmera que segue o corredor. */
export class CorridaView implements GameView {
  private lanes: Lane[] = [];
  private built = false;
  private debug = false;
  private hints: Hint[] = [];
  private hintText: Phaser.GameObjects.Text | null = null;

  private tags: NameTags;
  constructor(private scene: Phaser.Scene, private participants: ParticipantInfo[], private myId: string | null) {
    this.tags = new NameTags(scene, participants, myId, false);
    const main = scene.cameras.main;
    main.setViewport(0, LANE_H * 4, W, H - LANE_H * 4);
    main.setScroll(0, 5000); // a câmera principal não mostra nada do mundo
  }

  setDebug(on: boolean) { this.debug = on; }
  readInput(pad: Pad) { return { run: Math.sign(pad.dx) as -1 | 0 | 1, jump: pad.action || pad.dy < 0, duck: pad.dy > 0 }; }

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

      for (const pl of track.platforms) sc.add.tileSprite(pl.x, base + GY - pl.h, pl.w, 16, 'plank').setOrigin(0, 0).setDepth(4);
      for (const c of track.crates) sc.add.image(c.x, base + GY, 'crate').setOrigin(0.5, 1).setDepth(5);
      for (const s of track.springs) sc.add.image(s.x, base + GY, 'spring').setOrigin(0.5, 1).setDepth(5);
      for (const m of track.muds) sc.add.tileSprite(m.x, base + GY, m.w, 10, 'cm-mud').setOrigin(0, 0).setDepth(3.5);
      for (const pd of track.pads) {
        sc.add.image(pd.x, base + GY, 'cm-padglow').setOrigin(0.5, 1).setDepth(4);
        sc.add.image(pd.x, base + GY + 1, 'cm-pad').setOrigin(0.5, 1).setDepth(4.5);
      }
      for (const b of track.beams) {
        // túnel baixo: muro até 9 px do chão, abertura escura embaixo, seta amarela e borda listrada
        const top = base + GY - 9;
        sc.add.image(b.x, base + GY, 'cm-tunnel').setOrigin(0.5, 1).setDepth(4);
        sc.add.tileSprite(b.x - 10, base, 20, top - base - 3, 'cm-wall').setOrigin(0, 0).setDepth(11);
        sc.add.image(b.x, top - 3, 'cm-lip').setOrigin(0.5, 0).setDepth(11);
        sc.add.image(b.x, top - 18, 'cm-wallarrow').setOrigin(0.5, 0).setDepth(11);
        this.sign(sc, b.x - 70, base, 'cm-signduck', 'ABAIXE');
      }
      for (const h of track.holes) this.sign(sc, h.x - 44, base, 'cm-signjump', 'PULE');
      for (const m of track.muds) this.sign(sc, m.x - 44, base, 'cm-signjump', 'PULE');
      [...track.crates].sort((p, q) => p.id - q.id).slice(0, 2).forEach((c) => this.sign(sc, c.x - 44, base, 'cm-signjump', 'PULE'));
      const boxes = new Map<number, Phaser.GameObjects.Image>();
      for (const b of track.boxes) boxes.set(b.id, sc.add.image(b.x, base + GY - b.h - 5, 'cm-box').setDepth(6));
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

      const shield = sc.add.image(0, base + GY, 'cm-shield').setDepth(12).setVisible(false);
      const rank = sc.add.text(0, base + 4, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff', stroke: '#1b1030', strokeThickness: 3 }).setResolution(2).setOrigin(1, 0).setDepth(85);
      const birdWarn = sc.add.image(0, base + GY - 12, 'cm-signwarn').setOrigin(1, 0.5).setDepth(88).setVisible(false);
      this.lanes.push({ id: p.id, slot: p.slot, base, cam, sky, hills, clouds, stripe, edge, sprite, shadow, marker, coins, boxes, hazards: new Map(), shield, rank, birds: new Map(), birdWarn, dispX: 24, lastDust: 0, lastStreak: 0, prev: null });
    });
    // dicas só da PRIMEIRA ocorrência de cada mecânica (o jogador novo aprende vendo)
    const first = <T extends { id: number; x: number }>(a: T[]) => a.reduce<T | undefined>((m, c) => (!m || c.id < m.id ? c : m), undefined);
    const mk = (o: { x: number } | undefined, text: string, dx = 0): Hint[] => (o ? [{ x: o.x + dx, text }] : []);
    this.hints = [
      ...mk(first(track.crates), 'PULE! Espaço ou ↑'),
      ...mk(first(track.beams), 'ABAIXE! Tecla ↓ ou S'),
      ...mk(first(track.birds), 'PÁSSARO! ABAIXE (ou pule na hora)', 130),
      ...mk(first(track.pads), 'SETA = TURBO!'),
      ...mk(first(track.muds), 'LAMA: lento! PULE por cima'),
      ...mk(first(track.boxes), 'Pegue a caixa ?'),
      ...mk(first(track.holes), 'BURACO! Pule!', 8),
    ];
    this.hintText = sc.add.text(0, 0, '', { fontFamily: FONT, fontSize: '9px', color: '#ffffff', backgroundColor: '#1b1030', padding: { x: 4, y: 2 } })
      .setResolution(2).setOrigin(0.5, 0).setDepth(90).setVisible(false);
    this.built = true;
  }

  private sign(sc: Phaser.Scene, x: number, base: number, key: string, label: string) {
    sc.add.image(x, base + GY, key).setOrigin(0.5, 1).setDepth(5);
    sc.add.text(x, base + GY - 26, label, { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#1b1030', strokeThickness: 3 }).setResolution(2).setOrigin(0.5, 1).setDepth(5);
  }

  private popup(lane: Lane, x: number, y: number, text: string, color: string) {
    const t = this.scene.add.text(x, y, text, { fontFamily: FONT, fontSize: '10px', color, stroke: '#1b1030', strokeThickness: 3 }).setResolution(2).setOrigin(0.5, 1).setDepth(95);
    this.scene.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 1100, delay: 250, onComplete: () => t.destroy() });
    void lane;
  }

  private puff(x: number, y: number, tint: number, n: number, spread: number, up: number) {
    for (let i = 0; i < n; i++) {
      const sp = this.scene.add.image(x, y, 'spark').setTint(tint).setDepth(60);
      this.scene.tweens.add({ targets: sp, x: x + (Math.random() * 2 - 1) * spread, y: y - up * (0.4 + Math.random() * 0.6), alpha: 0, duration: 280 + Math.random() * 120, onComplete: () => sp.destroy() });
    }
  }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    this.tags.begin(ctx);
    const st = snap.state as CorridaState;
    if (!this.built) this.build(st.seed);
    const t = ctx.time;
    // posição de cada um: quem já chegou (pelo tempo), depois pela distância
    const order = [...this.lanes].sort((a, b) => {
      const ra = st.players[a.id], rb = st.players[b.id];
      if (!ra || !rb) return 0;
      if (ra.finishedAtMs !== null || rb.finishedAtMs !== null) return (ra.finishedAtMs ?? Infinity) - (rb.finishedAtMs ?? Infinity);
      return rb.x - ra.x;
    });

    for (const L of this.lanes) {
      const r = st.players[L.id];
      if (!r) continue;
      const mine = L.id === this.myId;
      // suaviza entre snapshots; teleporte (reaparecer) vai direto
      L.dispX = Math.abs(r.x - L.dispX) > 30 ? r.x : L.dispX + (r.x - L.dispX) * 0.5;
      const camX = Math.max(0, L.dispX - RUNNER_SCREEN_X);
      L.cam.setScroll(camX, L.base);
      L.sky.x = camX; L.hills.x = camX; L.clouds.x = camX; L.stripe.x = camX; L.edge.x = camX;
      const pos = order.indexOf(L) + 1;
      L.rank.setText(`${pos}º`).setColor(pos === 1 ? '#ffe08a' : '#ffffff').setPosition(camX + W - 6, L.base + 48);

      // barris lançados por rivais (só existem na pista do alvo)
      const live = new Set<number>();
      for (const h of st.hazards) {
        if (h.to !== L.id) continue;
        live.add(h.id);
        let o = L.hazards.get(h.id);
        if (!o) {
          o = { barrel: this.scene.add.image(h.x, L.base + GY, 'cm-barrel').setOrigin(0.5, 1).setDepth(5), sign: this.scene.add.image(h.x, L.base + GY - 22, 'cm-signwarn').setOrigin(0.5, 1).setDepth(5) };
          this.scene.tweens.add({ targets: o.barrel, scaleY: { from: 0.2, to: 1 }, duration: 220 });
          L.hazards.set(h.id, o);
        }
        o.sign.setVisible(h.x - L.dispX > 12).y = L.base + GY - 22 + Math.round(Math.sin(t / 120));
      }
      for (const [id, o] of L.hazards) if (!live.has(id)) { o.barrel.destroy(); o.sign.destroy(); L.hazards.delete(id); }

      // pássaros: voam para a esquerda na altura da cabeça; um "!" vermelho avisa enquanto estão fora da tela
      const seen = new Set<number>();
      let offscreen = false;
      for (const b of r.birds) {
        seen.add(b.id);
        let sp = L.birds.get(b.id);
        if (!sp) { sp = this.scene.add.sprite(b.x, L.base + GY - 12, 'cm-bird', 0).setDepth(9); L.birds.set(b.id, sp); if (mine) sfx.laser(); }
        sp.setPosition(Math.round(b.x), L.base + GY - 12 + Math.round(Math.sin(t / 140 + b.id) * 1)).setFrame(Math.floor(t / 110) % 2);
        if (b.x - L.dispX > W - RUNNER_SCREEN_X - 10) offscreen = true;
      }
      for (const [id, sp] of L.birds) if (!seen.has(id)) { sp.destroy(); L.birds.delete(id); }
      L.birdWarn.setVisible(offscreen).setPosition(camX + W - 3, L.base + GY - 12 + Math.round(Math.sin(t / 70) * 2));
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
      L.sprite.setScale(r.ducking ? 1.12 : 1, r.ducking ? 0.6 : 1);
      L.shield.setVisible(r.shield).setPosition(Math.round(L.dispX), Math.round(groundY - r.y) - 10).setAlpha(0.7 + Math.sin(t / 120) * 0.2);
      L.shadow.setPosition(Math.round(L.dispX), groundY - (r.grounded ? r.y : 0) + 1).setVisible(r.grounded && !r.falling);
      L.marker.setPosition(Math.round(L.dispX), Math.round(groundY - r.y) - (r.ducking ? 14 : 21) + Math.round(Math.sin(t / 200) * (mine ? 2 : 1)));
      this.tags.place(L.id, Math.round(L.dispX), Math.round(groundY - r.y) - (r.ducking ? 18 : 26));

      // moedas já coletadas somem (por pista)
      if (r.collected.length) for (const id of r.collected) { const c = L.coins.get(id); if (c?.visible) c.setVisible(false); }
      for (const [id, c] of L.coins) if (c.visible) c.setFrame(Math.floor(t / 120 + id) % 4);
      for (const [id, b] of L.boxes) {
        if (r.collected.includes(id)) { if (b.visible) { b.setVisible(false); this.puff(b.x, b.y, 0xb98cff, 6, 10, 10); } } else b.y = L.base + GY - (getTrack(st.seed).boxes.find((q) => q.id === id)?.h ?? 10) - 5 + Math.round(Math.sin(t / 220 + id) * 1.5);
      }

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
      if (p && r.fxSeq !== p.fxSeq && r.fx && POPUP[r.fx]) {
        const pp = POPUP[r.fx]!;
        if (mine || r.fx === 'attack') this.popup(L, Math.round(L.dispX), Math.round(groundY - r.y) - 24, pp.text, pp.color);
        if (r.fx === 'turbo' || r.fx === 'pad') { this.puff(L.dispX - 4, groundY - r.y - 6, 0xffe08a, 8, 16, 8); if (mine) sfx.powerup(); }
        else if (r.fx === 'shield') { this.puff(L.dispX, groundY - r.y - 10, 0x8fe8ff, 8, 14, 12); if (mine) sfx.shieldUp(); }
        else if (r.fx === 'attack') { if (mine) sfx.stolen(); }
        else if (r.fx === 'block') { this.puff(L.dispX, groundY - r.y - 10, 0x8fe8ff, 10, 16, 12); if (mine) sfx.click(); }
        else if (r.fx === 'warn') { if (mine) sfx.error(); }
      }
      // linhas de velocidade no turbo; respingos na lama
      if (r.turboMs > 0 && r.finishedAtMs === null && t - L.lastStreak > 60) {
        L.lastStreak = t;
        const sy = groundY - r.y - 3 - Math.random() * 10;
        const sk = this.scene.add.image(L.dispX - 8, sy, 'cm-streak').setOrigin(1, 0.5).setDepth(9);
        this.scene.tweens.add({ targets: sk, x: sk.x - 14, alpha: 0, duration: 260, onComplete: () => sk.destroy() });
      }
      if (r.inMud && r.speed > 10 && t - L.lastDust > 90) { L.lastDust = t; this.puff(L.dispX - 3, groundY - 1, 0x6b4423, 2, 6, 7); }
      if (mine && this.hintText) {
        const h = this.hints.find((q) => q.x - L.dispX > 18 && q.x - L.dispX < 150);
        const show = !!h && ctx.phase === 'active' && r.finishedAtMs === null;
        this.hintText.setVisible(show);
        if (show) this.hintText.setText(h!.text).setPosition(camX + W / 2 + 40, L.base + 24);
      }
      L.prev = { grounded: r.grounded, stunMs: r.stunMs, falling: r.falling, coins: r.coins, finishedAtMs: r.finishedAtMs, springMs: r.springMs, fxSeq: r.fxSeq, shield: r.shield, ducking: r.ducking };
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
