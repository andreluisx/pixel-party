import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { AX, AY, C, COLS, DIRS, MAX_ROUNDS, OBSTACLES, PHASE_MS, ROWS, SHOT_SPEED, boundsFor, castRay, insetFor, positionMs, type DuelState } from '@shared/minigames/ultimo-disparo';
import { ANIMS, FRAME_INDEX, type CharAnim } from '../art/characters';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import type { GameView, Pad, RenderCtx } from './GameView';
import { PixelNumber, popup } from './pixelNumber';

const ARENA_W = COLS * C;
const ARENA_H = ROWS * C;
const GREEN = 0x4fd36b;
const RED = 0xff5d5d;

interface PV {
  id: string; slot: number; color: number;
  sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image;
  arrow: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Sprite; kills: PixelNumber; dot: Phaser.GameObjects.Rectangle;
  dx: number; dy: number; lx: number; ly: number; visible: boolean; fell: boolean; aimLast: number;
}

/** Último Disparo: arena de pedra que fecha, jogadores invisíveis, revelação, lasers e projéteis. */
export class DuelView implements GameView {
  private pv: PV[] = [];
  private g!: Phaser.GameObjects.Graphics; // linhas de mira, lasers e rastros
  private bands: Phaser.GameObjects.TileSprite[] = [];
  private warn: Phaser.GameObjects.TileSprite[] = [];
  private bullets = new Map<string, Phaser.GameObjects.Image>();
  private impacted = new Set<string>();
  private reticle!: Phaser.GameObjects.Image;
  private banner!: PixelNumber; private bannerSub!: PixelNumber;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private modePill!: Phaser.GameObjects.Rectangle; private modeText!: PixelNumber; private modeHint!: PixelNumber;
  private roundText!: PixelNumber; private dots: Phaser.GameObjects.Rectangle[] = [];
  private lastPhase = ''; private lastRound = 0; private dispInset = 0; private lastSec = -1; private lastMode = false;

  constructor(private scene: Phaser.Scene, participants: ParticipantInfo[], private myId: string | null) {
    scene.add.rectangle(240, 135, 480, 270, 0x0e0820).setDepth(0);
    scene.add.rectangle(AX + ARENA_W / 2, AY + ARENA_H / 2, ARENA_W + 8, ARENA_H + 8, 0x1b1030).setStrokeStyle(2, 0x4ad8ff).setDepth(1);
    scene.add.tileSprite(AX, AY, ARENA_W, ARENA_H, 'floor-stone').setOrigin(0, 0).setDepth(2);
    // faixas de perigo que fecham a arena (cima, baixo, esquerda, direita) e avisos da próxima rodada
    this.bands = [0, 1, 2, 3].map(() => scene.add.tileSprite(0, 0, 1, 1, 'hazard').setOrigin(0, 0).setDepth(4).setVisible(false));
    this.warn = [0, 1, 2, 3].map(() => scene.add.tileSprite(0, 0, 1, 1, 'hazard').setOrigin(0, 0).setDepth(3).setVisible(false).setAlpha(0.4));
    for (const o of OBSTACLES) scene.add.image(o.x, o.y, 'pillar').setOrigin(0, 0).setDepth(6);
    this.g = scene.add.graphics().setDepth(20);
    this.reticle = scene.add.image(0, 0, 'reticle').setDepth(35).setVisible(false);
    this.timerBar = scene.add.rectangle(AX, AY - 6, ARENA_W, 3, 0x4ad8ff).setOrigin(0, 0.5).setDepth(8).setVisible(false);

    // faixa de mensagens (topo)
    scene.add.rectangle(240, 24, 344, 44, 0x120a2e).setStrokeStyle(3, 0x4ad8ff).setDepth(8);
    this.banner = new PixelNumber(scene, 240, 9, 3, 0xffffff, 9);
    this.bannerSub = new PixelNumber(scene, 240, 30, 2, 0xcdbf95, 9);
    // indicador de modo (embaixo)
    this.modePill = scene.add.rectangle(170, 244, 150, 28, 0x1f5f31).setStrokeStyle(3, 0x1b1030).setDepth(8);
    this.modeText = new PixelNumber(scene, 170, 236, 2, 0xffffff, 9);
    this.modeHint = new PixelNumber(scene, 170, 254, 1, 0xcdbf95, 9);
    // coluna da direita: rodada
    this.roundText = new PixelNumber(scene, 424, 70, 3, 0xffe08a, 8);
    this.dots = Array.from({ length: MAX_ROUNDS }, (_, i) => scene.add.rectangle(424, 100 + i * 14, 9, 9, 0x3a2c78).setDepth(8));

    const sorted = [...participants].sort((a, b) => a.slot - b.slot);
    sorted.forEach((p, i) => {
      const color = num(SLOT_COLORS[p.slot] ?? '#ffffff');
      scene.add.rectangle(54, 70 + i * 46, 92, 40, 0x1a1240).setStrokeStyle(2, color).setDepth(8);
      const face = scene.add.sprite(26, 74 + i * 46, `char-${p.characterId}`, 0).setDepth(9);
      const dot = scene.add.rectangle(88, 58 + i * 46, 6, 6, GREEN).setDepth(9);
      const kills = new PixelNumber(scene, 66, 66 + i * 46, 2, 0xffe08a, 9);
      kills.set('0');
      new PixelNumber(scene, 66, 84 + i * 46, 1, 0xcdbf95, 9).set(p.id === this.myId ? 'VOCE' : 'ABATES');
      const shadow = scene.add.image(0, 0, 'shadow').setDepth(10).setTint(color);
      const sprite = scene.add.sprite(0, 0, `char-${p.characterId}`, 0).setOrigin(0.5, 0.8).setDepth(12).setVisible(false);
      const marker = scene.add.image(0, 0, 'marker').setTint(color).setDepth(30).setVisible(false);
      const arrow = scene.add.image(0, 0, 'arrow').setTint(color).setDepth(34).setVisible(false);
      const icon = scene.add.image(0, 0, 'check').setScale(1.5).setDepth(40).setVisible(false);
      this.pv.push({ id: p.id, slot: p.slot, color, sprite, shadow, marker, arrow, icon, face, kills, dot, dx: 0, dy: 0, lx: 0, ly: 0, visible: false, fell: false, aimLast: -1 });
    });
  }

