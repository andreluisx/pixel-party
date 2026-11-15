import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { GROUND, H, HOLE, MAX_LIVES, STATIC_PLATS, W, arrowPath, solveAim, wrapDelta, POINTS_KILL, POINTS_LAST_HIT, BONUS_COINS_LAST_HIT, type Archer, type ArcherState } from '@shared/minigames/duelo-arqueiros';
import { createRng } from '@shared/rng';
import { FRAME_INDEX } from '../art/characters';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import { NameTags } from './nameTags';
import type { GameView, Pad, RenderCtx } from './GameView';
import { PixelNumber, popup } from './pixelNumber';

const CHIP_X = [4, 108, 272, 376];
const ascii = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || '?';

interface PV {
  id: string; slot: number; color: number;
  sprite: Phaser.GameObjects.Sprite; ghost: Phaser.GameObjects.Sprite; bow: Phaser.GameObjects.Image; bowGhost: Phaser.GameObjects.Image;
  shield: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image;
  chipBg: Phaser.GameObjects.Rectangle; face: Phaser.GameObjects.Sprite; hearts: Phaser.GameObjects.Image[];
  spIcon: Phaser.GameObjects.Image; spCount: PixelNumber; shIcon: Phaser.GameObjects.Image; btIcon: Phaser.GameObjects.Image;
  killNum: PixelNumber; hitNum: PixelNumber; ptsNum: PixelNumber; name: string;
  prev: { lives: number; alive: boolean; shield: boolean; special: string | null; bootsMs: number; invuln: number; charges: number; portals: number } | null;
}

