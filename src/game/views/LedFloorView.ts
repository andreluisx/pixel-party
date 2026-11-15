import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { ARENA_X, ARENA_Y, COLOR_HEX, COLOR_NAMES, COLS, MAX_ROUNDS, ROWS, TILE, TILES, timesFor, tileAt, type LedPublic } from '@shared/minigames/piso-led';
import { ANIMS, FRAME_INDEX, type CharAnim } from '../art/characters';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import { NameTags } from './nameTags';
import type { GameView, Pad, RenderCtx } from './GameView';
import { PixelNumber } from './pixelNumber';

const COLORS = COLOR_HEX.map((h) => num(h));

interface PlayerVis {
  id: string; slot: number;
  sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image; hl: Phaser.GameObjects.Rectangle;
  statusDot: Phaser.GameObjects.Rectangle; statusFace: Phaser.GameObjects.Sprite; statusX: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  dispX: number; dispY: number; prevAlive: boolean; prevVerdict: string | null;
}

/** Piso de LED: arena de placas luminosas, telão anunciando a cor, apagão e eliminação. */
export class LedFloorView implements GameView {
  private tiles: Phaser.GameObjects.Image[] = [];
  private shapes: Phaser.GameObjects.Image[] = [];
  private dim: Phaser.GameObjects.Rectangle[] = [];
  private players: PlayerVis[] = [];
  private bulbs: Phaser.GameObjects.Rectangle[] = [];
  private telaoBg!: Phaser.GameObjects.Rectangle;
  private swatch!: Phaser.GameObjects.Rectangle;
  private swatchShape!: Phaser.GameObjects.Image;
  private lamps: Phaser.GameObjects.Rectangle[] = [];
  private bar!: Phaser.GameObjects.Rectangle;
  private main!: PixelNumber;
  private sub!: PixelNumber;
  private roundDots: Phaser.GameObjects.Rectangle[] = [];
  private roundNum!: PixelNumber;
  private sig = '';
  private lastRound = 0;
  private lastAnnounced = -1;
  private lastSecond = -1;
  private lastPhase = '';

  private tags: NameTags;
  constructor(private scene: Phaser.Scene, participants: ParticipantInfo[], private myId: string | null) {
    this.tags = new NameTags(scene, participants, myId);
    scene.add.rectangle(240, 135, 480, 270, 0x0e0820).setDepth(0);
    // moldura neon da arena
    scene.add.rectangle(ARENA_X + (COLS * TILE) / 2, ARENA_Y + (ROWS * TILE) / 2, COLS * TILE + 8, ROWS * TILE + 8, 0x1b1030).setStrokeStyle(2, 0x4ad8ff).setDepth(1);
    for (let i = 0; i < TILES; i++) {
      const x = ARENA_X + (i % COLS) * TILE + TILE / 2, y = ARENA_Y + Math.floor(i / COLS) * TILE + TILE / 2;
      this.tiles.push(scene.add.image(x, y, 'led-off').setDepth(2));
      this.shapes.push(scene.add.image(x, y, 'shape-0').setDepth(3).setVisible(false));
      this.dim.push(scene.add.rectangle(x, y, TILE - 2, TILE - 2, 0x0e0820, 0.6).setDepth(4).setVisible(false));
    }
    // telão
    this.telaoBg = scene.add.rectangle(240, 31, 372, 52, 0x120a2e).setStrokeStyle(3, 0x4ad8ff).setDepth(5);
    scene.add.rectangle(240, 31, 362, 42, 0x0b0620).setDepth(5);
    for (let i = 0; i < 28; i++) {
      const x = 56 + i * (368 / 27);
      this.bulbs.push(scene.add.rectangle(x, 6, 3, 3, 0xffd23d).setDepth(6), scene.add.rectangle(x, 56, 3, 3, 0xffd23d).setDepth(6));
    }
    this.swatch = scene.add.rectangle(92, 31, 38, 38, 0x333333).setStrokeStyle(2, 0x1b1030).setDepth(6).setVisible(false);
    this.swatchShape = scene.add.image(92, 31, 'shape-0').setScale(3).setDepth(7).setVisible(false);
    this.main = new PixelNumber(scene, 250, 18, 4, 0xffffff, 7);
    this.sub = new PixelNumber(scene, 250, 42, 2, 0xcdbf95, 7);
    this.lamps = [0, 1, 2].map((i) => scene.add.rectangle(396 + i * 8, 31, 5, 5, 0x3a2c78).setDepth(7));
    this.bar = scene.add.rectangle(240, 62, 362, 3, 0x4ad8ff).setDepth(6).setVisible(false);

    // coluna da direita: rodada
    this.roundNum = new PixelNumber(scene, 446, 82, 3, 0xffe08a, 6);
    this.roundDots = Array.from({ length: MAX_ROUNDS }, (_, i) => scene.add.rectangle(446, 112 + i * 14, 8, 8, 0x3a2c78).setDepth(6));

    const sorted = [...participants].sort((a, b) => a.slot - b.slot);
    sorted.forEach((p, i) => {
      const color = num(SLOT_COLORS[p.slot] ?? '#ffffff');
      // coluna da esquerda: quem ainda está vivo
      scene.add.rectangle(34, 82 + i * 44, 56, 38, 0x1a1240).setStrokeStyle(2, color).setDepth(5);
      const statusFace = scene.add.sprite(22, 86 + i * 44, `char-${p.characterId}`, 0).setDepth(6);
      const statusDot = scene.add.rectangle(48, 82 + i * 44, 8, 8, 0x4fd36b).setDepth(6);
      const statusX = scene.add.image(48, 82 + i * 44, 'cross').setScale(0.7).setDepth(7).setVisible(false);

      const shadow = scene.add.image(0, 0, 'shadow').setDepth(10).setTint(color);
      const sprite = scene.add.sprite(0, 0, `char-${p.characterId}`, 0).setOrigin(0.5, 0.8).setScale(1).setDepth(12);
      const marker = scene.add.image(0, 0, 'marker').setTint(color).setDepth(30);
      const hl = scene.add.rectangle(0, 0, TILE - 4, TILE - 4).setStrokeStyle(2, color, 0.9).setDepth(8).setVisible(false);
      const icon = scene.add.image(0, 0, 'check').setDepth(40).setVisible(false);
      if (p.id === this.myId) new PixelNumber(scene, 34, 98 + i * 44, 1, 0xffd23d, 7).set('VOCE');
      this.players.push({ id: p.id, slot: p.slot, sprite, shadow, marker, hl, statusDot, statusFace, statusX, icon, dispX: -1, dispY: -1, prevAlive: true, prevVerdict: null });
    });
    this.main.set('PISO DE LED');
    this.sub.set('PREPARE-SE'.replace('-', ' '));
  }