  setDebug() { /* sem hitboxes */ }
  readInput(pad: Pad) { return { dx: pad.dx, dy: pad.dy, aim: pad.aim }; }

  private setBands(arr: Phaser.GameObjects.TileSprite[], inset: number) {
    const w = inset * C;
    const on = inset > 0.01;
    const rects = [
      [AX, AY, ARENA_W, w], [AX, AY + ARENA_H - w, ARENA_W, w], [AX, AY + w, w, ARENA_H - 2 * w], [AX + ARENA_W - w, AY + w, w, ARENA_H - 2 * w],
    ] as const;
    arr.forEach((b, i) => { const [x, y, ww, hh] = rects[i]!; b.setVisible(on && ww > 0 && hh > 0).setPosition(x, y).setSize(Math.max(1, ww), Math.max(1, hh)); });
  }

  private text(main: string, sub: string, mainColor: number, subColor = 0xcdbf95) { this.banner.set(main); this.banner.setColor(mainColor); this.bannerSub.set(sub); this.bannerSub.setColor(subColor); }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    const s = snap.state as DuelState;
    const t = ctx.time;
    const ph = s.phase;
    const me = this.myId;
    this.g.clear();

    // ---- mudança de rodada / fase
    if (s.round !== this.lastRound) {
      this.lastRound = s.round;
      this.roundText.set(`R${s.round}`);
      this.dots.forEach((d, i) => d.setFillStyle(i < s.round ? 0xffd23d : 0x3a2c78));
      this.impacted.clear();
      for (const b of this.bullets.values()) b.destroy();
      this.bullets.clear();
    }
    if (ph !== this.lastPhase) { this.onPhase(s); this.lastPhase = ph; }

    // ---- arena fechando (anima a borda; o servidor já empurrou quem estava no anel)
    const target = s.inset;
    this.dispInset += (target - this.dispInset) * (ph === 'shrink' ? 0.06 : 0.3);
    if (Math.abs(this.dispInset - target) < 0.01) this.dispInset = target;
    this.setBands(this.bands, this.dispInset);
    const b = boundsFor(this.dispInset);
    this.g.lineStyle(2, 0xff9a3c, 0.9).strokeRect(b.l, b.t, b.r - b.l, b.b - b.t);
    const alive = s.order.filter((id) => s.players[id]!.alive).length;
    const nextInset = ph === 'result' && s.round < MAX_ROUNDS && alive > 1 ? insetFor(s.round + 1) : 0;
    this.setBands(this.warn, nextInset > s.inset ? nextInset : 0);
    this.warn.forEach((w) => w.setAlpha(0.25 + 0.2 * Math.sin(t / 120)));

