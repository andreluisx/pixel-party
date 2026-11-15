import type Phaser from 'phaser';
import type { GameUpdate, PublicGame } from '@shared/protocol';
import type { GEvent } from '@shared/game/engine';
import { REINO_DO_CASTELO } from '@shared/board/maps/reino-do-castelo';
import type { TileType } from '@shared/board/types';
import { SLOT_COLORS } from '@shared/types';
import type { BridgeClient } from '@/net/bridge';
import { ICON_COL, ICON_MAPS } from '@/components/PixelIcon';
import { sfx } from '../audio/sfx';
import { settingsStore } from '../settings';
import { canvasTex } from '../art/textures';
import { BOARD_FX, BOARD_H as H, BOARD_W as W, K, TILE_INFO } from '../art/boardArt';

/**
 * Tabuleiro cinematográfico. Enquanto está na tela o jogo roda em 960x540 (o dobro do resto) e o mundo é o mapa × K.
 * Só desenha o que o servidor decidiu; entradas viram pedidos (rolar, escolher caminho, comprar).
 */
const WORLD = { w: REINO_DO_CASTELO.world.w * K, h: REINO_DO_CASTELO.world.h * K };
const TILES = REINO_DO_CASTELO.tiles.map((t) => ({ ...t, x: t.x * K, y: t.y * K }));
const TILE = Object.fromEntries(TILES.map((t) => [t.id, t]));
const FONT = "'Pixelify Sans', ui-monospace, 'Courier New', monospace";
const hex = (s: string) => parseInt(s.slice(1), 16);
const OFFS: Record<number, number[]> = { 1: [0], 2: [-11, 11], 3: [-17, 0, 17], 4: [-22, -7.5, 7.5, 22] };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ADD = 1; // Phaser.BlendModes.ADD
const SPR = 2; // personagens 16x22 ampliados 2x (pixels do mesmo tamanho dos outros elementos)
const ITEM_NAMES: Record<string, string> = { dado: 'Dado Especial', ima: 'Ímã', pocao: 'Poção', escudo: 'Escudo', cogumelo: 'Cogumelo' };

interface Token { pid: string; slot: number; sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; flag: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; bubble: Phaser.GameObjects.Text; tile: string; busy: number; px: number; py: number; lift: number }
interface Chip { c: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Rectangle; face: Phaser.GameObjects.Sprite; coinTxt: Phaser.GameObjects.Text; starTxt: Phaser.GameObjects.Text; items: Phaser.GameObjects.Container; coinIcon: Phaser.GameObjects.Image; cw: number; shown: number; target: number; hold: number; lastStars: number; lastItems: string; slot: number }

export class BoardView {
  private tokens = new Map<string, Token>();
  private chips = new Map<string, Chip>();
  private tileImgs = new Map<string, Phaser.GameObjects.Image>();
  private game: PublicGame;
  private active = '';
  private star!: Phaser.GameObjects.Image;
  private starGlow!: Phaser.GameObjects.Image;
  private starBeam!: Phaser.GameObjects.Image;
  private picks: Phaser.GameObjects.GameObject[] = [];
  private picksKey = '';
  private dice!: Phaser.GameObjects.Sprite;
  private diceShadow!: Phaser.GameObjects.Ellipse;
  private diceBusy = false;
  private plaque!: Phaser.GameObjects.Container;
  private plaqueNum!: Phaser.GameObjects.Text;
  private diceHome = { x: 0, y: 0 };
  private hudObjs: Phaser.GameObjects.GameObject[] = [];
  private roundBar!: Phaser.GameObjects.Graphics;
  private roundTxt!: Phaser.GameObjects.Text;
  private bannerRoot!: Phaser.GameObjects.Container;
  private noteBanners: Phaser.GameObjects.Container[] = [];
  private mainBanner: Phaser.GameObjects.Container | null = null;
  private tip: Phaser.GameObjects.Container | null = null;
  private tipTimer?: Phaser.Time.TimerEvent;
  private legend: Phaser.GameObjects.Container | null = null;
  private starPtr!: Phaser.GameObjects.Container;
  private keyHandler: (ev: KeyboardEvent) => void;
  private resizeHandler = () => { /* o HUD recalcula sozinho no render */ };
  private cam: Phaser.Cameras.Scene2D.Camera;
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private dynKey = '';
  private u = 1;
  private focus: { x: number; y: number; until: number } | null = null;
  private lastU = 0;
  private frame = 0;
  private cloudShadows: Phaser.GameObjects.Image[] = [];
  private alive = true;
  private titleC: Phaser.GameObjects.Container | null = null;