  setDebug() { /* sem hitboxes */ }
  readInput(pad: Pad) { return { dx: pad.dx, dy: pad.dy }; }

  private setTile(i: number, color: number | null, strong = true) {
    const t = this.tiles[i]!;
    if (color === null) { t.setTexture('led-off').clearTint(); this.shapes[i]!.setVisible(false); return; }
    t.setTexture('led-on').setTint(COLORS[color]!);
    this.shapes[i]!.setTexture(`shape-${color}`).setVisible(true).setAlpha(strong ? 1 : 0.6);
  }

  private flashAll(alpha = 0.35) {
    this.scene.tweens.add({ targets: this.tiles, alpha: { from: alpha, to: 1 }, duration: 140 });
  }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    this.tags.begin(ctx);
    const s = snap.state as LedPublic;
    const t = ctx.time;
    const T = timesFor(s.round);
    const ph = s.phase;

    // ----- novo round
    if (s.round !== this.lastRound) {
      this.lastRound = s.round;
      this.lastAnnounced = -1; this.lastSecond = -1; this.sig = '';
      this.roundNum.set(`R${s.round}`);
      this.roundDots.forEach((d, i) => d.setFillStyle(i < s.round ? 0xffd23d : 0x3a2c78));
    }
    if (ph !== this.lastPhase) { this.onPhase(s); this.lastPhase = ph; }

    // ----- placas
    const sig = `${ph}:${s.shownIdx}:${s.visible ? 1 : 0}`;
    if (ph === 'show' || ph === 'judge') {
      if (s.visible) {
        if (sig !== this.sig) { s.visible.forEach((c, i) => this.setTile(i, c)); if (ph === 'show') { sfx.ledOn(s.shownIdx); this.flashAll(); } }
      } else if (sig !== this.sig) { for (let i = 0; i < TILES; i++) this.setTile(i, null); }
    } else if (sig !== this.sig) {
      for (let i = 0; i < TILES; i++) this.setTile(i, null);
    }
    this.sig = sig;
    if (ph === 'banner') for (let i = 0; i < TILES; i++) this.tiles[i]!.setAlpha(0.8 + 0.2 * Math.sin(t / 300 + i * 0.4));
    else if (ph === 'dark' || ph === 'over') this.tiles.forEach((tl) => tl.setAlpha(1));