/** Duelo de Arqueiros: cenário de plataforma com continuidade horizontal, flechas com gravidade e power-ups. */
export class ArcherView implements GameView {
  private pv: PV[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private clouds!: Phaser.GameObjects.TileSprite;
  private flies: { s: Phaser.GameObjects.Image; x: number; y: number; p: number }[] = [];
  private slotObjs = new Map<number, Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image>();
  private slotPhase = new Map<number, string>();
  private arrowObjs = new Map<number, Phaser.GameObjects.Image>();
  private prevArrows = new Map<number, { x: number; y: number; stuck: boolean; kind: string }>();
  private pickObjs = new Map<number, { icon: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Ellipse }>();
  private torches: Phaser.GameObjects.Image[] = [];
  private timer!: PixelNumber;
  private myState: Archer | null = null; private latest: ArcherState | null = null;
  private lastSec = -1; private lastFlame = 0;
  private lastFeedId = 0; private feedItems: { n: PixelNumber; t0: number; w: number }[] = []; private banner: { n: PixelNumber; n2: PixelNumber } | null = null;

  private tags: NameTags;
  constructor(private scene: Phaser.Scene, participants: ParticipantInfo[], private myId: string | null) {
    this.tags = new NameTags(scene, participants, myId);
    scene.add.image(0, 0, 'archer-bg').setOrigin(0, 0).setDepth(0);
    this.clouds = scene.add.tileSprite(0, 20, W, 30, 'clouds').setOrigin(0, 0).setDepth(1).setAlpha(0.8);
    const rng = createRng(5);
    for (let i = 0; i < 14; i++) this.flies.push({ s: scene.add.image(0, 0, 'spark').setTint(0xffe08a).setDepth(2), x: rng.int(10, 470), y: rng.int(150, 235), p: rng.next() * 7 });
    // chão e plataformas fixas
    // o chão tem um buraco no centro (poço aberto até o fim da tela)
    for (const [gx, gw] of [[0, HOLE.x0], [HOLE.x1, W - HOLE.x1]] as const) {
      scene.add.tileSprite(gx, GROUND, gw, H - GROUND, 'ground').setOrigin(0, 0).setDepth(4);
    }
    scene.add.rectangle(HOLE.x0, GROUND, HOLE.x1 - HOLE.x0, H - GROUND, 0x0a0620).setOrigin(0, 0).setDepth(3);
    const lip = scene.add.graphics().setDepth(5); // bordas do poço
    lip.fillStyle(0x1b1030, 1).fillRect(HOLE.x0 - 1, GROUND, 1, H - GROUND).fillRect(HOLE.x1, GROUND, 1, H - GROUND);
    lip.fillStyle(0x5a3a1f, 1).fillRect(HOLE.x0 - 3, GROUND + 10, 2, H - GROUND - 10).fillRect(HOLE.x1 + 1, GROUND + 10, 2, H - GROUND - 10);
    for (const pl of STATIC_PLATS) scene.add.tileSprite(pl.x, pl.y, pl.w, 16, 'plank').setOrigin(0, 0).setDepth(5);
    this.g = scene.add.graphics().setDepth(40);
    this.timer = new PixelNumber(scene, 240, 6, 3, 0xffffff, 50);

    const sorted = [...participants].sort((a, b) => a.slot - b.slot);
    sorted.forEach((p) => {
      const color = num(SLOT_COLORS[p.slot] ?? '#ffffff');
      const x0 = CHIP_X[p.slot] ?? 4;
      const chipBg = scene.add.rectangle(x0 + 50, 17, 100, 30, 0x1a1240).setStrokeStyle(2, color).setDepth(50);
      const face = scene.add.sprite(x0 + 11, 11, `char-${p.characterId}`, 0).setDepth(51);
      const hearts = [0, 1, 2].map((i) => scene.add.image(x0 + 26 + i * 9, 11, 'heart').setDepth(51));
      const spIcon = scene.add.image(x0 + 63, 11, 'pk-triple').setScale(0.85).setDepth(51).setVisible(false);
      const spCount = new PixelNumber(scene, x0 + 76, 8, 1, 0xffe08a, 51);
      const shIcon = scene.add.image(x0 + 86, 11, 'pk-shield').setScale(0.75).setDepth(51).setVisible(false);
      const btIcon = scene.add.image(x0 + 94, 11, 'boot').setScale(0.7).setDepth(51).setVisible(false);
      // linha de estatísticas: abates, acertos e pontos de destaque
      scene.add.rectangle(x0 + 50, 22, 94, 1, color, 0.5).setDepth(51);
      scene.add.image(x0 + 9, 28, 'ico-skull').setDepth(51);
      const killNum = new PixelNumber(scene, x0 + 22, 25, 2, 0xffffff, 51); killNum.set('0');
      scene.add.image(x0 + 38, 28, 'ico-target').setDepth(51);
      const hitNum = new PixelNumber(scene, x0 + 51, 25, 2, 0xffffff, 51); hitNum.set('0');
      scene.add.sprite(x0 + 68, 28, 'coin', 0).setScale(1).setDepth(51);
      const ptsNum = new PixelNumber(scene, x0 + 84, 25, 2, 0xffe08a, 51); ptsNum.set('0');
      const shadow = scene.add.image(0, 0, 'shadow').setDepth(8);
      const sprite = scene.add.sprite(0, 0, `char-${p.characterId}`, 0).setOrigin(0.5, 0.97).setDepth(12);
      const ghost = scene.add.sprite(0, 0, `char-${p.characterId}`, 0).setOrigin(0.5, 0.97).setDepth(12).setVisible(false);
      const bow = scene.add.image(0, 0, 'bow').setOrigin(0.3, 0.5).setDepth(13);
      const bowGhost = scene.add.image(0, 0, 'bow').setOrigin(0.3, 0.5).setDepth(13).setVisible(false);
      const shield = scene.add.image(0, 0, 'shield-bubble').setDepth(14).setVisible(false);
      const marker = scene.add.image(0, 0, 'marker').setTint(color).setDepth(30);
      this.pv.push({ id: p.id, slot: p.slot, color, sprite, ghost, bow, bowGhost, shield, shadow, marker, chipBg, face, hearts, spIcon, spCount, shIcon, btIcon, killNum, hitNum, ptsNum, name: ascii(p.name), prev: null });
    });
  }

  setDebug() { /* sem hitboxes */ }

  /** Controles → input. Mouse mira e clica; F/botão ATIRAR dispara com mira assistida no inimigo mais próximo. */
  readInput(pad: Pad) {
    const me = this.myState;
    const ptr = this.scene.input.activePointer;
    let aim = me ? (me.facing > 0 ? 0 : Math.PI) : 0;
    let fire = false;
    if (me) {
      const sx = me.x, sy = me.y - 9;
      const px = ptr.x, py = ptr.y; // coordenadas do jogo (480x270)
      if (ptr.isDown || ptr.x !== 0 || ptr.y !== 0) aim = Math.atan2(py - sy, px - sx); // as flechas não atravessam as laterais: mira direta
      if (ptr.isDown) fire = true;
      if (pad.fire) {
        // mira assistida: inimigo mais próximo, com compensação de gravidade
        let best: Archer | null = null, bd = Infinity;
        for (const id of this.latest?.order ?? []) { if (id === this.myId) continue; const o = this.latest!.players[id]!; if (!o.alive) continue; const d = Math.hypot(o.x - me.x, o.y - me.y); if (d < bd) { bd = d; best = o; } }
        if (best && !ptr.isDown) aim = solveAim({ x: sx, y: sy }, { x: best.x, y: best.y - 7 }, me.special === 'fire');
        fire = true;
      }
    }
    return { dx: Math.sign(pad.dx) as -1 | 0 | 1, jump: pad.action || pad.dy < 0, run: pad.run, fire, aim: Math.round(aim * 100) / 100 };
  }

  private heartsOf(P: PV, a: Archer) {
    P.hearts.forEach((h, i) => { h.setTexture(i < a.lives ? 'heart' : 'heart-empty').setAlpha(a.alive || i < 1 ? 1 : 0.4); h.setVisible(i < Math.max(MAX_LIVES, 2)); });
  }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    this.tags.begin(ctx);
    const s = snap.state as ArcherState;
    this.latest = s;
    this.myState = this.myId ? s.players[this.myId] ?? null : null;
    const t = ctx.time;
    this.g.clear();
    this.clouds.tilePositionX = t * 0.006;
    for (const f of this.flies) f.s.setPosition(f.x + Math.sin(t / 900 + f.p) * 14, f.y + Math.cos(t / 700 + f.p) * 8).setAlpha(0.3 + 0.6 * Math.abs(Math.sin(t / 400 + f.p)));

    // ---- buraco: poço com setas descendo e portal brilhando no topo da tela (por onde se reaparece)
    {
      const w = HOLE.x1 - HOLE.x0, pulse = 0.5 + 0.5 * Math.sin(t / 260);
      for (let i = 0; i < 4; i++) { const yy = GROUND + 8 + ((t / 40 + i * 14) % 56) * 0.5; this.g.fillStyle(0x9ad0ff, 0.12 + 0.1 * pulse).fillRect(HOLE.x0 + 6 + i * 14, yy, 6, 1).fillRect(HOLE.x0 + 8 + i * 14, yy + 1, 2, 1); }
      this.g.fillStyle(0x6a4aff, 0.25 + 0.25 * pulse).fillRect(HOLE.x0, H - 3, w, 3);
      this.g.fillStyle(0x9ad0ff, 0.35 + 0.35 * pulse).fillRect(HOLE.x0, 0, w, 2).fillStyle(0xffffff, 0.5 * pulse).fillRect(HOLE.x0 + 4, 0, w - 8, 1);
      for (let i = 0; i < 5; i++) { const xx = HOLE.x0 + 8 + i * 12, yy = 3 + ((t / 70 + i * 3) % 12); this.g.fillStyle(0x9ad0ff, 0.5 - yy * 0.025).fillRect(xx, yy, 3, 1).fillRect(xx + 1, yy + 1, 1, 1); }
    }

    // ---- plataformas e pilares que aparecem e somem
    for (const sl of s.slots) {
      let obj = this.slotObjs.get(sl.id);
      if (!obj) {
        obj = sl.kind === 'plat' ? this.scene.add.tileSprite(sl.x, sl.y, sl.w, 16, 'plank').setOrigin(0, 0).setDepth(5) : this.scene.add.image(sl.x, sl.y, 'column').setOrigin(0, 0).setDepth(5);
        obj.setVisible(false); this.slotObjs.set(sl.id, obj);
        if (sl.kind === 'block') this.torches.push(this.scene.add.image(sl.x + 7, sl.y - 4, 'pk-fire').setScale(0.7).setDepth(6).setVisible(false));
      }
      const prevPhase = this.slotPhase.get(sl.id);
      if (prevPhase !== sl.phase) {
        this.slotPhase.set(sl.id, sl.phase);
        if (sl.phase === 'solid') { this.scene.tweens.add({ targets: obj, scaleY: { from: 0.2, to: 1 }, duration: 220, ease: 'Back.easeOut' }); this.dust(sl.x + sl.w / 2, sl.y + (sl.kind === 'block' ? sl.h : 3), 0x9ad0ff); sfx.tick(); }
        if (sl.phase === 'hidden' && prevPhase) this.dust(sl.x + sl.w / 2, sl.y + sl.h / 2, 0xcdbf95);
      }
      const blink = Math.floor(t / (sl.phase === 'fade' ? 70 : 140)) % 2 === 0;
      obj.setVisible(sl.phase !== 'hidden').setAlpha(sl.phase === 'warn' ? (blink ? 0.55 : 0.2) : sl.phase === 'fade' ? (blink ? 1 : 0.35) : 1).setOrigin(0, 0);
      if (sl.phase === 'warn') this.g.lineStyle(1, 0x9ad0ff, blink ? 0.9 : 0.4).strokeRect(sl.x, sl.y, sl.w, sl.h); // contorno de aviso
      if (sl.kind === 'block') { const tc = this.torches[sl.id - (s.slots.findIndex((x) => x.kind === 'block'))]; if (tc) tc.setVisible(sl.phase === 'solid' || sl.phase === 'fade').setPosition(sl.x + 7, sl.y - 5 + Math.round(Math.sin(t / 90 + sl.id))).setAlpha(0.8 + 0.2 * Math.sin(t / 60)); }
    }

    // ---- itens
    const alivePk = new Set<number>();
    for (const pk of s.pickups) {
      alivePk.add(pk.id);
      let o = this.pickObjs.get(pk.id);
      if (!o) {
        const tex = pk.type === 'life' ? 'heart' : pk.type === 'boots' ? 'boot' : `pk-${pk.type}`;
        const col = { triple: 0xf4efe0, fire: 0xff7a2a, shield: 0x4da3ff, life: 0xff5d5d, boots: 0x4da3ff }[pk.type];
        o = { glow: this.scene.add.ellipse(pk.x, pk.y, 18, 18, col, 0.25).setDepth(6), icon: this.scene.add.image(pk.x, pk.y, tex).setScale(pk.type === 'life' ? 1.6 : 1).setDepth(7) };
        this.pickObjs.set(pk.id, o);
        this.scene.tweens.add({ targets: o.icon, scale: { from: 0.2, to: pk.type === 'life' ? 1.6 : 1 }, duration: 260, ease: 'Back.easeOut' });
      }
      const bob = Math.round(Math.sin(t / 220 + pk.id) * 2);
      o.icon.setPosition(pk.x, pk.y + bob).setAlpha(pk.ttl < 3000 && Math.floor(t / 120) % 2 ? 0.35 : 1);
      o.glow.setPosition(pk.x, pk.y + bob).setScale(1 + 0.25 * Math.sin(t / 160));
    }
    for (const [id, o] of this.pickObjs) if (!alivePk.has(id)) { this.sparkle(o.icon.x, o.icon.y, 0xffe08a, 8); o.icon.destroy(); o.glow.destroy(); this.pickObjs.delete(id); }

    // ---- arqueiros
    const best = Math.max(...s.order.map((id) => s.players[id]!.lives));
    for (const P of this.pv) {
      const a = s.players[P.id];
      if (!a) continue;
      const mine = P.id === this.myId;
      const px = Math.round(a.x), py = Math.round(a.y);
      let anim: 'idle' | 'run' | 'jump' | 'fall' | 'lose' | 'celebrate' = 'idle';
      if (!a.alive) anim = 'lose';
      else if (ctx.phase === 'result') anim = a.lives === best ? 'celebrate' : 'idle';
      else if (!a.grounded) anim = a.vy < 60 ? 'jump' : 'fall';
      else if (a.moving) anim = 'run';
      const frame = FRAME_INDEX[anim] + (anim === 'run' ? Math.floor(t / 90) % 2 : anim === 'idle' ? Math.floor(t / 500) % 2 : anim === 'celebrate' ? Math.floor(t / 200) % 2 : 0);
      const blink = a.invulnMs > 0 && Math.floor(t / 70) % 2 === 0;
      const alpha = !a.alive ? 0.35 : blink ? 0.35 : 1;
      for (const [spr, ox] of [[P.sprite, 0], [P.ghost, a.x < 24 ? W : a.x > W - 24 ? -W : 0]] as const) {
        spr.setFrame(frame).setPosition(px + ox, py).setAlpha(alpha).setFlipX(a.facing < 0).setDepth(12 + a.y / 1000);
      }
      P.sprite.setVisible(true);
      P.ghost.setVisible(a.x < 24 || a.x > W - 24); // cópia do outro lado: mostra a continuidade da tela
      // arco gira para onde o arqueiro mira
      const ang = a.aim;
      const left = Math.cos(ang) < 0;
      for (const [b, ox] of [[P.bow, 0], [P.bowGhost, a.x < 24 ? W : a.x > W - 24 ? -W : 0]] as const) {
        b.setPosition(px + ox + Math.cos(ang) * 6, py - 9 + Math.sin(ang) * 6).setRotation(ang).setFlipY(left).setVisible(a.alive && (ox === 0 || a.x < 24 || a.x > W - 24)).setAlpha(alpha);
      }
      P.shadow.setPosition(px, py + 1).setVisible(a.alive && a.grounded).setAlpha(0.8);
      P.shield.setPosition(px, py - 8).setVisible(a.alive && a.shield).setAlpha(0.7 + 0.3 * Math.sin(t / 100)).setScale(1 + 0.05 * Math.sin(t / 130));
      P.marker.setPosition(px, py - 24 + Math.round(Math.sin(t / 200))).setVisible(a.alive);
      this.tags.place(P.id, px, py - 28, a.alive);

      // pré-visualização da trajetória (só do meu arqueiro)
      if (mine && a.alive && ctx.phase === 'active') {
        const path = arrowPath(a.x, a.y - 9, a.aim, a.special === 'fire', 14, 38);
        path.forEach((p, i) => { this.g.fillStyle(P.color, 0.7 - i * 0.045).fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2); });
        const ptr = this.scene.input.activePointer;
        this.g.lineStyle(1, 0xffffff, 0.8).strokeCircle(ptr.x, ptr.y, 5).lineBetween(ptr.x - 8, ptr.y, ptr.x - 3, ptr.y).lineBetween(ptr.x + 3, ptr.y, ptr.x + 8, ptr.y).lineBetween(ptr.x, ptr.y - 8, ptr.x, ptr.y - 3).lineBetween(ptr.x, ptr.y + 3, ptr.x, ptr.y + 8);
      }

      // placar (vidas, especial, escudo, botas)
      P.chipBg.setAlpha(a.alive ? 1 : 0.45);
      this.heartsOf(P, a);
      P.face.setFrame(a.alive ? FRAME_INDEX.idle : FRAME_INDEX.lose).setAlpha(a.alive ? 1 : 0.5);
      P.spIcon.setVisible(!!a.special).setTexture(a.special === 'fire' ? 'pk-fire' : 'pk-triple');
      P.spCount.container.setVisible(!!a.special); P.spCount.set(a.special ? `${a.charges}` : '');
      P.shIcon.setVisible(a.shield); P.btIcon.setVisible(a.bootsMs > 0);
      P.killNum.set(String(a.kills)); P.hitNum.set(String(a.hitsDealt)); P.ptsNum.set(String(a.points));

      // eventos (diferenças entre o quadro anterior e este)
      const pv = P.prev;
      if (pv) {
        if (a.lives < pv.lives || (!a.alive && pv.alive)) {
          const killed = !a.alive && pv.alive;
          this.burst(pv.alive ? a.x : a.x, a.y - 8, killed ? 0xff5d5d : 0xffb0b0, killed ? 18 : 10, killed ? 34 : 20);
          popup(this.scene, a.x, a.y - 22, '-1', 0xff6b6b);
          sfx.hit(); if (mine || killed) { if (killed) sfx.fall(); }
          this.scene.cameras.main.shake(killed ? 260 : 120, killed ? 0.008 : 0.004);
          if (!killed) this.ring(a.x, a.y - 8, 0xffffff); // reaparecendo
        }
        if (a.portals > pv.portals) { // caiu no buraco: sumiu embaixo, reaparece no topo
          this.burst(a.x, H - 6, 0x9ad0ff, 12, 22); this.burst(a.x, 4, 0xffffff, 14, 24); this.ring(a.x, 6, 0x9ad0ff);
          if (mine) { sfx.vanish(); sfx.shieldUp(); } else sfx.vanish();
        }
        if (pv.shield && !a.shield && a.lives === pv.lives) { this.burst(a.x, a.y - 8, 0x9ad0ff, 12, 20); sfx.shieldUp(); }
        if (!pv.shield && a.shield) { this.ring(a.x, a.y - 8, 0x4da3ff); if (mine) sfx.shieldUp(); }
        if (a.lives > pv.lives && a.alive) { popup(this.scene, a.x, a.y - 22, '+1', 0x6dff8a); this.sparkle(a.x, a.y - 10, 0xff8fa0, 10); if (mine) sfx.powerup(); }
        if (a.special && (a.special !== pv.special || a.charges > pv.charges)) { this.sparkle(a.x, a.y - 10, a.special === 'fire' ? 0xff7a2a : 0xf4efe0, 10); if (mine) sfx.powerup(); }
        if (a.bootsMs > pv.bootsMs + 1000) { this.sparkle(a.x, a.y - 2, 0x4da3ff, 8); if (mine) sfx.powerup(); }
      }
      P.prev = { lives: a.lives, alive: a.alive, shield: a.shield, special: a.special, bootsMs: a.bootsMs, invuln: a.invulnMs, charges: a.charges, portals: a.portals };
    }