    // ---- mensagens do topo
    const posLeft = ph === 'position' ? Math.max(0, positionMs(s.round) - s.phaseMs) : 0;
    this.timerBar.setVisible(ph === 'position');
    if (ph === 'position') {
      const ratio = posLeft / positionMs(s.round);
      this.timerBar.setScale(ratio, 1).setFillStyle(ratio > 0.35 ? 0x4ad8ff : RED);
      const sec = Math.ceil(posLeft / 1000);
      if (sec !== this.lastSec) { this.lastSec = sec; if (sec <= 3 && sec > 0) sfx.beep(); }
      this.text('POSICIONE-SE E MIRE!', `ACABA EM ${sec}`, 0xffffff, sec <= 3 ? RED : 0xcdbf95);
    } else if (ph === 'intro') this.text('ULTIMO DISPARO', 'TODOS VAO SUMIR!', 0xffe08a);
    else if (ph === 'shrink') this.text('A ARENA ESTA FECHANDO!', `RODADA ${s.round}`, 0xff9a3c);
    else if (ph === 'reveal') this.text('REVELADOS!', 'MIRAS TRAVADAS', Math.floor(t / 120) % 2 ? 0xffffff : RED);
    else if (ph === 'fire') this.text('FOGO!', '', 0xff5d5d);
    else if (ph === 'result') {
      const n = s.fallen.length;
      this.text(n === 0 ? 'NINGUEM CAIU' : n === 1 ? '1 ELIMINADO' : `${n} ELIMINADOS`, nextInset > s.inset ? 'A ARENA VAI FECHAR' : '', n === 0 ? 0xcdbf95 : RED, 0xff9a3c);
    } else this.text(alive === 1 ? 'TEMOS UM VENCEDOR!' : 'EMPATE!', 'FIM DE JOGO', 0xffd23d, 0xffffff);

    // ---- indicador de modo (do MEU jogador, vindo do servidor)
    const mine = me ? s.players[me] : undefined;
    const aimOn = !!mine?.aimMode;
    if (aimOn !== this.lastMode) { this.lastMode = aimOn; if (ph === 'position') (aimOn ? sfx.modeOn() : sfx.modeOff()); }
    const showMode = ph === 'position' && !!mine?.alive;
    this.modePill.setVisible(showMode).setFillStyle(aimOn ? 0x7a1d1d : 0x1f5f31).setStrokeStyle(3, aimOn ? RED : GREEN);
    this.modeText.container.setVisible(showMode); this.modeHint.container.setVisible(showMode);
    this.modeText.set(aimOn ? 'MIRANDO' : 'MOVENDO'); this.modeText.setColor(aimOn ? 0xffb0b0 : 0xb8ffc8);
    this.modeHint.set(aimOn ? 'PARADO  SETAS = MIRA' : 'SETAS ANDAM  E = MIRAR');

