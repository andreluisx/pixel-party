import { NameTags } from './nameTags';
import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import {
  AIM_MS, BR, CX, CY, FX0, FX1, FY0, FY1, GOAL_H, GOALS_TO_WIN, KEEP_X, PR, TEAM_NAMES, keeperY, type FutebolState, type Piece,
} from '@shared/minigames/futebol-botao';
import { TEAM_COLORS, TEAM_DARK, TEAM_LIGHT } from '../art/futebolArt';
const TEAM_DARK_HEX = TEAM_DARK;
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import type { GameView, Pad, RenderCtx } from './GameView';

const FONT = "'Pixelify Sans', ui-monospace, monospace";
const BTN = { x: 366, y: 235, w: 110, h: 32 };
const BAR = { x: 244, y: 246, w: 112, h: 10 };
const NEUTRAL = { turn: 0 as const, aim: null, snap: 0 as const, charge: false };

interface PieceView { id: string; sprite: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; dx: number; dy: number }

/** Futebol de Botão: campo visto de cima. O servidor manda tudo; aqui só se desenha e se traduz mouse/teclado/toque em input. */
export class FutebolView implements GameView {
  private pieces = new Map<string, PieceView>();
  private ball!: Phaser.GameObjects.Image; private ballShadow!: Phaser.GameObjects.Image;
  private keepers: Phaser.GameObjects.Image[] = [];
  private aimGfx!: Phaser.GameObjects.Graphics; private barGfx!: Phaser.GameObjects.Graphics;
  private ring!: Phaser.GameObjects.Image; private marker!: Phaser.GameObjects.Image;
  private bx = CX; private by = CY; private ballAngle = 0;
  private teamTxt: Phaser.GameObjects.Text[] = []; private nameTxt: Phaser.GameObjects.Text[] = [];
  private boxes: Phaser.GameObjects.Rectangle[] = []; private turnT: Phaser.GameObjects.Text[] = [];
  private scoreTxt!: Phaser.GameObjects.Text; private timeTxt!: Phaser.GameObjects.Text; private turnTxt!: Phaser.GameObjects.Text; private help!: Phaser.GameObjects.Text;
  private btn!: Phaser.GameObjects.Rectangle; private btnTxt!: Phaser.GameObjects.Text;
  private bigTxt!: Phaser.GameObjects.Text; private subTxt!: Phaser.GameObjects.Text;
  private names = new Map<string, string>();
  private tags: NameTags;
  private lastPh = '';
  private lastEv = 0; private lastScore = '0-0'; private lastTurn = -1;
  private btnHeld = false; private dragging = false;
  private mineTurn = false; private myPiece: { x: number; y: number } | null = null;
  private handlers: [string, (...a: never[]) => void][] = [];
  private bannerUntil = 0;