    // ---- flechas
    const seen = new Set<number>();
    for (const ar of s.arrows) {
      seen.add(ar.id);
      let img = this.arrowObjs.get(ar.id);
      const owner = this.pv.find((p) => p.id === ar.owner);
      if (!img) {
        img = this.scene.add.image(ar.x, ar.y, ar.kind === 'fire' ? 'arrow-f' : 'arrow-n').setDepth(20);
        this.arrowObjs.set(ar.id, img);
        this.burst(ar.x, ar.y, owner?.color ?? 0xffffff, 3, 8);
        if (ar.owner === this.myId) sfx.arrow(); else if (Math.abs(wrapDelta(ar.x, this.myState?.x ?? 0)) < 200) sfx.arrow();
      }
      const stuck = ar.stuckMs > 0;
      const rot = stuck ? (this.prevArrows.get(ar.id)?.stuck ? img.rotation : Math.atan2(ar.vy || 1, ar.vx || 1)) : Math.atan2(ar.vy, ar.vx);
      img.setPosition(ar.x, ar.y).setRotation(stuck ? img.rotation || rot : rot).setAlpha(stuck ? Math.min(1, ar.stuckMs / 250) : 1);
      if (ar.kind === 'fire' && !stuck && t - this.lastFlame > 28) { this.lastFlame = t; const f = this.scene.add.image(ar.x, ar.y, 'spark').setTint(Math.random() < 0.5 ? 0xff7a2a : 0xffd34d).setDepth(19).setScale(2); this.scene.tweens.add({ targets: f, alpha: 0, y: f.y - 6, duration: 300, onComplete: () => f.destroy() }); }
      if (stuck && !this.prevArrows.get(ar.id)?.stuck) this.burst(ar.x, ar.y, 0xcdbf95, 4, 8);
      this.prevArrows.set(ar.id, { x: ar.x, y: ar.y, stuck, kind: ar.kind });
    }
    for (const [id, img] of this.arrowObjs) if (!seen.has(id)) { this.arrowObjs.delete(id); img.destroy(); this.prevArrows.delete(id); }