    // ---- jogadores
    for (const P of this.pv) {
      const pl = s.players[P.id];
      if (!pl) continue;
      const isMe = P.id === me;
      const hidden = pl.x < -500; // invisível para mim (o servidor nem envia a posição)
      const wasVisible = P.visible;
      P.visible = !hidden;
      if (hidden && wasVisible) this.vanish(P.lx, P.ly, P.color);
      if (hidden) { P.sprite.setVisible(false); P.shadow.setVisible(false); P.marker.setVisible(false); P.arrow.setVisible(false); this.statusRow(P, pl); continue; }

      const first = P.dx === 0 && P.dy === 0;
      P.dx = first ? pl.x : P.dx + (pl.x - P.dx) * 0.5;
      P.dy = first ? pl.y : P.dy + (pl.y - P.dy) * 0.5;
      P.lx = P.dx; P.ly = P.dy;
      const px = Math.round(P.dx), py = Math.round(P.dy);
      const moving = pl.dx !== 0 || pl.dy !== 0;
      const isGhost = !pl.alive || P.fell;
      let anim: CharAnim = 'idle';
      if (isGhost) anim = 'lose';
      else if (ph === 'over') anim = alive === 1 ? 'celebrate' : 'idle';
      else if (ph === 'result' || ph === 'fire' || ph === 'reveal') anim = 'idle';
      else if (moving) anim = 'run';
      const info = ANIMS[anim];
      P.sprite.setFrame(FRAME_INDEX[anim] + (info.frames > 1 ? Math.floor((t / 1000) * info.fps) % info.frames : 0));
      if (pl.dx !== 0) P.sprite.setFlipX(pl.dx < 0);
      const cloak = ph === 'position' && isMe; // eu me vejo "meio transparente" enquanto estou invisível
      P.sprite.setVisible(true).setPosition(px, py).setDepth(12 + py / 1000).setAlpha(isGhost ? 0.35 : cloak ? 0.5 + 0.15 * Math.sin(t / 150) : 1);
      P.shadow.setVisible(true).setPosition(px, py + 4).setAlpha(isGhost ? 0.15 : cloak ? 0.4 : 0.9);
      P.marker.setVisible(!isGhost && (isMe || ph !== 'position')).setPosition(px, py - 17 + Math.round(Math.sin(t / 200)));
      if (cloak && Math.floor(t / 160) % 2 === 0 && Math.random() < 0.5) { const sp = this.scene.add.image(px + (Math.random() - 0.5) * 14, py + 2, 'spark').setTint(0x4ad8ff).setDepth(31); this.scene.tweens.add({ targets: sp, y: sp.y - 12, alpha: 0, duration: 450, onComplete: () => sp.destroy() }); }

      // seta e linha de mira
      const showAim = pl.alive && !P.fell && pl.aim >= 0 && ((isMe && ph === 'position') || ph === 'reveal' || ph === 'fire');
      P.arrow.setVisible(showAim);
      if (showAim) {
        const [vx, vy] = DIRS[pl.aim]!;
        P.arrow.setPosition(px + vx * 17, py + vy * 17).setAngle(pl.aim * 45 - 90).setScale(isMe && pl.aimMode ? 1.3 : 1);
        if (isMe && pl.aim !== P.aimLast) { P.aimLast = pl.aim; if (ph === 'position') sfx.click(); }
        const r = castRay(s.inset, pl.x, pl.y, pl.aim);
        if (isMe && ph === 'position') this.dashed(px, py, pl.x + vx * r.len, pl.y + vy * r.len, P.color, pl.aimMode ? 0.9 : 0.45);
        else if (ph === 'reveal') { // laser carregando: linha cada vez mais forte
          const k = Math.min(1, s.phaseMs / PHASE_MS.reveal);
          this.g.lineStyle(1 + Math.round(k * 3), P.color, 0.35 + 0.5 * k * (0.6 + 0.4 * Math.sin(t / 60))).lineBetween(px, py, pl.x + vx * r.len, pl.y + vy * r.len);
        }
      }
      if (isMe && ph === 'position' && pl.alive) this.reticle.setVisible(pl.aimMode).setPosition(px, py).setAngle((t / 8) % 360).setTint(P.color);
      else if (isMe) this.reticle.setVisible(false);

      this.statusRow(P, pl);
      // veredito da rodada (ícone)
      if (ph === 'result' && s.phaseMs < 250) {
        if (s.fallen.includes(P.id)) { P.icon.setTexture('cross').setPosition(px, py - 26).setVisible(true).setAlpha(1); this.scene.tweens.add({ targets: P.icon, y: py - 38, alpha: 0, duration: 1300, onComplete: () => P.icon.setVisible(false) }); }
        else if (pl.alive) { P.icon.setTexture('check').setPosition(px, py - 26).setVisible(true).setAlpha(1); this.scene.tweens.add({ targets: P.icon, y: py - 38, alpha: 0, duration: 1300, onComplete: () => P.icon.setVisible(false) }); }
      }
    }