    // julgamento: placas certas brilham, as outras apagam um pouco
    const valid = new Set(s.validTiles);
    for (let i = 0; i < TILES; i++) {
      const isJudge = ph === 'judge';
      this.dim[i]!.setVisible(isJudge && !valid.has(i));
      if (isJudge && valid.has(i)) this.tiles[i]!.setAlpha(0.75 + 0.25 * Math.sin(t / 110));
      else if (isJudge) this.tiles[i]!.setAlpha(1);
    }

    // ----- telão
    this.renderTelao(s, t, T);

    // ----- jogadores
    const mine = this.myId;
    let outNow = false;
    for (const P of this.players) {
      const pl = s.players[P.id];
      if (!pl) continue;
      const first = P.dispX < 0;
      P.dispX = first ? pl.x : P.dispX + (pl.x - P.dispX) * 0.45;
      P.dispY = first ? pl.y : P.dispY + (pl.y - P.dispY) * 0.45;
      const px = Math.round(P.dispX), py = Math.round(P.dispY);
      const moving = pl.dx !== 0 || pl.dy !== 0;
      let anim: CharAnim = 'idle';
      if (!pl.alive) anim = 'lose';
      else if (ph === 'judge' && pl.verdict === 'ok') anim = 'celebrate';
      else if (ph === 'over') anim = 'celebrate';
      else if (moving) anim = 'run';
      const info = ANIMS[anim];
      P.sprite.setFrame(FRAME_INDEX[anim] + (info.frames > 1 ? Math.floor((t / 1000) * info.fps) % info.frames : 0));
      if (pl.dx !== 0) P.sprite.setFlipX(pl.dx < 0);
      P.sprite.setPosition(px, py).setDepth(12 + py / 1000);
      P.shadow.setPosition(px, py + 4);
      P.marker.setPosition(px, py - 17 + Math.round(Math.sin(t / 200)));
      this.tags.place(P.id, px, py - 21);
      const tile = tileAt(pl.x, pl.y);
      const showHl = pl.alive && ph !== 'judge' && ph !== 'over' && tile >= 0;
      P.hl.setVisible(showHl);
      if (showHl) P.hl.setPosition(ARENA_X + (tile % COLS) * TILE + TILE / 2, ARENA_Y + Math.floor(tile / COLS) * TILE + TILE / 2);
      // eliminados viram "fantasmas"
      const ghost = !pl.alive;
      P.sprite.setAlpha(ghost ? 0.4 : 1); P.shadow.setAlpha(ghost ? 0.2 : 0.9); P.marker.setVisible(!ghost);
      // painel de status
      P.statusFace.setFrame(pl.alive ? FRAME_INDEX.idle : FRAME_INDEX.lose).setAlpha(pl.alive ? 1 : 0.45);
      P.statusDot.setVisible(pl.alive); P.statusX.setVisible(!pl.alive);

      // veredito: efeitos de sobrevivência e eliminação
      if (pl.verdict !== P.prevVerdict) {
        P.prevVerdict = pl.verdict;
        if (pl.verdict === 'ok') {
          P.icon.setTexture('check').setScale(1.5).setPosition(px, py - 26).setVisible(true).setAlpha(1);
          this.burst(px, py, 0x6dff8a, 8);
          if (P.id === mine) sfx.ready();
          this.scene.tweens.add({ targets: P.icon, y: py - 36, alpha: 0, duration: 1200, onComplete: () => P.icon.setVisible(false) });
        } else if (pl.verdict === 'out') {
          outNow = true;
          P.icon.setTexture('cross').setScale(1.5).setPosition(px, py - 26).setVisible(true).setAlpha(1);
          this.burst(px, py, 0xff5d5d, 10);
          this.scene.tweens.add({ targets: P.sprite, scale: { from: 1.6, to: 1 }, angle: { from: -25, to: 0 }, duration: 350, ease: 'Bounce.easeOut' });
          this.scene.tweens.add({ targets: P.icon, y: py - 36, alpha: 0, duration: 1200, onComplete: () => P.icon.setVisible(false) });
          const tl = tile >= 0 ? this.tiles[tile] : null;
          if (tl) this.scene.tweens.add({ targets: tl, alpha: { from: 0.2, to: 1 }, yoyo: true, repeat: 3, duration: 90 });
        }
      }
    }
    if (outNow) { sfx.hit(); this.scene.cameras.main.shake(180, 0.004); }
  }

  private onPhase(s: LedPublic) {
    if (s.phase === 'dark') sfx.blackout();
    if (s.phase === 'show') this.flashAll(0.5);
  }

  private renderTelao(s: LedPublic, t: number, T: ReturnType<typeof timesFor>) {
    const ph = s.phase;
    const blink = Math.floor(t / 250) % 2 === 0;
    this.bulbs.forEach((b, i) => b.setFillStyle(ph === 'dark' && s.announcedPublic >= 0 ? (blink === (i % 2 === 0) ? 0xff5d5d : 0x5a1d2a) : Math.floor(t / 400 + i) % 3 === 0 ? 0xffd23d : 0x7a5a1a));
    this.lamps.forEach((l, i) => l.setFillStyle(ph === 'show' && s.shownIdx === i && s.visible ? 0xffd23d : ph === 'show' && s.shownIdx > i ? 0x7a6a3a : 0x3a2c78));
    this.swatch.setVisible(false); this.swatchShape.setVisible(false); this.bar.setVisible(false);
    const tint = (n: PixelNumber, c: number) => n.container.list.forEach((o) => { const im = o as Phaser.GameObjects.Image; if (im.tintTopLeft !== 0x1b1030) im.setTint(c); });
    if (ph === 'banner') { this.main.set(`RODADA ${s.round}`); this.sub.set('SO A ULTIMA LUZ VALE'); tint(this.main, 0xffe08a); }
    else if (ph === 'show') {
      const last = s.shownIdx === 2;
      this.main.set(last ? 'ULTIMA LUZ!' : `LUZ ${s.shownIdx + 1}/3`);
      this.sub.set(last ? 'MEMORIZE AS CORES!' : 'IGNORE ESTA');
      tint(this.main, last ? (blink ? 0xffd23d : 0xffffff) : 0x9a97ad);
    } else if (ph === 'dark') {
      if (s.announcedPublic < 0) { this.main.set('APAGOU!'); this.sub.set('PREPARE-SE'); tint(this.main, 0xff5d5d); }
      else {
        const c = s.announcedPublic;
        if (c !== this.lastAnnounced) {
          this.lastAnnounced = c;
          sfx.announce(c);
          this.scene.cameras.main.flash(180, 255, 255, 255);
          this.scene.tweens.add({ targets: [this.swatch, this.swatchShape], scale: { from: 0.2, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        }
        this.swatch.setVisible(true).setFillStyle(COLORS[c]!);
        this.swatchShape.setVisible(true).setTexture(`shape-${c}`);
        this.main.set(COLOR_NAMES[c]!); tint(this.main, COLORS[c]!);
        const secs = Math.ceil(s.moveLeftMs / 1000);
        this.sub.set(`CORRA! ${secs}`); tint(this.sub, secs <= 1 ? 0xff5d5d : 0xffffff);
        if (secs !== this.lastSecond) { this.lastSecond = secs; if (secs <= 3 && secs > 0) sfx.beep(); }
        const ratio = Math.max(0, s.moveLeftMs / T.move);
        this.bar.setVisible(true).setScale(ratio, 1).setFillStyle(ratio > 0.4 ? 0x4ad8ff : 0xff5d5d);
      }
    } else if (ph === 'judge') {
      const ok = Object.values(s.players).filter((p) => p.verdict === 'ok').length;
      const out = Object.values(s.players).filter((p) => p.verdict === 'out').length;
      this.main.set(out === 0 ? 'TODOS SALVOS!' : ok === 0 ? 'NINGUEM SALVO!' : 'FIM DA RODADA'); tint(this.main, ok === 0 ? 0xff5d5d : 0x6dff8a);
      this.sub.set(`${ok} SOBREVIVEU  ${out} CAIU`); tint(this.sub, 0xcdbf95);
    } else {
      const alive = Object.values(s.players).filter((p) => p.alive).length;
      this.main.set(alive === 1 ? 'TEMOS UM VENCEDOR!' : 'EMPATE!'); tint(this.main, 0xffd23d); this.sub.set('FIM DE JOGO'); tint(this.sub, 0xffffff);
    }
  }

  private burst(x: number, y: number, tint: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const sp = this.scene.add.image(x, y, 'spark').setTint(tint).setDepth(45).setScale(2);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 26, alpha: 0, duration: 420, onComplete: () => sp.destroy() });
    }
  }

  destroy() { this.tiles = []; this.players = []; this.bulbs = []; }
}