    // ---- registro de acertos (quem acertou quem), pontos que sobem e o banner de ÚLTIMO HIT
    const nameOf = (id: string) => this.pv.find((p) => p.id === id)?.name ?? '?';
    const colorOf = (id: string) => this.pv.find((p) => p.id === id)?.color ?? 0xffffff;
    for (const ev of s.feed) {
      if (ev.id <= this.lastFeedId) continue;
      this.lastFeedId = ev.id;
      if (ctx.phase === 'countdown') continue;
      const n = new PixelNumber(this.scene, 0, 0, 2, colorOf(ev.by), 52);
      const txt = `${nameOf(ev.by)} ${ev.kind === 'hit' ? '-' : 'X'} ${nameOf(ev.victim)}`;
      n.set(txt);
      this.feedItems.unshift({ n, t0: t, w: txt.length * 8 });
      const att = s.players[ev.by];
      if (att && ev.kind !== 'hit') popup(this.scene, att.x, att.y - 26, `+${ev.kind === 'kill' ? POINTS_KILL : POINTS_KILL + POINTS_LAST_HIT}`, 0xffe08a, 2);
      if (ev.kind === 'last') this.showLastHit(nameOf(ev.by), colorOf(ev.by));
    }
    this.feedItems = this.feedItems.filter((f, i) => { const age = t - f.t0; if (age > 3800 || i > 3) { f.n.destroy(); return false; } return true; });
    this.feedItems.forEach((f, i) => { const age = t - f.t0; f.n.container.setPosition(4 + f.w / 2, 40 + i * 13).setAlpha(Math.min(1, (3800 - age) / 600)); });