    // ---- disparos: projéteis, rastros e impactos
    if (ph === 'fire') {
      const travel = (SHOT_SPEED * s.phaseMs) / 1000;
      for (const sh of s.shots) {
        const [vx, vy] = DIRS[sh.dir]!;
        const owner = this.pv.find((p) => p.id === sh.owner);
        const color = owner?.color ?? 0xffffff;
        const d = Math.min(sh.len, travel);
        const hx = sh.x0 + vx * d, hy = sh.y0 + vy * d;
        // rastro luminoso
        const tail = Math.max(0, d - 70);
        this.g.lineStyle(3, color, 0.8).lineBetween(sh.x0 + vx * tail, sh.y0 + vy * tail, hx, hy);
        this.g.lineStyle(1, 0xffffff, 0.9).lineBetween(sh.x0 + vx * tail, sh.y0 + vy * tail, hx, hy);
        let bl = this.bullets.get(sh.owner);
        if (!bl) { bl = this.scene.add.image(0, 0, 'bullet').setTint(color).setDepth(36).setScale(1.5); this.bullets.set(sh.owner, bl); }
        bl.setPosition(hx, hy).setVisible(d < sh.len || s.phaseMs < 1500);
        if (d >= sh.len && sh.len > 0 && !this.impacted.has(`${sh.owner}:wall`)) { this.impacted.add(`${sh.owner}:wall`); this.burst(hx, hy, color, 5, 10); }
        for (const h of sh.hits) {
          const key = `${sh.owner}:${h.id}`;
          if (travel >= h.dist && !this.impacted.has(key)) {
            this.impacted.add(key);
            const victim = this.pv.find((p) => p.id === h.id);
            const vp = s.players[h.id]!;
            this.burst(vp.x, vp.y, 0xff5d5d, 14, 26); this.burst(vp.x, vp.y, 0xffe08a, 8, 16);
            if (victim) {
              victim.fell = true;
              this.scene.tweens.add({ targets: victim.sprite, scale: { from: 1.8, to: 1 }, angle: { from: -30, to: 0 }, duration: 380, ease: 'Bounce.easeOut' });
            }
            popup(this.scene, s.players[sh.owner]!.x, s.players[sh.owner]!.y - 18, '+1', 0xffe08a);
            sfx.hit(); if (h.id === me) sfx.fall();
            this.scene.cameras.main.shake(160, 0.005);
          }
        }
      }
    } else if (this.bullets.size) { for (const bl of this.bullets.values()) bl.destroy(); this.bullets.clear(); }
  }

  private statusRow(P: PV, pl: { alive: boolean; kills: number }) {
    P.face.setFrame(pl.alive ? FRAME_INDEX.idle : FRAME_INDEX.lose).setAlpha(pl.alive ? 1 : 0.4);
    P.dot.setFillStyle(pl.alive ? GREEN : RED);
    P.kills.set(String(pl.kills));
  }

  private dashed(x0: number, y0: number, x1: number, y1: number, color: number, alpha: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 4) return;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    this.g.fillStyle(color, alpha);
    for (let d = 20; d < len; d += 7) this.g.fillRect(Math.round(x0 + ux * d) - 1, Math.round(y0 + uy * d) - 1, 2, 2);
    this.g.fillStyle(0xffffff, Math.min(1, alpha + 0.1)).fillRect(Math.round(x1) - 2, Math.round(y1) - 2, 4, 4); // ponto onde o tiro para
  }

  private burst(x: number, y: number, tint: number, n: number, dist: number) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const sp = this.scene.add.image(x, y, 'spark').setTint(tint).setDepth(45).setScale(2);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0, duration: 420, onComplete: () => sp.destroy() });
    }
  }

  private vanish(x: number, y: number, color: number) {
    this.burst(x, y, 0x4ad8ff, 8, 14); this.burst(x, y - 6, color, 6, 10);
    sfx.vanish();
    const ring = this.scene.add.rectangle(x, y, 8, 8).setStrokeStyle(2, 0x4ad8ff).setDepth(45);
    this.scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
  }

  private onPhase(s: DuelState) {
    this.lastSec = -1;
    if (s.phase === 'reveal') {
      sfx.reveal();
      this.scene.cameras.main.flash(260, 255, 255, 255);
      for (const P of this.pv) if (P.visible) this.scene.tweens.add({ targets: P.sprite, scale: { from: 1.8, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    } else if (s.phase === 'fire') { sfx.laser(); this.scene.cameras.main.shake(120, 0.003); }
    else if (s.phase === 'shrink') sfx.blackout();
    else if (s.phase === 'position') { sfx.go(); for (const P of this.pv) P.fell = !s.players[P.id]!.alive; }
  }

  destroy() { this.pv = []; this.bullets.clear(); this.impacted.clear(); }
}