  constructor(private scene: Phaser.Scene, private client: BridgeClient) {
    this.cam = scene.cameras.main;
    scene.scale.setGameSize(W, H);
    this.cam.setSize(W, H); this.cam.removeBounds();
    this.ensureIcons();
    const pend = client.drainGame?.() ?? [];
    const last = pend[pend.length - 1] ?? client.state.game;
    this.game = last!.game;
    this.active = this.game.order[this.game.turn] ?? '';

    scene.add.image(0, 0, 'bd-bg').setOrigin(0, 0).setDepth(0);
    this.ambient();
    // casas
    for (const t of TILES) {
      const img = scene.add.image(t.x, t.y + 4, `bd-tile-${t.type}`).setOrigin(0.5, 30 / 72).setDepth(5);
      this.tileImgs.set(t.id, img);
      this.tileIdle(t.type, t.x, t.y);
    }
    // zonas (toque/mouse): escolher caminho ou ver o que a casa faz
    for (const t of TILES) {
      const z = scene.add.zone(t.x, t.y, 64, 56).setInteractive({ useHandCursor: true }).setDepth(50);
      z.on('pointerdown', (p: Phaser.Input.Pointer) => {
        const aw = this.client.state.game?.waiting;
        if (aw?.kind === 'fork' && aw.pid === this.client.state.you && aw.choices.includes(t.id)) { sfx.select(); this.client.choose?.(t.id); }
        else if (p.wasTouch) this.showTip(t.id, 2800);
      });
      z.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.showTip(t.id); });
      z.on('pointerout', () => this.hideTip());
    }
    // estrela: flutua, brilha e tem um feixe de luz visível de longe
    const st = TILE[this.game.starTile]!;
    this.starBeam = scene.add.image(st.x, st.y - 8, 'bd-beam').setOrigin(0.5, 1).setDepth(39).setBlendMode(ADD).setAlpha(0.35).setTint(0xffe08a).setScale(1.3, 1.1);
    this.starGlow = scene.add.image(st.x, st.y - 26, 'bd-glow').setDepth(38).setBlendMode(ADD).setTint(0xffd45a).setScale(1.1).setAlpha(0.7);
    this.star = scene.add.image(st.x, st.y - 34, 'bd-star').setDepth(40).setScale(1.25);
    if (!this.reduce()) {
      scene.tweens.add({ targets: this.star, y: '-=7', duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      scene.tweens.add({ targets: this.starGlow, scale: 1.5, alpha: 0.35, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      scene.tweens.add({ targets: this.starBeam, alpha: 0.15, duration: 1100, yoyo: true, repeat: -1 });
    }
    // peões
    for (const p of this.game.players) {
      const t = TILE[p.tile]!;
      const glow = scene.add.image(t.x, t.y, 'bd-glow').setTint(hex(SLOT_COLORS[p.slot]!)).setBlendMode(ADD).setScale(0.7, 0.32).setDepth(8).setAlpha(0);
      const shadow = scene.add.image(t.x, t.y, 'shadow').setScale(3).setDepth(9);
      const sprite = scene.add.sprite(t.x, t.y, `char-${p.characterId}`, 0).setOrigin(0.5, 0.88).setScale(SPR);
      const flag = scene.add.image(t.x, t.y - 56, 'marker').setTint(hex(SLOT_COLORS[p.slot]!)).setScale(3).setDepth(60);
      const bubble = scene.add.text(t.x, t.y - 80, '', { fontFamily: FONT, fontSize: '22px', color: '#ffe08a', fontStyle: 'bold', stroke: '#1b1030', strokeThickness: 5 }).setOrigin(0.5).setDepth(61).setResolution(2);
      this.tokens.set(p.id, { pid: p.id, slot: p.slot, sprite, shadow, flag, glow, bubble, tile: p.tile, busy: 0, px: t.x, py: t.y, lift: 0 });
    }
    this.restack(true);
    // vinheta e HUD (fixos na tela)
    scene.add.image(0, 0, 'bd-vig-h').setOrigin(0, 0).setScrollFactor(0).setDepth(95);
    scene.add.image(0, H, 'bd-vig-h').setOrigin(0, 0).setFlipY(true).setScrollFactor(0).setDepth(95).setY(H - 90);
    scene.add.image(0, 0, 'bd-vig-v').setOrigin(0, 0).setScrollFactor(0).setDepth(95);
    scene.add.image(W - 90, 0, 'bd-vig-v').setOrigin(0, 0).setFlipX(true).setScrollFactor(0).setDepth(95);
    this.bannerRoot = scene.add.container(W / 2, 0).setScrollFactor(0).setDepth(110);
    this.buildHud();
    this.syncDynamic();
    // teclado
    this.keyHandler = (ev) => this.onKey(ev);
    scene.input.keyboard!.on('keydown', this.keyHandler);
    scene.input.keyboard!.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    scene.scale.on('resize', this.resizeHandler);
    const t0 = TILE[this.tokens.get(this.active)?.tile ?? 'R00']!;
    this.cam.setScroll(this.cx(t0.x - W / 2), this.cy(t0.y - H / 2 - 20));
    // abertura: pequena varredura pelo castelo se for o começo da partida
    if (!this.reduce() && this.game.round === 1 && this.game.turn === 0 && this.game.phase !== 'final') this.cam.setScroll(this.cx(800 - W / 2), this.cy(160 - H / 2));
    if (last) this.handle(last.events);
  }

  /** "Reduzir animações": sem balanços, passos e dado mais curtos. */
  private reduce() { return settingsStore.get().reduceMotion; }
  private cx = (x: number) => clamp(x, -40, WORLD.w - W + 40);
  private cy = (y: number) => clamp(y, -30, WORLD.h - H + 30);
  private toScreen(wx: number, wy: number) { return { x: wx - this.cam.scrollX, y: wy - this.cam.scrollY }; }

  private ensureIcons() {
    for (const [name, rows] of Object.entries(ICON_MAPS)) {
      canvasTex(this.scene, `ico-${name}`, 8, 8, (ctx) => {
        (rows as readonly string[]).forEach((row, y) => { for (let x = 0; x < 8; x++) { const c = row[x]; if (!c || c === '.') continue; ctx.fillStyle = ICON_COL[c as keyof typeof ICON_COL] ?? '#fff'; ctx.fillRect(x, y, 1, 1); } });
      });
    }
  }

  private txt(x: number, y: number, s: string, size: number, color = '#f6ecd2', stroke = 4) {
    return this.scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#1b1030', strokeThickness: stroke }).setResolution(2);
  }

  // ---------------------------------------------------------------- ambiente
  private tileIdle(type: TileType, x: number, y: number) {
    if (this.reduce()) return;
    const glowCol: Partial<Record<TileType, number>> = { teleport: 0x55e8ff, treasure: 0xffd45a, star: 0xffd45a, shop: 0xffa040, event: 0x6aff9a, minigame: 0xb490ff, duel: 0xff5a7a };
    const gc = glowCol[type]; if (gc === undefined) return;
    const g = this.scene.add.image(x, y - 2, 'bd-glow').setTint(gc).setBlendMode(ADD).setScale(0.8).setAlpha(0.18).setDepth(4);
    this.scene.tweens.add({ targets: g, alpha: 0.45, scale: 1.05, duration: 900 + Math.random() * 600, yoyo: true, repeat: -1, delay: Math.random() * 1000, ease: 'Sine.easeInOut' });
  }

  /** Nuvens passando, brilhos no mar e nas flores, bandeiras do castelo, tochas, vaga-lumes e pássaros. */
  private ambient() {
    if (this.reduce()) return;
    const s = this.scene;
    // sombras de nuvem
    for (let i = 0; i < 3; i++) {
      const c = s.add.image(-300, 200 + i * 360, 'bd-cloudshadow').setDepth(3).setAlpha(0.14).setScale(2 + i * 0.3, 2);
      this.cloudShadows.push(c);
      s.tweens.add({ targets: c, x: WORLD.w + 300, duration: 70000 + i * 18000, repeat: -1, delay: -i * 24000, ease: 'Linear' });
    }
    // brilhos na água (mar ao redor da ilha)
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * WORLD.w, y = Math.random() * WORLD.h;
      if (((x - WORLD.w / 2) / 780) ** 2 + ((y - WORLD.h / 2) / 550) ** 2 < 1) continue;
      const sp = s.add.image(x, y, 'bd-spark').setDepth(2).setAlpha(0).setScale(0.6 + Math.random() * 0.6).setBlendMode(ADD);
      s.tweens.add({ targets: sp, alpha: { from: 0, to: 0.8 }, duration: 600 + Math.random() * 600, yoyo: true, repeat: -1, delay: Math.random() * 3000, repeatDelay: Math.random() * 2500 });
    }
    // brilhos em flores e copas
    for (const p of BOARD_FX.sparkles.slice(0, 28)) {
      const sp = s.add.image(p.x + (Math.random() - 0.5) * 20, p.y, 'bd-spark').setDepth(4).setAlpha(0).setScale(0.5).setBlendMode(ADD);
      s.tweens.add({ targets: sp, alpha: { from: 0, to: 0.9 }, duration: 500, yoyo: true, repeat: -1, delay: Math.random() * 4000, repeatDelay: 1500 + Math.random() * 3000 });
    }
    // bandeiras e tochas
    for (const f of BOARD_FX.flags) {
      const tri = s.add.triangle(f.x + 12, f.y + 8, 0, 0, 26, 8, 0, 16, hex(f.c)).setDepth(3);
      s.tweens.add({ targets: tri, scaleX: 0.7, skewX: 0, duration: 500 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    for (const t of BOARD_FX.torches) {
      const g = s.add.image(t.x, t.y, 'bd-glow').setTint(0xff9a3a).setBlendMode(ADD).setScale(0.9).setDepth(4).setAlpha(0.55);
      s.tweens.add({ targets: g, alpha: 0.25, scale: 0.7, duration: 140 + Math.random() * 120, yoyo: true, repeat: -1 });
    }
    // vaga-lumes
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * WORLD.w, y = 200 + Math.random() * (WORLD.h - 300);
      const f = s.add.rectangle(x, y, 3, 3, i % 3 === 0 ? 0xfff3a8 : 0xb8ffb0, 0).setDepth(4).setBlendMode(ADD);
      s.tweens.add({ targets: f, alpha: { from: 0, to: 0.9 }, duration: 900 + Math.random() * 900, yoyo: true, repeat: -1, delay: Math.random() * 2000 });
      s.tweens.add({ targets: f, x: x + (Math.random() - 0.5) * 80, y: y - 10 - Math.random() * 36, duration: 2600 + Math.random() * 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // pássaros cruzando de tempos em tempos
    const flock = () => {
      if (!this.alive) return;
      const y = 120 + Math.random() * (WORLD.h - 300), dir = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        const b = this.scene.add.sprite(dir > 0 ? -60 - i * 40 : WORLD.w + 60 + i * 40, y + i * 22 + (i % 2) * 14, 'bd-bird', 0).setDepth(70).setScale(2).setFlipX(dir < 0);
        const ev = this.scene.time.addEvent({ delay: 220 + i * 30, loop: true, callback: () => { if (b.active) b.setFrame(Number(b.frame.name) === 0 ? 1 : 0); } });
        this.scene.tweens.add({ targets: b, x: dir > 0 ? WORLD.w + 100 : -100, y: y - 60 + i * 12, duration: 16000, onComplete: () => { ev.remove(); b.destroy(); } });
      }
      this.scene.time.delayedCall(16000 + Math.random() * 14000, flock);
    };
    this.scene.time.delayedCall(4000, flock);
  }

  // ---------------------------------------------------------------- HUD
  private uiScale() { return clamp(this.scene.scale.displayScale.x / 1.2, 1, 2.2); }
  private bannerY = 94;

  private buildHud() {
    const s = this.scene;
    this.hudObjs.forEach((o) => o.destroy()); this.hudObjs = []; this.chips.clear();
    this.u = this.uiScale(); this.lastU = this.u;
    const u = this.u, LW = W / u;
    this.bannerRoot.setScale(u);
    // ---- cartões dos jogadores (topo)
    const ps = this.game.players;
    const cw = Math.floor((LW - 10 - 3 * 5) / 4), compact = cw < 130, ch = compact ? 58 : 44;
    this.bannerY = 5 + ch + 4 + 20 + 8;
    const top = s.add.container(0, 0).setScrollFactor(0).setDepth(100).setScale(u);
    this.hudObjs.push(top);
    ps.forEach((p, i) => {
      const x = 5 + i * (cw + 5), y = 5, col = hex(SLOT_COLORS[p.slot]!);
      const c = s.add.container(x, y);
      const sh = s.add.rectangle(2, 3, cw, ch, 0x0a0420, 0.5).setOrigin(0, 0);
      const bg = s.add.rectangle(0, 0, cw, ch, 0x1b1030, 0.92).setOrigin(0, 0).setStrokeStyle(2, col);
      const band = s.add.rectangle(0, 0, cw, 4, col).setOrigin(0, 0);
      const pw = compact ? 32 : 36, ph = compact ? 44 : 33;
      const portrait = s.add.rectangle(4, 7, pw, ph, 0x2e2060, 1).setOrigin(0, 0).setStrokeStyle(1, 0x5a48a0);
      const face = s.add.sprite(4 + pw / 2, 8, `char-${p.characterId}`, 0).setOrigin(0.5, 0).setScale(2).setCrop(0, 0, 18, compact ? 21 : 15);
      const nx = 4 + pw + 6;
      const name = this.txt(nx, 5, p.name.toUpperCase().slice(0, compact ? 7 : 9), 11, '#f6ecd2', 3);
      const cy = compact ? 28 : 24, sy = compact ? 46 : 24;
      const coinIcon = s.add.image(nx, cy, 'bd-coin').setOrigin(0, 0.5).setScale(0.6);
      const coinTxt = this.txt(nx + 15, cy - 7, '0', 15, '#ffe08a', 4);
      const starIcon = s.add.image(compact ? nx : cw - 46, sy, 'bd-star').setOrigin(0, 0.5).setScale(0.5);
      const starTxt = this.txt((compact ? nx : cw - 46) + 17, sy - 7, '0', 15, '#ffffff', 4);
      const items = s.add.container(4, ch + 4);
      c.add([sh, bg, band, portrait, face, name, coinIcon, coinTxt, starIcon, starTxt, items]);
      top.add(c);
      const prev = this.chipPrev.get(p.id);
      this.chips.set(p.id, { c, bg, face, coinTxt, starTxt, items, coinIcon, cw, shown: prev ?? p.coins, target: p.coins, hold: 0, lastStars: -1, lastItems: '', slot: p.slot });
    });
    // ---- rodada (canto inferior esquerdo) + botão de legenda
    const bl = s.add.container(0, H).setScrollFactor(0).setDepth(100).setScale(u);
    this.hudObjs.push(bl);
    const pillBg = s.add.rectangle(6, -44, 156, 38, 0x1b1030, 0.92).setOrigin(0, 0).setStrokeStyle(2, 0xffd45a);
    this.roundTxt = this.txt(14, -41, '', 14, '#ffe08a', 4);
    this.roundBar = s.add.graphics();
    const help = s.add.rectangle(168, -44, 38, 38, 0x1b1030, 0.92).setOrigin(0, 0).setStrokeStyle(2, 0xffd45a).setInteractive({ useHandCursor: true });
    const helpTxt = this.txt(187, -25, '?', 22, '#ffe08a', 4).setOrigin(0.5);
    help.on('pointerdown', () => { sfx.click(); this.toggleLegend(); });
    help.on('pointerover', () => helpTxt.setColor('#ffffff'));
    help.on('pointerout', () => helpTxt.setColor('#ffe08a'));
    bl.add([pillBg, this.roundTxt, this.roundBar, help, helpTxt]);
    // ---- placa do dado (canto inferior direito)
    const br = s.add.container(W, H).setScrollFactor(0).setDepth(100).setScale(u);
    this.hudObjs.push(br);
    this.plaque = br;
    const pBg = s.add.rectangle(-124, -96, 118, 90, 0x1b1030, 0.92).setOrigin(0, 0).setStrokeStyle(2, 0xffd45a);
    const pLab = this.txt(-65, -92, 'PASSOS', 10, '#c9b8ff', 3).setOrigin(0.5, 0);
    this.plaqueNum = this.txt(-34, -52, '', 34, '#ffe08a', 6).setOrigin(0.5);
    br.add([pBg, pLab, this.plaqueNum]);
    br.setVisible(false);
    this.diceHome = { x: (W - 92 * u), y: (H - 52 * u) };
    if (!this.dice) {
      this.diceShadow = s.add.ellipse(W / 2, H / 2 + 60, 80, 18, 0x000000, 0.35).setScrollFactor(0).setDepth(119).setVisible(false);
      this.dice = s.add.sprite(this.diceHome.x, this.diceHome.y, 'bd-dice', 0).setScrollFactor(0).setDepth(120).setVisible(false).setScale(0.8 * u);
    } else if (!this.diceBusy) this.dice.setPosition(this.diceHome.x, this.diceHome.y).setScale(0.8 * u);
    // ---- ponteiro da estrela fora da tela
    this.starPtr = s.add.container(0, 0).setScrollFactor(0).setDepth(102).setVisible(false);
    const arrow = s.add.image(0, 0, 'bd-arrow').setScale(1.1).setTint(0xffd45a);
    const sIcon = s.add.image(0, -22, 'bd-star').setScale(0.9);
    this.starPtr.add([arrow, sIcon]);
    this.hudObjs.push(this.starPtr);
    this.chipPrev.clear();
    this.refreshHud();
  }
  private chipPrev = new Map<string, number>();

  private refreshHud() {
    const g = this.game;
    for (const p of g.players) {
      const ch = this.chips.get(p.id); if (!ch) continue;
      ch.target = p.coins;
      if (ch.lastStars !== p.stars) { if (ch.lastStars >= 0 && p.stars > ch.lastStars) this.pop(ch.starTxt); ch.starTxt.setText(String(p.stars)); ch.lastStars = p.stars; }
      const itemsKey = p.items.join(',');
      if (ch.lastItems !== itemsKey) {
        ch.items.removeAll(true);
        p.items.forEach((it, i) => {
          const bg = this.scene.add.rectangle(i * 22, 0, 20, 20, 0x1b1030, 0.9).setOrigin(0, 0).setStrokeStyle(1, hex(SLOT_COLORS[p.slot]!));
          const ic = this.scene.add.image(i * 22 + 2, 2, `ico-${it}`).setOrigin(0, 0).setScale(2);
          ch.items.add([bg, ic]);
        });
        if (ch.lastItems && itemsKey.length > ch.lastItems.length) this.pop(ch.items);
        ch.lastItems = itemsKey;
      }
      const on = p.id === this.active && g.phase !== 'minigame' && g.phase !== 'final';
      ch.bg.setFillStyle(on ? 0x4a3a8a : 0x1b1030, 0.94);
      ch.bg.setStrokeStyle(on ? 3 : 2, on ? 0xffe08a : hex(SLOT_COLORS[p.slot]!));
      ch.c.setY(on && !this.reduce() ? 2 : 5);
    }
    this.roundTxt.setText(`RODADA ${g.round}/${g.totalRounds}`);
    this.roundBar.clear();
    const n = g.totalRounds, bw = Math.floor(138 / n) - 2;
    for (let i = 0; i < n; i++) {
      const done = i < g.round - 1, cur = i === g.round - 1;
      this.roundBar.fillStyle(done ? 0xffd45a : cur ? 0xffffff : 0x4a3a8a, 1).fillRect(14 + i * (bw + 2), -17, bw, 6);
    }
  }

  private pop(t: Phaser.GameObjects.GameObject) {
    if (this.reduce()) return;
    this.scene.tweens.add({ targets: t, scale: { from: 1.5, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  // ---------------------------------------------------------------- tooltip e legenda
  private showTip(tileId: string, ms = 0) {
    const t = TILE[tileId]; if (!t) return;
    this.hideTip();
    const info = TILE_INFO[t.type];
    const s = this.scene, u = this.u;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(130).setScale(u);
    const lw = 270, extra: string[] = [];
    if (tileId === this.game.starTile) extra.push('★ A estrela está aqui agora!');
    if (this.game.secretStar?.tile === tileId) extra.push('★ Estrela secreta (12 moedas)');
    if (this.game.bonusTiles[tileId]) extra.push(`Brilho: +${this.game.bonusTiles[tileId]} moedas`);
    if (this.game.blocked.includes(tileId)) extra.push('Casa bloqueada nesta rodada');
    const desc = this.txt(54, 26, info.desc, 12, '#e8e0ff', 3).setWordWrapWidth(lw - 62);
    const ex = extra.length ? this.txt(54, 26 + desc.height + 4, extra.join('\n'), 12, '#ffe08a', 3).setWordWrapWidth(lw - 62) : null;
    const h = Math.max(54, 32 + desc.height + (ex ? ex.height + 6 : 0));
    const bg = s.add.rectangle(0, 0, lw, h, 0x1b1030, 0.96).setOrigin(0, 0).setStrokeStyle(3, hex(info.fill));
    const med = s.add.image(27, h / 2 - 2, `bd-tile-${t.type}`).setOrigin(0.5, 30 / 72).setScale(0.62);
    const nm = this.txt(54, 5, info.name.toUpperCase(), 14, info.fill, 4);
    c.add([bg, med, nm, desc]); if (ex) c.add(ex);
    const sp = this.toScreen(t.x, t.y);
    const px = clamp(sp.x - (lw * u) / 2, 6, W - lw * u - 6);
    const py = sp.y < 200 ? sp.y + 46 : sp.y - 48 - h * u;
    c.setPosition(px, clamp(py, 70, H - h * u - 6));
    this.tip = c;
    if (ms) this.tipTimer = s.time.delayedCall(ms, () => this.hideTip());
  }
  private hideTip() { this.tipTimer?.remove(); this.tip?.destroy(); this.tip = null; }

  private toggleLegend() {
    if (this.legend) { this.legend.destroy(); this.legend = null; return; }
    const s = this.scene, ph = 290, u = Math.min(this.u, (H - 12) / ph), LW = W / u, LH = H / u;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(140).setScale(u);
    const pw = Math.min(LW - 16, 600);
    const x0 = (LW - pw) / 2, y0 = Math.max(4, (LH - ph) / 2);
    const bg = s.add.rectangle(x0, y0, pw, ph, 0x120a2c, 0.97).setOrigin(0, 0).setStrokeStyle(3, 0xffd45a).setInteractive();
    bg.on('pointerdown', () => this.toggleLegend());
    c.add(bg);
    c.add(this.txt(x0 + pw / 2, y0 + 8, 'O QUE TEM EM CADA CASA', 16, '#ffe08a', 4).setOrigin(0.5, 0));
    const order: TileType[] = ['blue', 'red', 'event', 'minigame', 'shop', 'star', 'duel', 'teleport', 'treasure', 'trap'];
    const colW = pw / 2;
    order.forEach((type, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = x0 + 8 + col * colW, y = y0 + 34 + row * 47;
      const info = TILE_INFO[type];
      c.add(s.add.image(x + 22, y + 22, `bd-tile-${type}`).setOrigin(0.5, 30 / 72).setScale(0.6));
      c.add(this.txt(x + 50, y + 2, info.name.toUpperCase(), 12, info.fill, 3));
      c.add(this.txt(x + 50, y + 18, info.desc, 10, '#e8e0ff', 2).setWordWrapWidth(colW - 64));
    });
    c.add(this.txt(x0 + pw / 2, y0 + ph - 18, 'Toque para fechar · tecla L', 10, '#9a88d0', 2).setOrigin(0.5, 0));
    this.legend = c;
  }

  // ---------------------------------------------------------------- faixas e títulos
  private slideIn(c: Phaser.GameObjects.Container, y: number) {
    c.setY(this.reduce() ? y : y - 60).setAlpha(this.reduce() ? 1 : 0);
    if (!this.reduce()) this.scene.tweens.add({ targets: c, y, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  }
  private slideOut(c: Phaser.GameObjects.Container, after: number, done?: () => void) {
    this.scene.time.delayedCall(after, () => {
      if (!c.active) return;
      this.scene.tweens.add({ targets: c, alpha: 0, y: c.y - 24, duration: this.reduce() ? 80 : 240, onComplete: () => { c.destroy(); done?.(); } });
    });
  }

  /** Faixa principal: o que a casa em que o peão parou faz. */
  private tileBanner(pid: string, type: TileType, msg: string) {
    const p = this.game.players.find((x) => x.id === pid);
    const info = TILE_INFO[type], s = this.scene;
    this.mainBanner?.destroy();
    const c = s.add.container(0, 0);
    const w = 420, h = 66;
    const bg = s.add.rectangle(-w / 2, 0, w, h, 0x1b1030, 0.96).setOrigin(0, 0).setStrokeStyle(3, hex(info.fill));
    const accent = s.add.rectangle(-w / 2, 0, 90, h, hex(info.edge), 1).setOrigin(0, 0);
    const med = s.add.image(-w / 2 + 45, h / 2 - 2, `bd-tile-${type}`).setOrigin(0.5, 30 / 72).setScale(0.92);
    const title = this.txt(-w / 2 + 102, 7, info.name.toUpperCase(), 12, info.fill, 3);
    const body = this.txt(-w / 2 + 102, 24, msg, 20, '#ffffff', 5).setWordWrapWidth(w - 112);
    c.add([bg, accent, med, title, body]);
    if (p) c.add(this.txt(w / 2 - 8, 7, p.name.toUpperCase().slice(0, 10), 12, SLOT_COLORS[p.slot]!, 3).setOrigin(1, 0));
    this.bannerRoot.add(c);
    this.mainBanner = c;
    this.slideIn(c, this.bannerY);
    this.slideOut(c, 1050, () => { if (this.mainBanner === c) this.mainBanner = null; });
    if (!this.reduce()) s.tweens.add({ targets: med, scale: { from: 1.25, to: 0.92 }, duration: 380, ease: 'Back.easeOut' });
  }

  private noteBanner(msg: string, tone: 'good' | 'bad' | 'info') {
    const s = this.scene;
    const col = tone === 'good' ? 0x6fe08a : tone === 'bad' ? 0xff7a7a : 0xffd45a;
    const t = this.txt(0, 0, msg, 16, '#ffffff', 4).setOrigin(0.5).setWordWrapWidth(Math.min(560, W / this.u - 40));
    const w = t.width + 36, h = t.height + 14;
    const c = s.add.container(0, 0);
    const bg = s.add.rectangle(0, 0, w, h, 0x1b1030, 0.95).setStrokeStyle(2, col);
    const dot = s.add.rectangle(-w / 2 + 8, 0, 4, h - 10, col);
    c.add([bg, dot, t]);
    this.bannerRoot.add(c);
    this.noteBanners.push(c);
    this.layoutNotes();
    c.setAlpha(0);
    s.tweens.add({ targets: c, alpha: 1, duration: 180 });
    this.scene.time.delayedCall(2300, () => {
      if (!c.active) return;
      s.tweens.add({ targets: c, alpha: 0, duration: 260, onComplete: () => { this.noteBanners = this.noteBanners.filter((x) => x !== c); c.destroy(); this.layoutNotes(); } });
    });
    while (this.noteBanners.length > 3) { const o = this.noteBanners.shift()!; o.destroy(); }
  }
  private layoutNotes() {
    const base = this.bannerY + (this.mainBanner ? 92 : 24);
    this.noteBanners.forEach((c, i) => this.scene.tweens.add({ targets: c, y: base + i * 38, duration: 160 }));
  }

  /** Título grande no meio da tela (rodada, minigame, estrela). */
  private titleCard(text: string, sub: string, color: string, hold = 1500, size = 46) {
    const s = this.scene, u = this.u;
    this.titleC?.destroy();
    const c = s.add.container(W / 2, H / 2 - 10).setScrollFactor(0).setDepth(125).setScale(u);
    this.titleC = c;
    const rays = s.add.image(0, 0, 'bd-rays').setTint(hex(color)).setBlendMode(ADD).setAlpha(0.5).setScale(1.2);
    const shade = s.add.rectangle(0, 0, W / u + 40, 120, 0x120a2c, 0.62);
    const t1 = this.txt(0, sub ? -18 : 0, text, size, color, 8).setOrigin(0.5);
    const t2 = sub ? this.txt(0, 26, sub, 18, '#ffffff', 5).setOrigin(0.5) : null;
    c.add([rays, shade, t1]); if (t2) c.add(t2);
    if (this.reduce()) { c.setAlpha(1); } else {
      c.setScale(u * 0.4).setAlpha(0);
      s.tweens.add({ targets: c, scale: u, alpha: 1, duration: 320, ease: 'Back.easeOut' });
      s.tweens.add({ targets: rays, angle: 90, duration: hold + 600 });
      s.tweens.add({ targets: shade, scaleY: { from: 0.2, to: 1 }, duration: 260 });
    }
    s.time.delayedCall(hold, () => { if (c.active) s.tweens.add({ targets: c, alpha: 0, scale: u * 1.15, duration: 280, onComplete: () => c.destroy() }); });
  }

  // ---------------------------------------------------------------- eventos
  private handle(events: GEvent[]) {
    for (const e of events) {
      switch (e.t) {
        case 'turn': this.onTurn(e.pid); break;
        case 'dice': this.rollDice(e.pid, e.value); break;
        case 'step': this.hop(e.pid, e.to, e.remaining); break;
        case 'fork': break;
        case 'coins': this.coinsFx(e.pid, e.delta); break;
        case 'teleport': this.teleport(e.pid, e.to); break;
        case 'back': this.slide(e.pid, e.to); break;
        case 'starBuy': this.starBuyFx(e.pid, e.from, e.to); break;
        case 'starOffer': sfx.powerup(); this.noteTip('starOffer', e.pid); break;
        case 'item': { sfx.powerup(); const tk = this.tokens.get(e.pid); if (tk) this.itemFx(tk, e.item); break; }
        case 'tile': this.onTile(e.pid, e.tile, e.type as TileType, e.msg); break;
        case 'note': if (e.tone === 'bad') sfx.hit(); else if (e.big) sfx.announce(3); this.noteBanner(e.msg, e.tone ?? 'info'); break;
        case 'minigame': this.titleCard(e.context === 'tile' ? 'MINIGAME EXTRA!' : 'HORA DO MINIGAME!', '', '#c9a8ff', 1300, 38); this.cam.flash(260, 150, 110, 255); break;
        case 'roundStart': this.onRoundStart(e.round, e.final); break;
        default: break;
      }
    }
  }
  private noteTip(_k: string, pid: string) { const tk = this.tokens.get(pid); if (tk) this.burst(tk.px, tk.py - 40, [0xffe08a, 0xffffff], 10, 60); }

  private onTurn(pid: string) {
    this.active = pid;
    this.hideDice(); this.plaqueNum.setText('');
    const tk = this.tokens.get(pid); const p = this.game.players.find((x) => x.id === pid);
    if (tk) { for (const o of this.tokens.values()) o.bubble.setText(''); if (!this.reduce()) { this.focusOn(tk.px, tk.py, 1400); this.spot(tk); } }
    if (p && this.game.phase !== 'final') this.turnTag(p.name, SLOT_COLORS[p.slot]!);
  }
  private turnTag(name: string, color: string) {
    if (this.mainBanner) return;
    const s = this.scene;
    const t = this.txt(0, 0, `VEZ DE ${name.toUpperCase().slice(0, 12)}`, 18, '#ffffff', 5).setOrigin(0.5);
    const c = s.add.container(0, 0);
    const bg = s.add.rectangle(0, 0, t.width + 40, t.height + 12, 0x1b1030, 0.95).setStrokeStyle(3, hex(color));
    c.add([bg, t]); this.bannerRoot.add(c);
    this.slideIn(c, this.bannerY); this.slideOut(c, 520);
  }
  /** Facho de luz no peão da vez. */
  private spot(tk: Token) {
    const r = this.scene.add.image(tk.px, tk.py + 4, 'bd-ring').setTint(hex(SLOT_COLORS[tk.slot]!)).setBlendMode(ADD).setDepth(8).setScale(0.3, 0.15);
    this.scene.tweens.add({ targets: r, scaleX: 1.1, scaleY: 0.55, alpha: 0, duration: 650, onComplete: () => r.destroy() });
  }
  private focusOn(x: number, y: number, ms: number) { this.focus = { x, y, until: this.scene.time.now + ms }; }

  private onRoundStart(round: number, final: boolean) {
    this.hideDice(); this.plaqueNum.setText('');
    sfx.announce(round);
    this.titleCard(final ? 'GRANDE FINAL!' : `RODADA ${round}`, final ? 'Última rodada: tudo pode virar!' : `de ${this.game.totalRounds}`, final ? '#ffd45a' : '#ffffff', 1800, final ? 52 : 46);
    if (!this.reduce()) { this.focusOn(800, 220, 1200); this.cam.flash(300, 255, 220, 150); }
  }

  private onTile(pid: string, tile: string, type: TileType, msg: string) {
    const tk = this.tokens.get(pid);
    this.tileBanner(pid, type, msg);
    if (tk) { tk.bubble.setText(''); this.landFx(tk, tile, type); }
    if (type === 'shop') sfx.shopOpen(); else if (type === 'duel') sfx.duel(); else if (type === 'trap') sfx.stolen();
    else if (type === 'treasure') sfx.bigCoin(); else if (type === 'event') sfx.powerup();
  }

  // ---------------------------------------------------------------- efeitos
  private puff(x: number, y: number, n = 4, tint = 0xf2dca4) {
    if (this.reduce()) return;
    for (let i = 0; i < n; i++) {
      const p = this.scene.add.image(x + (i - n / 2) * 8, y, 'bd-puff').setDepth(12).setTint(tint).setScale(0.5).setAlpha(0.7);
      this.scene.tweens.add({ targets: p, x: p.x + (i - n / 2) * 16, y: y - 8 - Math.random() * 10, scale: 1.3, alpha: 0, duration: 420, onComplete: () => p.destroy() });
    }
  }
  private burst(x: number, y: number, colors: number[], n: number, power: number, depth = 80, up = 0.5) {
    if (this.reduce()) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = power * (0.4 + Math.random() * 0.8);
      const sp = this.scene.add.image(x, y, i % 3 === 0 ? 'bd-spark' : 'bd-dot').setTint(colors[i % colors.length]!).setDepth(depth).setScale(0.6 + Math.random() * 0.9).setBlendMode(ADD);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - power * up, alpha: 0, angle: Math.random() * 180, duration: 500 + Math.random() * 400, ease: 'Cubic.easeOut', onComplete: () => sp.destroy() });
    }
  }
  private ring(x: number, y: number, color: number, size = 1.1, ms = 600, flat = 0.5) {
    const r = this.scene.add.image(x, y, 'bd-ring').setTint(color).setBlendMode(ADD).setDepth(10).setScale(0.2, 0.2 * flat);
    this.scene.tweens.add({ targets: r, scaleX: size, scaleY: size * flat, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  private landFx(tk: Token, tile: string, type: TileType) {
    const t = TILE[tile]!, info = TILE_INFO[type], col = hex(info.fill), img = this.tileImgs.get(tile);
    if (img && !this.reduce()) this.scene.tweens.add({ targets: img, y: img.y + 5, scaleY: 0.94, duration: 90, yoyo: true, ease: 'Sine.easeOut' });
    this.ring(t.x, t.y + 6, col, 1.5, 700);
    this.ring(t.x, t.y + 6, 0xffffff, 0.9, 480);
    switch (type) {
      case 'blue': this.burst(tk.px, tk.py - 20, [0x6aa8ff, 0xffffff, 0xffe08a], 16, 70); break;
      case 'red': this.burst(tk.px, tk.py - 10, [0xff5a5a, 0x7a1020, 0x3a0a14], 16, 60, 80, 0.1); this.shake(180, 0.004); break;
      case 'treasure': this.burst(tk.px, tk.py - 24, [0xffd45a, 0xfff2b0, 0xffffff], 30, 110); this.cam.flash(200, 255, 230, 140); break;
      case 'trap': this.burst(tk.px, tk.py - 6, [0x9a9ab0, 0x5a5a70, 0xffffff], 16, 70, 80, 0.1); this.shake(260, 0.006); break;
      case 'star': this.burst(tk.px, tk.py - 30, [0xffd45a, 0xffffff], 22, 90); break;
      case 'teleport': this.burst(tk.px, tk.py - 20, [0x55e8ff, 0xffffff, 0xb8f8ff], 20, 80); break;
      case 'event': this.burst(tk.px, tk.py - 24, [0x6aff9a, 0xffffff, 0xd8ffb0], 22, 90); break;
      case 'minigame': this.burst(tk.px, tk.py - 24, [0xb490ff, 0xffffff, 0xe0c8ff], 20, 80); break;
      case 'shop': this.burst(tk.px, tk.py - 24, [0xffa040, 0xffd45a, 0xffffff], 18, 80); break;
      case 'duel': this.burst(tk.px, tk.py - 20, [0xff5a7a, 0xffffff, 0xffd0d8], 20, 90); this.cam.flash(160, 255, 90, 120); break;
    }
  }

  private shake(ms: number, power: number) { if (!this.reduce()) this.cam.shake(ms, power); }

  private coinsFx(pid: string, delta: number) {
    const tk = this.tokens.get(pid), chip = this.chips.get(pid); if (!tk || !chip) return;
    const gain = delta > 0;
    chip.hold = this.scene.time.now + (this.reduce() ? 200 : 750);
    gain ? sfx.coin() : sfx.hit();
    // número que sobe
    const t = this.txt(tk.px, tk.py - 70, `${gain ? '+' : '-'}${Math.abs(delta)}`, 30, gain ? '#ffe08a' : '#ff8080', 7).setOrigin(0.5).setDepth(92);
    const ic = this.scene.add.image(tk.px + t.width / 2 + 14, tk.py - 70, 'bd-coin').setDepth(92).setScale(0.9);
    this.scene.tweens.add({ targets: [t, ic], y: '-=40', alpha: 0, duration: 1000, delay: 250, ease: 'Cubic.easeOut', onComplete: () => { t.destroy(); ic.destroy(); } });
    this.scene.tweens.add({ targets: t, scale: { from: 0.4, to: 1.15 }, duration: 240, ease: 'Back.easeOut' });
    // moedas voando entre o peão e o cartão do jogador
    const u = this.u;
    const cp = { x: (chip.c.x + chip.coinIcon.x + 8) * u, y: (chip.c.y + 24) * u };
    const tp = this.toScreen(tk.px, tk.py - 40);
    const from = gain ? tp : cp, to = gain ? cp : tp;
    const n = this.reduce() ? 1 : clamp(Math.abs(delta), 1, 9);
    for (let i = 0; i < n; i++) {
      const c = this.scene.add.image(from.x, from.y, 'bd-coin').setScrollFactor(0).setDepth(112).setScale(0.8 * Math.min(u, 1.4)).setAlpha(0);
      const o = { v: 0 };
      this.scene.tweens.add({
        targets: o, v: 1, duration: 520, delay: 200 + i * 70, ease: 'Cubic.easeIn',
        onStart: () => c.setAlpha(1),
        onUpdate: () => { c.x = from.x + (to.x - from.x) * o.v; c.y = from.y + (to.y - from.y) * o.v - Math.sin(o.v * Math.PI) * 50; c.setAngle(o.v * 360); },
        onComplete: () => { c.destroy(); if (gain && i === n - 1) { this.pop(chip.coinTxt); this.burst(cp.x, cp.y, [0xffd45a, 0xffffff], 6, 20, 130); } },
      });
    }
    if (!gain) { this.scene.tweens.add({ targets: chip.c, x: chip.c.x + 4, duration: 50, yoyo: true, repeat: 3, delay: 200 }); }
  }

  private itemFx(tk: Token, item: string) {
    const ic = this.scene.add.image(tk.px, tk.py - 70, `ico-${item}`).setScale(5).setDepth(95);
    this.scene.tweens.add({ targets: ic, y: tk.py - 130, scale: 6.5, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => ic.destroy() });
    this.burst(tk.px, tk.py - 70, [0xffe08a, 0xffffff], 12, 60);
    this.noteBanner(`${ITEM_NAMES[item] ?? item}!`, 'good');
  }

  // ---------------------------------------------------------------- dado
  private showDice() { this.dice.setVisible(true); this.plaque.setVisible(true); }
  private hideDice() { if (!this.dice) return; this.dice.setVisible(false); this.diceShadow.setVisible(false); this.plaque.setVisible(false); this.diceBusy = false; this.scene.tweens.killTweensOf(this.dice); }

  private rollDice(pid: string, value: number) {
    const s = this.scene, u = this.u;
    this.diceBusy = true;
    this.plaque.setVisible(true); this.plaqueNum.setText('');
    const tk = this.tokens.get(pid);
    const mid = { x: W / 2, y: H / 2 - 10 };
    const big = 1.55 * Math.min(u, 1.3);
    this.dice.setVisible(true).setAlpha(1).setPosition(mid.x, mid.y).setScale(big).setAngle(0).setFrame(Math.floor(Math.random() * 6));
    this.diceShadow.setVisible(true).setPosition(mid.x, mid.y + 62 * big / 1.55).setAlpha(0.35);
    const finish = () => {
      this.dice.setFrame(value - 1).setAngle(0).setY(mid.y);
      this.diceShadow.setScale(1).setAlpha(0.35);
      sfx.click();
      this.ring(this.cam.scrollX + mid.x, this.cam.scrollY + mid.y, 0xffe08a, 1.2, 500, 1);
      // anéis e brilhos em coordenadas de tela
      const r = s.add.image(mid.x, mid.y, 'bd-ring').setScrollFactor(0).setDepth(118).setTint(0xffe08a).setBlendMode(ADD).setScale(0.4);
      s.tweens.add({ targets: r, scale: 2.2 * big, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
      for (let i = 0; i < (this.reduce() ? 4 : 14); i++) {
        const a = (Math.PI * 2 * i) / 14, sp = s.add.image(mid.x, mid.y, 'bd-spark').setScrollFactor(0).setDepth(121).setTint(0xffe08a).setBlendMode(ADD).setScale(0.8);
        s.tweens.add({ targets: sp, x: mid.x + Math.cos(a) * 110 * big / 1.55, y: mid.y + Math.sin(a) * 110 * big / 1.55, alpha: 0, duration: 600, ease: 'Cubic.easeOut', onComplete: () => sp.destroy() });
      }
      const num = this.txt(mid.x, mid.y - 90 * big / 1.55, String(value), 64, '#ffe08a', 10).setOrigin(0.5).setScrollFactor(0).setDepth(122);
      s.tweens.add({ targets: num, scale: { from: 0.3, to: 1.2 }, duration: 260, ease: 'Back.easeOut' });
      s.tweens.add({ targets: num, alpha: 0, y: num.y - 20, delay: 420, duration: 260, onComplete: () => num.destroy() });
      if (!this.reduce()) s.tweens.add({ targets: this.dice, scaleX: big * 1.18, scaleY: big * 0.82, duration: 90, yoyo: true });
      // voa para a placa
      s.tweens.add({
        targets: this.dice, x: this.diceHome.x, y: this.diceHome.y, scale: 0.8 * u, delay: this.reduce() ? 80 : 520, duration: this.reduce() ? 60 : 260, ease: 'Cubic.easeInOut',
        onStart: () => this.diceShadow.setVisible(false),
        onComplete: () => { this.diceBusy = false; this.plaqueNum.setText(String(value)); this.pop(this.plaqueNum); },
      });
      if (tk) this.burst(tk.px, tk.py - 50, [0xffe08a, 0xffffff], 8, 40);
    };
    if (this.reduce()) { s.time.delayedCall(180, finish); return; }
    // giro com quicadas que perdem altura, rotação desacelerando e troca de faces
    const D = 760;
    let nextFace = 0, bounces = 0;
    const o = { t: 0 };
    s.tweens.addCounter({
      from: 0, to: 1, duration: D, ease: 'Linear',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0; o.t = t;
        const e = 1 - (1 - t) * (1 - t);
        const bounce = Math.abs(Math.sin(t * Math.PI * 3.4)) * Math.pow(1 - t, 1.3);
        this.dice.setY(mid.y - bounce * 170 * big / 1.55);
        this.dice.setAngle((1 - e) * 820);
        this.dice.setScale(big * (1 + bounce * 0.28));
        this.diceShadow.setScale(1 - bounce * 0.5, 1).setAlpha(0.35 - bounce * 0.2);
        const b = Math.floor(t * 3.4 + 0.5);
        if (b > bounces) { bounces = b; sfx.step(); s.cameras.main.shake(70, 0.0016); }
        if (t * 22 >= nextFace) { nextFace += 1 + Math.floor(t * 3); this.dice.setFrame(Math.floor(Math.random() * 6)); sfx.diceRoll(); }
        // rastro (imagens fantasma)
        if (Math.random() < 0.5 && t < 0.85) {
          const g = s.add.image(this.dice.x, this.dice.y, 'bd-dice', Number(this.dice.frame.name)).setScrollFactor(0).setDepth(117).setAngle(this.dice.angle).setScale(this.dice.scale).setAlpha(0.3);
          s.tweens.add({ targets: g, alpha: 0, scale: g.scale * 0.8, duration: 220, onComplete: () => g.destroy() });
        }
      },
      onComplete: finish,
    });
  }

  // ---------------------------------------------------------------- movimento
  private hop(pid: string, to: string, remaining: number) {
    const tk = this.tokens.get(pid); if (!tk) return;
    const from = { x: tk.px, y: tk.py };
    tk.tile = to; tk.busy++;
    const dest = this.slotPos(pid, to);
    const dx = dest.x - from.x;
    const fast = this.reduce();
    tk.sprite.setFrame(2);
    this.plaqueNum.setText(remaining > 0 ? String(remaining) : '');
    tk.bubble.setText(remaining > 0 ? String(remaining) : '');
    const o = { v: 0 };
    this.scene.tweens.add({
      targets: o, v: 1, duration: fast ? 120 : 300, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const arc = fast ? 0 : Math.sin(o.v * Math.PI);
        tk.px = from.x + (dest.x - from.x) * o.v; tk.py = from.y + (dest.y - from.y) * o.v;
        tk.lift = arc * 26;
        tk.sprite.setScale(SPR * (1 - arc * 0.08), SPR * (1 + arc * 0.14)).setAngle(Math.sign(dx) * arc * 7).setFrame(o.v < 0.5 ? 2 : 3);
        this.place(tk, tk.lift);
        tk.shadow.setScale(3 * (1 - arc * 0.3)).setAlpha(1 - arc * 0.4);
      },
      onComplete: () => {
        tk.busy--; tk.px = dest.x; tk.py = dest.y; tk.lift = 0;
        tk.sprite.setScale(SPR).setAngle(0).setFrame(0); tk.shadow.setScale(3).setAlpha(1);
        this.place(tk, 0); this.restack(false);
        if (!fast) {
          this.scene.tweens.add({ targets: tk.sprite, scaleY: SPR * 0.88, scaleX: SPR * 1.08, duration: 70, yoyo: true });
          const img = this.tileImgs.get(to); if (img) this.scene.tweens.add({ targets: img, y: img.y + 3, duration: 70, yoyo: true });
        }
        this.puff(dest.x, dest.y + 4, 3);
      },
    });
    sfx.step();
  }

  private slide(pid: string, to: string) {
    const tk = this.tokens.get(pid); if (!tk) return;
    tk.tile = to; tk.busy++;
    const d = this.slotPos(pid, to);
    this.focusOn(d.x, d.y, 1200);
    this.puff(tk.px, tk.py, 5, 0x8a8aa0);
    this.scene.tweens.add({ targets: tk, px: d.x, py: d.y, duration: 560, ease: 'Cubic.easeOut', onUpdate: () => { tk.lift = Math.sin(((tk.px - d.x) !== 0 ? 1 : 0) * Math.PI) * 0; this.place(tk, 10); tk.sprite.setAngle((this.scene.time.now % 120 < 60 ? -1 : 1) * 10); }, onComplete: () => { tk.busy--; tk.sprite.setAngle(0); this.place(tk, 0); this.restack(false); this.puff(d.x, d.y + 4, 4, 0x8a8aa0); } });
    sfx.fall();
  }

  private teleport(pid: string, to: string) {
    const tk = this.tokens.get(pid); if (!tk) return;
    tk.tile = to; tk.busy++;
    sfx.teleport();
    const col = 0x55e8ff;
    this.ring(tk.px, tk.py + 4, col, 1.4, 700);
    const beam = this.scene.add.image(tk.px, tk.py + 6, 'bd-beam').setOrigin(0.5, 1).setTint(col).setBlendMode(ADD).setDepth(30).setScale(1.2, 1.3).setAlpha(0.9);
    this.scene.tweens.add({ targets: beam, alpha: 0, scaleX: 0.2, duration: 600, onComplete: () => beam.destroy() });
    this.burst(tk.px, tk.py - 30, [col, 0xffffff], 22, 70);
    this.scene.tweens.add({
      targets: tk.sprite, scaleY: 0, scaleX: SPR * 0.3, alpha: 0, duration: 320, ease: 'Cubic.easeIn',
      onComplete: () => {
        const d = this.slotPos(pid, to); tk.px = d.x; tk.py = d.y; this.place(tk, 0);
        this.focusOn(d.x, d.y, 1200);
        this.ring(d.x, d.y + 4, col, 1.4, 700);
        const beam2 = this.scene.add.image(d.x, d.y + 6, 'bd-beam').setOrigin(0.5, 1).setTint(col).setBlendMode(ADD).setDepth(30).setScale(0.3, 1.3).setAlpha(0.9);
        this.scene.tweens.add({ targets: beam2, alpha: 0, scaleX: 1.2, duration: 600, onComplete: () => beam2.destroy() });
        this.burst(d.x, d.y - 30, [col, 0xffffff], 22, 70);
        this.scene.tweens.add({ targets: tk.sprite, scaleY: SPR, scaleX: SPR, alpha: 1, duration: 340, ease: 'Back.easeOut', onComplete: () => { tk.busy--; this.restack(false); } });
      },
    });
  }

  private starBuyFx(pid: string, from: string, to: string) {
    sfx.starGet();
    const tk = this.tokens.get(pid), p = this.game.players.find((x) => x.id === pid);
    if (tk) { this.burst(tk.px, tk.py - 50, [0xffd45a, 0xffffff, 0xfff2b0], 40, 150); this.ring(tk.px, tk.py + 4, 0xffd45a, 2, 900); }
    this.titleCard('ESTRELA!', `${p?.name ?? ''} conquistou uma estrela`, '#ffd45a', 1600, 54);
    this.cam.flash(380, 255, 230, 120); this.shake(300, 0.005);
    if (from !== to) this.flyStar(to);
  }
  private flyStar(to: string) {
    const t = TILE[to]!;
    this.scene.tweens.killTweensOf(this.star); this.scene.tweens.killTweensOf(this.starGlow); this.scene.tweens.killTweensOf(this.starBeam);
    this.focusOn(t.x, t.y, 2200);
    const o = { v: 0 }, a = { x: this.star.x, y: this.star.y };
    this.scene.tweens.add({
      targets: o, v: 1, duration: 1300, delay: 700, ease: 'Sine.easeInOut',
      onUpdate: () => { this.star.setPosition(a.x + (t.x - a.x) * o.v, a.y + (t.y - 34 - a.y) * o.v - Math.sin(o.v * Math.PI) * 140); this.star.setAngle(o.v * 360); this.starGlow.setPosition(this.star.x, this.star.y + 8); if (Math.random() < 0.6) this.burst(this.star.x, this.star.y, [0xffd45a, 0xffffff], 1, 20, 38); },
      onComplete: () => {
        this.star.setAngle(0).setPosition(t.x, t.y - 34); this.starGlow.setPosition(t.x, t.y - 26); this.starBeam.setPosition(t.x, t.y - 8);
        this.ring(t.x, t.y + 4, 0xffd45a, 1.8, 800); this.burst(t.x, t.y - 34, [0xffd45a, 0xffffff], 24, 90);
        if (!this.reduce()) {
          this.scene.tweens.add({ targets: this.star, y: '-=7', duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.scene.tweens.add({ targets: this.starGlow, scale: 1.5, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
        }
      },
    });
  }

  // ---------------------------------------------------------------- posições
  private slotPos(pid: string, tile: string) {
    const here = [...this.tokens.values()].filter((k) => k.tile === tile).sort((a, b) => a.slot - b.slot);
    const idx = Math.max(0, here.findIndex((k) => k.pid === pid));
    const t = TILE[tile]!;
    return { x: t.x + (OFFS[Math.min(4, here.length)] ?? [0])[idx]!, y: t.y + 6 };
  }
  private place(tk: Token, lift: number) {
    tk.sprite.setPosition(tk.px, tk.py - lift).setDepth(10 + tk.py / 2000);
    tk.shadow.setPosition(tk.px, tk.py + 2).setDepth(9);
    tk.glow.setPosition(tk.px, tk.py + 2);
    tk.flag.setPosition(tk.px, tk.py - 64 - lift).setDepth(60);
    tk.bubble.setPosition(tk.px, tk.py - 92 - lift);
  }
  /** Reorganiza quem divide a mesma casa (sem pulos nos que estão andando). */
  private restack(instant: boolean) {
    for (const tk of this.tokens.values()) {
      if (tk.busy) continue;
      const d = this.slotPos(tk.pid, tk.tile);
      if (instant) { tk.px = d.x; tk.py = d.y; this.place(tk, 0); }
      else if (Math.abs(tk.px - d.x) > 0.5 || Math.abs(tk.py - d.y) > 0.5) {
        tk.busy++;
        this.scene.tweens.add({ targets: tk, px: d.x, py: d.y, duration: 180, onUpdate: () => this.place(tk, 0), onComplete: () => { tk.busy--; } });
      }
    }
  }

  // ---------------------------------------------------------------- entradas
  private onKey(ev: KeyboardEvent) {
    if (ev.repeat) return;
    if (ev.code === 'KeyL' || ev.code === 'KeyH') { this.toggleLegend(); return; }
    if (ev.code === 'Escape' && this.legend) { this.toggleLegend(); return; }
    const aw = this.client.state.game?.waiting;
    if (!aw || aw.pid !== this.client.state.you) return;
    const k = ev.code;
    if (aw.kind === 'roll' && (k === 'Space' || k === 'Enter' || k === 'NumpadEnter')) { sfx.click(); this.client.roll?.(); }
    else if (aw.kind === 'buy') {
      if (k === 'Space' || k === 'Enter' || k === 'KeyS' || k === 'KeyY') { this.client.buy?.(true); }
      else if (k === 'Escape' || k === 'KeyN') { this.client.buy?.(false); }
    } else if (aw.kind === 'fork') {
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
      const d = dir[k]; if (!d) return;
      const here = this.tokens.get(aw.pid); if (!here) return;
      const from = TILE[here.tile]!;
      let best: string | null = null, bs = 0.35;
      for (const c of aw.choices) {
        const t = TILE[c]!; const L = Math.hypot(t.x - from.x, t.y - from.y) || 1;
        const dot = ((t.x - from.x) * d[0] + (t.y - from.y) * d[1]) / L;
        if (dot > bs) { bs = dot; best = c; }
      }
      if (best) { sfx.select(); this.client.choose?.(best); }
    }
  }

  // ---------------------------------------------------------------- quadro
  render(time: number) {
    this.frame++;
    for (const u of this.client.drainGame?.() ?? []) this.apply(u);
    const g = this.game;
    // HUD acompanha o tamanho da tela (celular)
    if (this.frame % 20 === 0 && Math.abs(this.uiScale() - this.lastU) > 0.08) { for (const [id, ch] of this.chips) this.chipPrev.set(id, ch.shown); this.buildHud(); }
    // ressincroniza peões ociosos fora do lugar (reconexão)
    for (const p of g.players) {
      const tk = this.tokens.get(p.id)!;
      if (!tk.busy && tk.tile !== p.tile) { tk.tile = p.tile; this.restack(true); }
    }
    // peão da vez: balança, brilha, bandeirinha quica
    const act = this.tokens.get(this.active);
    for (const tk of this.tokens.values()) {
      const me = tk === act && g.phase !== 'minigame' && g.phase !== 'final';
      tk.glow.setAlpha(me ? 0.55 + Math.sin(time / 240) * 0.2 : 0);
      if (tk.busy) continue;
      tk.sprite.setFrame(me && Math.floor(time / 450) % 2 ? 1 : 0);
      const bob = me && !this.reduce() ? Math.abs(Math.sin(time / 260)) * 5 : 0;
      tk.flag.setY(tk.py - 64 - bob).setVisible(me);
      tk.sprite.setY(tk.py - (me && !this.reduce() ? Math.abs(Math.sin(time / 450 * Math.PI)) * 2 : 0));
    }
    // contador de moedas rola até o valor certo
    for (const ch of this.chips.values()) {
      if (ch.shown !== ch.target && time >= ch.hold) {
        const diff = ch.target - ch.shown, step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) / 7));
        ch.shown += step; if (Math.sign(ch.target - ch.shown) !== Math.sign(diff)) ch.shown = ch.target;
        ch.coinTxt.setText(String(ch.shown)).setColor(diff > 0 ? '#9dff9a' : '#ff9a9a');
      } else if (ch.shown === ch.target && ch.coinTxt.text !== String(ch.shown)) ch.coinTxt.setText(String(ch.shown));
      else if (ch.shown === ch.target && time >= ch.hold) ch.coinTxt.setColor('#ffe08a');
    }
    // câmera: segue quem joga; eventos podem prender o foco por um instante
    let fx: number, fy: number;
    if (this.focus && time < this.focus.until) { fx = this.focus.x; fy = this.focus.y; }
    else { this.focus = null; fx = act?.px ?? 800; fy = act?.py ?? 500; }
    const tx = this.cx(fx - W / 2), ty = this.cy(fy - H / 2 + 10);
    const k = this.reduce() ? 0.25 : 0.075;
    this.cam.scrollX += (tx - this.cam.scrollX) * k; this.cam.scrollY += (ty - this.cam.scrollY) * k;
    // dado em espera: pisca quando é hora de rolar
    if (!this.diceBusy && g.phase === 'roll' && this.dice.visible) this.dice.setAlpha(0.6 + Math.sin(time / 220) * 0.2);
    else if (!this.diceBusy && this.dice) this.dice.setAlpha(1);
    this.syncPicks(time);
    this.pointStar();
  }

  private apply(u: GameUpdate) {
    this.game = u.game;
    const turn = u.game.order[u.game.turn];
    if (turn && !u.events.some((e) => e.t === 'turn')) this.active = turn;
    this.handle(u.events);
    this.refreshHud();
    this.syncDynamic();
  }

  /** Efeitos temporários do mapa: casas bloqueadas, caminhos novos, brilhos de tesouro e estrela secreta. */
  private syncDynamic() {
    const g = this.game;
    const key = JSON.stringify([g.blocked, g.extraEdges, Object.keys(g.bonusTiles), g.secretStar?.tile ?? '']);
    if (key === this.dynKey) return;
    this.dynKey = key;
    this.dyn.forEach((o) => o.destroy()); this.dyn = [];
    const s = this.scene;
    for (const [a, b] of g.extraEdges) {
      const A = TILE[a]!, B = TILE[b]!;
      const gr = s.add.graphics().setDepth(2);
      gr.lineStyle(22, 0x5a1a0a, 1).lineBetween(A.x, A.y, B.x, B.y);
      gr.lineStyle(14, 0xff9a3a, 1).lineBetween(A.x, A.y, B.x, B.y);
      gr.lineStyle(5, 0xffe08a, 1).lineBetween(A.x, A.y, B.x, B.y);
      this.dyn.push(gr);
    }
    for (const id of g.blocked) {
      const t = TILE[id]!;
      const gr = s.add.graphics().setDepth(8);
      gr.fillStyle(0x3a0a0a, 0.82).fillCircle(t.x, t.y + 4, 28);
      gr.lineStyle(7, 0xff6a2a, 1).lineBetween(t.x - 14, t.y - 10, t.x + 14, t.y + 18).lineBetween(t.x + 14, t.y - 10, t.x - 14, t.y + 18);
      this.dyn.push(gr);
    }
    for (const id of Object.keys(g.bonusTiles)) {
      const t = TILE[id]!;
      const glow = s.add.image(t.x + 16, t.y - 28, 'bd-glow').setTint(0xffd45a).setBlendMode(ADD).setScale(0.5).setDepth(44);
      const sp = s.add.image(t.x + 16, t.y - 28, 'bd-spark').setScale(1.6).setDepth(45);
      s.tweens.add({ targets: [sp, glow], alpha: 0.3, scale: '-=0.3', duration: 500, yoyo: true, repeat: -1 });
      this.dyn.push(sp, glow);
    }
    if (g.secretStar) {
      const t = TILE[g.secretStar.tile]!;
      const glow = s.add.image(t.x, t.y - 26, 'bd-glow').setTint(0x66ddff).setBlendMode(ADD).setScale(0.9).setDepth(38);
      const st = s.add.image(t.x, t.y - 34, 'bd-star').setTint(0x66ddff).setScale(1).setDepth(40);
      s.tweens.add({ targets: st, y: '-=6', duration: 700, yoyo: true, repeat: -1 });
      this.dyn.push(st, glow);
    }
  }

  /** Setas e rótulos sobre as casas que o jogador pode escolher na bifurcação. */
  private syncPicks(time: number) {
    const aw = this.client.state.game?.waiting;
    const key = aw?.kind === 'fork' ? aw.choices.join(',') : '';
    if (key !== this.picksKey) {
      this.picks.forEach((o) => o.destroy()); this.picks = []; this.picksKey = key;
      if (aw?.kind === 'fork') for (const c of aw.choices) {
        const t = TILE[c]!, info = TILE_INFO[t.type];
        const ring = this.scene.add.ellipse(t.x, t.y + 6, 78, 46).setStrokeStyle(4, 0xffe08a).setDepth(7);
        const arr = this.scene.add.image(t.x, t.y - 52, 'bd-arrow').setDepth(70);
        const lab = this.txt(t.x, t.y + 38, info.name.toUpperCase(), 14, info.fill, 5).setOrigin(0.5, 0).setDepth(71);
        this.picks.push(ring, arr, lab);
        if (!this.reduce()) this.focusOn(t.x, t.y, 0);
      }
      this.focus = null;
    }
    if (aw?.kind !== 'fork') return;
    aw.choices.forEach((c, i) => {
      const t = TILE[c]!;
      (this.picks[i * 3] as Phaser.GameObjects.Ellipse).setAlpha(0.55 + Math.sin(time / 180) * 0.4);
      (this.picks[i * 3 + 1] as Phaser.GameObjects.Image).y = t.y - 52 + Math.sin(time / 180) * 4;
    });
  }

  /** Estrela fora da tela: ícone na borda apontando para ela. */
  private pointStar() {
    const sp = this.toScreen(this.star.x, this.star.y), u = this.u;
    const m = 30 * u, off = sp.x < 10 || sp.x > W - 10 || sp.y < 70 || sp.y > H - 10;
    this.starPtr.setVisible(off);
    if (!off) return;
    const cx = W / 2, cy = H / 2, a = Math.atan2(sp.y - cy, sp.x - cx);
    let px = clamp(sp.x, m, W - m), py = clamp(sp.y, 80 + m, H - m);
    if (px < 232 * u) py = Math.min(py, H - 70 * u); // não cobre a rodada nem o botão de legenda
    if (px > W - 136 * u) py = Math.min(py, H - 110 * u); // nem a placa do dado
    this.starPtr.setPosition(px, py).setScale(u);
    (this.starPtr.list[0] as Phaser.GameObjects.Image).setAngle((a * 180) / Math.PI - 90);
    (this.starPtr.list[1] as Phaser.GameObjects.Image).setPosition(-Math.cos(a) * 26, -Math.sin(a) * 26);
  }

  destroy() {
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.scene.input.keyboard?.removeCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    this.scene.scale.off('resize', this.resizeHandler);
    this.alive = false;
    this.hideTip();
    this.scene.tweens.killAll();
    this.scene.time.removeAllEvents();
    this.cam.setZoom(1); this.cam.setScroll(0, 0);
    this.scene.scale.setGameSize(480, 270);
    this.cam.setSize(480, 270);
    this.picks.forEach((o) => o.destroy());
    this.dyn.forEach((o) => o.destroy());
  }
}
