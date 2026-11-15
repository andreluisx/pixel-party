import type Phaser from 'phaser';
import type { Snapshot } from '@shared/protocol';
import type { ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { GRID, PIECES, type PuzzleState } from '@shared/minigames/quebra-cabeca';
import { FRAME_INDEX } from '../art/characters';
import { ensurePuzzleTextures } from '../art/textures';
import { num } from '../art/palette';
import { sfx } from '../audio/sfx';
import type { GameView, Pad, RenderCtx } from './GameView';
import { PixelNumber } from './pixelNumber';

// Layout (tela de 480x270): meu tabuleiro grande à esquerda; modelo e tabuleiros dos adversários à direita.
const BX = 16, BY = 60, P = 48, SC = 8; // peça de 6px * 8 = 48px
const MINI_SC = 3, MINI = 6 * MINI_SC * GRID; // 72px
const REF_X = 224, REF_Y = 58;
const OPP_Y = 150;
const OPP_X = [224, 312, 400];

interface Mini { id: string; slot: number; x0: number; sprites: Phaser.GameObjects.Image[]; count: PixelNumber; face: Phaser.GameObjects.Sprite; done: PixelNumber; prev: number; finished: boolean }

/** Quebra-Cabeça Relâmpago: monte a imagem trocando peças de lugar (clique/toque em duas peças, ou setas + Espaço). */
export class PuzzleView implements GameView {
  private picture = -1;
  private built = false;
  private sprites: Phaser.GameObjects.Image[] = []; // sprites[k] = peça k
  private g!: Phaser.GameObjects.Graphics;
  private minis: Mini[] = [];
  private zones: Phaser.GameObjects.Rectangle[] = [];
  private sel = -1; private cursor = 0; private kbd = false;
  private n = 0; private a = 0; private b = 0;
  private queue: Array<[number, number]> = [];
  private prev: number[] | null = null; private prevCorrect = 0; private prevFinished = false;
  private timeTxt!: PixelNumber; private myCount!: PixelNumber; private swapsTxt!: PixelNumber; private msg!: PixelNumber; private sub!: PixelNumber;
  private lastSec = -1;

  constructor(private scene: Phaser.Scene, private participants: ParticipantInfo[], private myId: string | null) {
    scene.add.rectangle(240, 135, 480, 270, 0x0e0820).setDepth(0);
    this.msg = new PixelNumber(scene, 112, 8, 3, 0xffe08a, 9);
    this.msg.set('MONTE A IMAGEM!');
    this.sub = new PixelNumber(scene, 132, 30, 1, 0xcdbf95, 9);
    this.sub.set('CLIQUE EM DUAS PECAS PARA TROCAR');
    this.timeTxt = new PixelNumber(scene, 446, 8, 4, 0xffffff, 9);
    this.myCount = new PixelNumber(scene, 380, 78, 4, 0xffffff, 9);
    this.swapsTxt = new PixelNumber(scene, 380, 112, 1, 0xcdbf95, 9);
    new PixelNumber(scene, 380, 64, 1, 0xcdbf95, 9).set('PECAS CERTAS');
    new PixelNumber(scene, REF_X + 36, 50, 1, 0xcdbf95, 9).set('MODELO');
    this.g = scene.add.graphics().setDepth(30);
  }

  setDebug() { /* sem hitboxes */ }

  /** Pedidos de troca viram {a,b,n}; o servidor só troca quando n muda. */
  readInput(pad: Pad) {
    for (const k of pad.pressed) {
      this.kbd = true;
      if (k === 'L') this.cursor = (this.cursor % GRID === 0 ? this.cursor + GRID - 1 : this.cursor - 1);
      else if (k === 'R') this.cursor = (this.cursor % GRID === GRID - 1 ? this.cursor - (GRID - 1) : this.cursor + 1);
      else if (k === 'U') this.cursor = (this.cursor - GRID + PIECES) % PIECES;
      else if (k === 'D') this.cursor = (this.cursor + GRID) % PIECES;
      else if (k === 'A') this.pickSlot(this.cursor);
    }
    const next = this.queue.shift();
    if (next) { this.a = next[0]; this.b = next[1]; this.n++; }
    return { a: this.a, b: this.b, n: this.n };
  }

  private pickSlot(slot: number) {
    if (this.sel < 0) { this.sel = slot; sfx.pick(); }
    else if (this.sel === slot) { this.sel = -1; sfx.click(); }
    else { this.queue.push([this.sel, slot]); this.sel = -1; }
  }

  private slotXY(slot: number) { return { x: BX + (slot % GRID) * P + P / 2, y: BY + Math.floor(slot / GRID) * P + P / 2 }; }

  private build(s: PuzzleState) {
    const sc = this.scene;
    this.picture = s.picture;
    ensurePuzzleTextures(sc, s.picture);
    const key = `puzp-${s.picture}`;
    const me = this.participants.find((p) => p.id === this.myId);
    const myColor = num(SLOT_COLORS[me?.slot ?? 0] ?? '#ffffff');
    // moldura do meu tabuleiro
    sc.add.rectangle(BX + (P * GRID) / 2, BY + (P * GRID) / 2, P * GRID + 8, P * GRID + 8, 0x1b1030).setStrokeStyle(3, myColor).setDepth(1);
    this.sprites = Array.from({ length: PIECES }, (_, k) => sc.add.image(0, 0, key, k).setScale(SC).setDepth(3));
    this.zones = Array.from({ length: PIECES }, (_, slot) => {
      const { x, y } = this.slotXY(slot);
      const z = sc.add.rectangle(x, y, P, P, 0xffffff, 0.001).setDepth(20).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => { this.kbd = false; this.pickSlot(slot); });
      return z;
    });
    // modelo
    sc.add.rectangle(REF_X + 36, REF_Y + 36, 78, 78, 0x1b1030).setStrokeStyle(2, 0xffd23d).setDepth(1);
    sc.add.image(REF_X, REF_Y, `puzfull-${s.picture}`).setOrigin(0, 0).setScale(3).setDepth(2);
    // adversários (tabuleiros ao vivo)
    const others = [...this.participants].filter((p) => p.id !== this.myId).sort((a, b) => a.slot - b.slot);
    others.slice(0, 3).forEach((p, i) => {
      const x0 = OPP_X[i]!;
      const color = num(SLOT_COLORS[p.slot] ?? '#ffffff');
      sc.add.rectangle(x0 + MINI / 2, OPP_Y + MINI / 2, MINI + 6, MINI + 6, 0x1b1030).setStrokeStyle(2, color).setDepth(1);
      const sprites = Array.from({ length: PIECES }, (_, k) => sc.add.image(0, 0, key, k).setOrigin(0, 0).setScale(MINI_SC).setDepth(3));
      const face = sc.add.sprite(x0 + 8, OPP_Y + MINI + 24, `char-${p.characterId}`, 0).setDepth(4);
      const count = new PixelNumber(sc, x0 + 42, OPP_Y + MINI + 11, 2, 0xffffff, 9); count.set('0/16');
      const done = new PixelNumber(sc, x0 + 42, OPP_Y + MINI + 26, 1, 0x6dff8a, 9);
      this.minis.push({ id: p.id, slot: p.slot, x0, sprites, count, face, done, prev: 0, finished: false });
    });
    this.built = true;
  }

  render(snap: Snapshot | null, ctx: RenderCtx) {
    if (!snap) return;
    const s = snap.state as PuzzleState;
    if (!this.built || this.picture !== s.picture) { if (this.built) return; this.build(s); }
    const mine = this.myId ? s.players[this.myId] : undefined;
    const t = ctx.time;
    this.g.clear();

    // ---- meu tabuleiro: cada peça desliza para a posição onde o servidor a colocou
    if (mine) {
      mine.board.forEach((piece, slot) => {
        const spr = this.sprites[piece]!;
        const { x, y } = this.slotXY(slot);
        spr.x += (x - spr.x) * (spr.x === 0 ? 1 : 0.45); spr.y += (y - spr.y) * (spr.y === 0 ? 1 : 0.45);
        if (spr.x === 0) { spr.x = x; spr.y = y; }
        const ok = piece === slot;
        spr.setTint(ok ? 0xffffff : 0xe8e0f0);
        if (ok) this.g.fillStyle(0x4fd36b, 1).fillRect(x - P / 2 + 3, y - P / 2 + 3, 7, 7).lineStyle(1, 0x1b1030, 1).strokeRect(x - P / 2 + 3, y - P / 2 + 3, 7, 7);
      });
      // grade sutil entre as peças
      this.g.lineStyle(1, 0x1b1030, 0.55);
      for (let i = 1; i < GRID; i++) { this.g.lineBetween(BX + i * P, BY, BX + i * P, BY + P * GRID); this.g.lineBetween(BX, BY + i * P, BX + P * GRID, BY + i * P); }
      // seleção e cursor
      if (this.sel >= 0) { const { x, y } = this.slotXY(this.sel); this.g.lineStyle(4, 0xffd23d, 0.6 + 0.4 * Math.sin(t / 90)).strokeRect(x - P / 2 + 2, y - P / 2 + 2, P - 4, P - 4); }
      if (this.kbd) { const { x, y } = this.slotXY(this.cursor); this.g.lineStyle(3, 0xffffff, 0.9).strokeRect(x - P / 2 + 1, y - P / 2 + 1, P - 2, P - 2); }

      // efeitos e sons de troca / acerto / conclusão
      if (this.prev) {
        const changed = mine.board.map((v, i) => (v !== this.prev![i] ? i : -1)).filter((i) => i >= 0);
        if (changed.length) {
          sfx.swap();
          for (const i of changed) { const { x, y } = this.slotXY(i); this.burst(x, y, mine.board[i] === i ? 0x6dff8a : 0xffe08a, mine.board[i] === i ? 7 : 3); }
          if (mine.correct > this.prevCorrect) setTimeout(() => sfx.coin(), 70);
        }
      }
      this.prev = [...mine.board]; this.prevCorrect = mine.correct;
      if (mine.finishedAtMs !== null && !this.prevFinished) {
        this.prevFinished = true; sfx.win();
        for (let i = 0; i < 24; i++) this.burst(BX + Math.random() * P * GRID, BY + Math.random() * P * GRID, [0xffe08a, 0x6dff8a, 0x4da3ff, 0xff8fc1][i % 4]!, 3);
      }
      if (mine.finishedAtMs !== null) {
        this.g.lineStyle(4, 0x6dff8a, 0.6 + 0.4 * Math.sin(t / 120)).strokeRect(BX - 3, BY - 3, P * GRID + 6, P * GRID + 6);
        this.msg.set('COMPLETO!'); this.msg.setColor(0x6dff8a); this.sub.set(`${(mine.finishedAtMs / 1000).toFixed(1).replace('.', ',')} SEGUNDOS`);
      } else { this.msg.set('MONTE A IMAGEM!'); this.msg.setColor(0xffe08a); }
      this.myCount.set(`${mine.correct}/16`); this.myCount.setColor(mine.correct === 16 ? 0x6dff8a : 0xffffff);
      this.swapsTxt.set(`TROCAS ${mine.swaps}`);
    }

    // ---- tempo
    const sec = Math.ceil(snap.timeLeftMs / 1000);
    this.timeTxt.set(String(sec)); this.timeTxt.setColor(sec <= 8 ? 0xff5d5d : 0xffffff);
    if (sec !== this.lastSec) { this.lastSec = sec; if (sec <= 5 && sec > 0 && ctx.phase === 'active') sfx.beep(); }
    if (ctx.phase === 'result') this.sub.set('FIM DE JOGO');

    // ---- adversários ao vivo (mesmas peças, tabuleiro deles)
    for (const m of this.minis) {
      const pl = s.players[m.id];
      if (!pl) continue;
      pl.board.forEach((piece, slot) => {
        const spr = m.sprites[piece]!;
        const tx = m.x0 + (slot % GRID) * 6 * MINI_SC, ty = OPP_Y + Math.floor(slot / GRID) * 6 * MINI_SC;
        spr.x += (tx - spr.x) * (spr.x === 0 ? 1 : 0.5); spr.y += (ty - spr.y) * (spr.y === 0 ? 1 : 0.5);
        if (spr.x === 0) { spr.x = tx; spr.y = ty; }
        spr.setTint(piece === slot ? 0xffffff : 0xb8b0c8);
      });
      m.count.set(`${pl.correct}/16`);
      m.face.setFrame(pl.finishedAtMs !== null ? FRAME_INDEX.celebrate + (Math.floor(t / 200) % 2) : FRAME_INDEX.idle + (Math.floor(t / 500) % 2));
      if (pl.finishedAtMs !== null && !m.finished) { m.finished = true; m.done.set('FEITO!'); this.burst(m.x0 + MINI / 2, OPP_Y + MINI / 2, 0x6dff8a, 10); if (this.myId) sfx.tick(); }
      if (pl.correct > m.prev) m.prev = pl.correct;
    }
  }

  private burst(x: number, y: number, tint: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = this.scene.add.image(x, y, 'spark').setTint(tint).setDepth(40).setScale(2);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * 22, y: y + Math.sin(a) * 22, alpha: 0, duration: 380, onComplete: () => sp.destroy() });
    }
  }

  destroy() { this.minis = []; this.sprites = []; this.zones = []; this.built = false; }
}