    // ---- tempo
    const sec = Math.ceil(snap.timeLeftMs / 1000);
    this.timer.set(String(sec)); this.timer.setColor(sec <= 10 ? 0xff5d5d : 0xffffff);
    if (sec !== this.lastSec) { this.lastSec = sec; if (sec <= 5 && sec > 0 && ctx.phase === 'active') sfx.beep(); }
  }

  /** Banner grande do golpe que decide a partida (vale pontos de destaque e +1 moeda). */
  private showLastHit(name: string, color: number) {
    if (this.banner) { this.banner.n.destroy(); this.banner.n2.destroy(); }
    const n = new PixelNumber(this.scene, 240, 96, 4, 0xffe08a, 95); n.set('ULTIMO HIT!');
    const n2 = new PixelNumber(this.scene, 240, 124, 2, color, 95); n2.set(`${name} +${BONUS_COINS_LAST_HIT} MOEDA`);
    this.banner = { n, n2 };
    for (const o of [n.container, n2.container]) { o.setScale(0.3); this.scene.tweens.add({ targets: o, scale: 1, duration: 260, ease: 'Back.easeOut' }); this.scene.tweens.add({ targets: o, alpha: 0, delay: 2200, duration: 500 }); }
    this.scene.cameras.main.flash(160, 255, 240, 200); this.scene.cameras.main.shake(300, 0.01);
    sfx.powerup(); sfx.fall();
  }

  private burst(x: number, y: number, tint: number, n: number, dist: number) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = this.scene.add.image(x, y, 'spark').setTint(tint).setDepth(45).setScale(2);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0, duration: 380, onComplete: () => sp.destroy() });
    }
  }
  private sparkle(x: number, y: number, tint: number, n: number) {
    for (let i = 0; i < n; i++) {
      const sp = this.scene.add.image(x + (Math.random() - 0.5) * 12, y, 'spark').setTint(tint).setDepth(45).setScale(2);
      this.scene.tweens.add({ targets: sp, y: y - 14 - Math.random() * 14, alpha: 0, duration: 520, onComplete: () => sp.destroy() });
    }
  }
  private dust(x: number, y: number, tint: number) { this.burst(x, y, tint, 6, 14); }
  private ring(x: number, y: number, color: number) {
    const r = this.scene.add.rectangle(x, y, 8, 8).setStrokeStyle(2, color).setDepth(45);
    this.scene.tweens.add({ targets: r, scale: 3.5, alpha: 0, duration: 420, onComplete: () => r.destroy() });
  }

  destroy() { this.feedItems.forEach((f) => f.n.destroy()); this.feedItems = []; this.banner = null; this.pv = []; this.arrowObjs.clear(); this.pickObjs.clear(); this.slotObjs.clear(); this.torches = []; this.flies = []; }
}