  constructor(private scene: Phaser.Scene, private participants: ParticipantInfo[], private myId: string | null) {
    scene.add.image(0, 0, 'fb-field').setOrigin(0, 0).setDepth(0);
    this.tags = new NameTags(scene, participants, myId);
    for (const p of participants) this.names.set(p.id, p.name.length > 9 ? `${p.name.slice(0, 8)}.` : p.name);

    this.keepers = [0, 1].map((t) => scene.add.image(0, CY, `fb-keeper-${t}`).setDepth(6));
    this.ballShadow = scene.add.image(CX, CY, 'fb-ballshadow').setDepth(7);
    this.ball = scene.add.image(CX, CY, 'fb-ball').setDepth(12);
    this.ring = scene.add.image(0, 0, 'fb-ring').setDepth(8).setVisible(false);
    this.marker = scene.add.image(0, 0, 'marker').setDepth(40).setVisible(false);
    this.aimGfx = scene.add.graphics().setDepth(30);
    this.barGfx = scene.add.graphics().setDepth(60);

    // HUD
    const mk = (x: number, y: number, size: number, color: string, origin: [number, number] = [0.5, 0.5], stroke = 3) =>
      scene.add.text(x, y, '', { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#1b1030', strokeThickness: stroke }).setResolution(2).setOrigin(origin[0], origin[1]).setDepth(70);
    // caixas das duas equipes (a da vez ganha borda brilhante)
    this.boxes = [0, 1].map((t) => {
      const x = t === 0 ? 4 : 480 - 4 - 176;
      const r = scene.add.rectangle(x, 3, 176, 38, 0x1a1240).setOrigin(0, 0).setStrokeStyle(2, num(TEAM_COLORS[t]!)).setDepth(68);
      scene.add.rectangle(t === 0 ? x : x + 172, 3, 4, 38, num(TEAM_COLORS[t]!)).setOrigin(0, 0).setDepth(69);
      return r;
    });
    this.teamTxt = [mk(14, 6, 10, TEAM_LIGHT[0], [0, 0]), mk(466, 6, 10, TEAM_LIGHT[1], [1, 0])];
    this.nameTxt = [mk(14, 19, 8, '#f6ecd2', [0, 0], 2), mk(466, 19, 8, '#f6ecd2', [1, 0], 2)];
    this.turnT = [mk(14, 29, 8, '#ffe08a', [0, 0], 2), mk(466, 29, 8, '#ffe08a', [1, 0], 2)];
    this.scoreTxt = mk(CX, 15, 24, '#ffe08a');
    this.timeTxt = mk(CX, 33, 9, '#f6ecd2', [0.5, 0.5], 2);
    this.turnTxt = mk(CX, 52, 12, '#ffffff', [0.5, 0.5], 4).setDepth(92).setVisible(false);
    this.help = scene.add.text(8, 236, '', { fontFamily: FONT, fontSize: '8px', color: '#f6ecd2', wordWrap: { width: 228 }, lineSpacing: 1 }).setResolution(2).setDepth(70);
    this.bigTxt = scene.add.text(CX, 108, '', { fontFamily: FONT, fontSize: '34px', color: '#ffe08a', stroke: '#1b1030', strokeThickness: 6 }).setResolution(2).setOrigin(0.5).setDepth(95).setVisible(false);
    this.subTxt = scene.add.text(CX, 138, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff', stroke: '#1b1030', strokeThickness: 4 }).setResolution(2).setOrigin(0.5).setDepth(95).setVisible(false);

    // botão FORÇA: segurar carrega, soltar lança (serve para mouse e toque)
    this.btn = scene.add.rectangle(BTN.x + BTN.w / 2, BTN.y + BTN.h / 2, BTN.w, BTN.h, 0x2a1f5c).setStrokeStyle(2, 0xffe08a).setDepth(70).setInteractive({ useHandCursor: true });
    this.btnTxt = mk(BTN.x + BTN.w / 2, BTN.y + BTN.h / 2, 13, '#ffe08a');
    this.btnTxt.setText('FORÇA');
    this.btn.on('pointerdown', () => { this.btnHeld = true; });
    this.btn.on('pointerup', () => { this.btnHeld = false; });
    this.btn.on('pointerout', () => { this.btnHeld = false; });

    // mouse/toque no campo: aponta da peça para o ponteiro
    scene.input.addPointer(1);
    const down = (p: Phaser.Input.Pointer) => { if (p.y > FY0 - 6 && p.y < FY1 + 6) this.dragging = true; };
    const up = () => { this.dragging = false; this.btnHeld = false; };
    scene.input.on('pointerdown', down);
    scene.input.on('pointerup', up);
    scene.input.on('gameout', up);
    this.handlers = [['pointerdown', down as never], ['pointerup', up as never], ['gameout', up as never]];
  }

  setDebug() { /* sem hitboxes aqui */ }

  readInput(pad: Pad) {
    if (!this.mineTurn) return NEUTRAL;
    let aim: number | null = null;
    if (this.dragging && this.myPiece) {
      const p = this.scene.input.activePointer;
      if (Math.hypot(p.worldX - this.myPiece.x, p.worldY - this.myPiece.y) > 4) aim = Math.atan2(p.worldY - this.myPiece.y, p.worldX - this.myPiece.x);
    }
    return { turn: Math.sign(pad.dx) as -1 | 0 | 1, aim, snap: (pad.dy < 0 ? 1 : pad.dy > 0 ? 2 : 0) as 0 | 1 | 2, charge: pad.action || this.btnHeld };
  }

  private ensurePieces(st: FutebolState) {
    if (this.pieces.size) return;
    const bySlot = new Map(this.participants.map((p) => [p.id, p]));
    for (const p of st.pieces) {
      const info = bySlot.get(p.id);
      const shadow = this.scene.add.image(p.x, p.y + 2, 'fb-shadow').setDepth(9);
      const sprite = this.scene.add.image(p.x, p.y, `fb-piece-${p.team}`).setDepth(10);
      const color = SLOT_COLORS[info?.slot ?? 0] ?? '#ffffff';
      // ponto com a cor do jogador no centro (para saber quem é quem no lobby)
      void color;
      this.pieces.set(p.id, { id: p.id, sprite, shadow, dx: p.x, dy: p.y });
    }
    const tn = (t: 0 | 1) => st.members[t].map((id) => this.names.get(id) ?? '').join(' + ');
    this.teamTxt[0]!.setText(TEAM_NAMES[0]); this.teamTxt[1]!.setText(TEAM_NAMES[1]);
    this.nameTxt[0]!.setText(tn(0)); this.nameTxt[1]!.setText(tn(1));
  }

  private burst(x: number, y: number, tint: number, n: number, spread: number) {
    for (let i = 0; i < n; i++) {
      const sp = this.scene.add.image(x, y, 'fb-spark').setTint(tint).setDepth(50);
      const a = Math.random() * Math.PI * 2, d = spread * (0.4 + Math.random() * 0.6);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 300 + Math.random() * 250, onComplete: () => sp.destroy() });
    }
  }

  private float(text: string, x: number, y: number, color: string, size = 10) {
    const t = this.scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#1b1030', strokeThickness: 4 }).setResolution(2).setOrigin(0.5).setDepth(90);
    this.scene.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 900, delay: 200, onComplete: () => t.destroy() });
  }

  private goalShow(st: FutebolState, time: number) {
    const g = st.lastGoal;
    if (!g) return;
    const col = TEAM_COLORS[g.team];
    this.bigTxt.setText('GOL!').setColor(col).setVisible(true).setScale(0.3).setAlpha(1);
    this.scene.tweens.add({ targets: this.bigTxt, scale: 1, duration: 260, ease: 'Back.easeOut' });
    const won = st.score[g.team] >= GOALS_TO_WIN;
    if (won) this.bigTxt.setText('VITÓRIA!');
    this.subTxt.setText(won ? `${TEAM_NAMES[g.team]} fez ${GOALS_TO_WIN} gols e venceu!` : g.scorer ? `${this.names.get(g.scorer) ?? ''} marcou para o ${TEAM_NAMES[g.team]}!` : `Gol contra! Ponto do ${TEAM_NAMES[g.team]}`).setVisible(true);
    const gx = g.team === 0 ? FX1 : FX0;
    for (let i = 0; i < 46; i++) {
      const tint = [0xffe08a, num(col), 0xffffff, 0x4fd36b][i % 4]!;
      const sp = this.scene.add.image(gx, CY, 'fb-spark').setTint(tint).setDepth(96).setScale(1.5);
      const a = (g.team === 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.4, d = 60 + Math.random() * 110;
      this.scene.tweens.add({ targets: sp, x: gx + Math.cos(a) * d, y: CY + Math.sin(a) * d + 24, alpha: 0, duration: 700 + Math.random() * 500, ease: 'Cubic.easeOut', onComplete: () => sp.destroy() });
    }
    this.scene.cameras.main.shake(260, 0.008);
    this.scene.cameras.main.flash(180, 255, 240, 200);
    sfx.fanfare();
    void time;
  }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    const st = snap.state as FutebolState;
    this.ensurePieces(st);
    const t = ctx.time;
    this.tags.begin(ctx);
    if (this.lastPh === 'goal' && st.phase !== 'goal' && st.phase !== 'over') this.tags.restart();
    this.lastPh = st.phase;
    const cur = st.pieces.find((p) => p.id === st.cur) as Piece | undefined;
    const mineTurn = !!this.myId && st.cur === this.myId && st.phase === 'aim' && ctx.phase === 'active';
    this.mineTurn = mineTurn;

    // peças (suaviza entre snapshots; teleporte vai direto)
    for (const p of st.pieces) {
      const v = this.pieces.get(p.id)!;
      if (Math.hypot(p.x - v.dx, p.y - v.dy) > 50) { v.dx = p.x; v.dy = p.y; } else { v.dx += (p.x - v.dx) * 0.55; v.dy += (p.y - v.dy) * 0.55; }
      v.sprite.setPosition(Math.round(v.dx), Math.round(v.dy));
      v.shadow.setPosition(Math.round(v.dx), Math.round(v.dy) + 2);
      this.tags.place(p.id, Math.round(v.dx), Math.round(v.dy) - PR - 3);
      if (p.id === this.myId) this.myPiece = { x: v.dx, y: v.dy };
    }
    // bola
    const b = st.ball;
    const nbx = Math.hypot(b.x - this.bx, b.y - this.by) > 70 ? b.x : this.bx + (b.x - this.bx) * 0.6;
    const nby = Math.hypot(b.x - this.bx, b.y - this.by) > 70 ? b.y : this.by + (b.y - this.by) * 0.6;
    this.ballAngle += (Math.hypot(nbx - this.bx, nby - this.by) / BR) * Math.sign(nbx - this.bx || 1);
    this.bx = nbx; this.by = nby;
    this.ball.setPosition(Math.round(this.bx), Math.round(this.by)).setRotation(this.ballAngle);
    this.ballShadow.setPosition(Math.round(this.bx), Math.round(this.by) + 2);
    // goleiros (gol da esquerda = time azul)
    this.keepers.forEach((k, side) => {
      const x = side === 0 ? FX0 + KEEP_X : FX1 - KEEP_X;
      k.setPosition(x, Math.round(keeperY(st.keepT, side as 0 | 1)));
    });

    // seta de direção e força
    this.aimGfx.clear();
    this.barGfx.clear();
    const showAim = st.phase === 'aim' && !!cur && ctx.phase === 'active';
    if (showAim && cur) {
      const v = this.pieces.get(cur.id)!;
      const px = v.dx, py = v.dy;
      const power = st.charging ? st.power : 0;
      const len = 30 + power * 92;
      const cx = Math.cos(st.aim), cy = Math.sin(st.aim);
      const col = power < 0.5 ? mix(0x4fd36b, 0xffd34d, power * 2) : mix(0xffd34d, 0xff4d4d, (power - 0.5) * 2);
      // guia pontilhada longa (para onde a peça vai)
      this.aimGfx.fillStyle(0xffffff, 0.35);
      for (let d = len + 8; d < len + 130; d += 8) this.aimGfx.fillRect(Math.round(px + cx * d), Math.round(py + cy * d), 2, 2);
      // corpo da seta (traços) e ponta
      const start = PR + 3;
      for (let d = start; d < len; d += 5) this.aimGfx.fillStyle(col, 1).fillRect(Math.round(px + cx * d) - 1, Math.round(py + cy * d) - 1, 3, 3);
      const hx = px + cx * len, hy = py + cy * len;
      const nx = -cy, ny = cx;
      this.aimGfx.fillStyle(0x1b1030, 1).fillTriangle(hx + cx * 9 + 0, hy + cy * 9, hx + nx * 6.5, hy + ny * 6.5, hx - nx * 6.5, hy - ny * 6.5);
      this.aimGfx.fillStyle(col, 1).fillTriangle(hx + cx * 7, hy + cy * 7, hx + nx * 4.5, hy + ny * 4.5, hx - nx * 4.5, hy - ny * 4.5);
      this.ring.setVisible(true).setPosition(Math.round(px), Math.round(py)).setTint(num(TEAM_COLORS[st.teams[cur.id]!]!)).setScale(1 + Math.sin(t / 150) * 0.08);
      this.marker.setVisible(true).setPosition(Math.round(px), Math.round(py) - PR - 12 + Math.round(Math.sin(t / 160) * 2)).setTint(num(TEAM_COLORS[st.teams[cur.id]!]!));
    } else { this.ring.setVisible(false); this.marker.setVisible(false); }

    // barra de força (todos veem a barra de quem está jogando)
    const active = showAim;
    this.barGfx.fillStyle(0x120a2e, 1).fillRect(BAR.x - 2, BAR.y - 2, BAR.w + 4, BAR.h + 4);
    this.barGfx.lineStyle(1, active ? 0xffe08a : 0x3a2c78, 1).strokeRect(BAR.x - 2.5, BAR.y - 2.5, BAR.w + 5, BAR.h + 5);
    if (active) {
      const pw = st.charging ? st.power : 0;
      const segs = 24;
      for (let i = 0; i < segs; i++) {
        const f = (i + 1) / segs;
        if (f <= pw + 0.001) {
          const c = f < 0.5 ? mix(0x4fd36b, 0xffd34d, f * 2) : mix(0xffd34d, 0xff4d4d, (f - 0.5) * 2);
          this.barGfx.fillStyle(c, 1).fillRect(BAR.x + i * (BAR.w / segs), BAR.y, BAR.w / segs - 1, BAR.h);
        }
      }
    }
    this.btn.setAlpha(mineTurn ? 1 : 0.35).setFillStyle(this.btnHeld && mineTurn ? 0x6a3fb5 : 0x2a1f5c);
    this.btnTxt.setAlpha(mineTurn ? 1 : 0.4);

    // placar, tempo, vez
    this.scoreTxt.setText(`${st.score[0]}  -  ${st.score[1]}`);
    const secs = Math.ceil(snap.timeLeftMs / 1000);
    this.timeTxt.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · 1º a ${GOALS_TO_WIN}`);
    const key = `${st.score[0]}-${st.score[1]}`;
    if (key !== this.lastScore) { this.scene.tweens.add({ targets: this.scoreTxt, scale: { from: 1.5, to: 1 }, duration: 350, ease: 'Back.easeOut' }); this.lastScore = key; }
    const teamOfCur = cur ? st.teams[cur.id]! : 0;
    const aimingNow = st.phase === 'aim' && !!cur;
    for (const tm of [0, 1] as const) {
      const on = aimingNow && teamOfCur === tm;
      this.boxes[tm]!.setStrokeStyle(on ? 3 : 1, on ? 0xffe08a : num(TEAM_COLORS[tm]!)).setFillStyle(on ? 0x2a1f5c : 0x1a1240);
      this.turnT[tm]!.setText(on ? (mineTurn ? '▶ SUA VEZ!' : `▶ Vez de ${this.names.get(cur!.id) ?? ''}`) : '').setAlpha(mineTurn ? 0.7 + Math.sin(t / 120) * 0.3 : 1);
    }
    if (aimingNow && cur) {
      const nm = this.names.get(cur.id) ?? '';
      // tempo da jogada: barrinha na caixa da equipe da vez
      const f = Math.max(0, 1 - st.phaseMs / AIM_MS);
      const bx0 = teamOfCur === 0 ? 14 : 480 - 4 - 176 + 6;
      this.barGfx.fillStyle(0x120a2e, 1).fillRect(bx0, 38, 158, 3);
      this.barGfx.fillStyle(f < 0.25 ? 0xff4d4d : num(TEAM_COLORS[teamOfCur]!), 1).fillRect(bx0, 38, Math.round(158 * f), 3);
      this.help.setText(mineTurn
        ? 'Aponte: mouse, ← →, ↑ bola, ↓ gol. SEGURE Espaço ou FORÇA e solte no ponto certo!'
        : `${nm} está mirando. Aguarde a sua vez.`);
      if (mineTurn && st.turnNo !== this.lastTurn) { this.bannerUntil = t + 900; }
      this.lastTurn = st.turnNo;
      this.turnTxt.setVisible(mineTurn && t < this.bannerUntil).setText('SUA VEZ!').setScale(1 + Math.sin(t / 90) * 0.08);
    } else {
      this.turnTxt.setVisible(false);
      this.help.setText(st.phase === 'roll' ? 'Bola rolando...' : '');
    }

    // eventos de som/efeito (cada um uma vez)
    for (const e of st.events) {
      if (e.n <= this.lastEv) continue;
      this.lastEv = e.n;
      if (e.kind === 'kick') { this.burst(e.x, e.y, 0xffffff, 6, 16); sfx.jump(); }
      else if (e.kind === 'hit') { if (e.v > 30) { this.burst(e.x, e.y, 0xffe08a, 5, 12); sfx.hitNote(Math.min(6, Math.floor(e.v / 100))); } }
      else if (e.kind === 'bump') { if (e.v > 30) { this.burst(e.x, e.y, 0xffffff, 3, 8); sfx.tick(); } }
      else if (e.kind === 'wall') { if (e.v > 60) sfx.tick(); }
      else if (e.kind === 'post') { this.burst(e.x, e.y, 0xffffff, 6, 12); sfx.click(); this.float('TRAVE!', e.x + (e.x < CX ? 22 : -22), e.y, '#ffffff', 9); }
      else if (e.kind === 'save') { this.burst(e.x, e.y, 0xffd23f, 8, 14); sfx.shieldUp(); if (e.v > 80) this.float('DEFENDEU!', e.x + (e.x < CX ? 28 : -28), e.y - 6, '#ffd23f', 9); }
      else if (e.kind === 'goal') this.goalShow(st, t);
      else if (e.kind === 'start') { this.bigTxt.setVisible(false); this.subTxt.setVisible(false); if (this.myId && st.cur === this.myId && st.turnNo > 1) sfx.ready(); }
    }
    if (st.phase === 'goal') { this.bigTxt.setAlpha(Math.min(1, 1.2 - st.phaseMs / 2600)); }
    void GOAL_H; void FY1;
  }

  destroy() {
    for (const [ev, fn] of this.handlers) this.scene.input.off(ev, fn as never);
    this.handlers = [];
  }
}

function mix(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}
