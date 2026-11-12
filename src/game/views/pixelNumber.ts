import type Phaser from 'phaser';
import { DIGIT_FRAMES } from '../art/textures';

/** Números em fonte de pixel (3x5) desenhados com sprites, nítidos em qualquer escala. */
export class PixelNumber {
  private c: Phaser.GameObjects.Container;
  private text = '';
  constructor(private scene: Phaser.Scene, x: number, y: number, private scale: number, private tint: number, depth = 20) {
    this.c = scene.add.container(x, y).setDepth(depth);
  }
  get container() { return this.c; }
  set(text: string) {
    if (text === this.text) return;
    this.text = text;
    this.c.removeAll(true);
    const adv = 4 * this.scale;
    const total = text.length * adv - this.scale;
    [...text].forEach((ch, i) => {
      const f = DIGIT_FRAMES.indexOf(ch);
      if (f < 0) return;
      const x = -total / 2 + i * adv;
      this.c.add(this.scene.add.image(x + this.scale, this.scale, 'digits', f).setOrigin(0, 0).setScale(this.scale).setTint(0x1b1030));
      this.c.add(this.scene.add.image(x, 0, 'digits', f).setOrigin(0, 0).setScale(this.scale).setTint(this.tint));
    });
  }
  setPosition(x: number, y: number) { this.c.setPosition(x, y); }
  destroy() { this.c.destroy(); }
}

/** Número que sobe e some (ex.: "+15"). */
export function popup(scene: Phaser.Scene, x: number, y: number, text: string, tint: number, scale = 2) {
  const n = new PixelNumber(scene, x, y, scale, tint, 90);
  n.set(text);
  scene.tweens.add({ targets: n.container, y: y - 22, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => n.destroy() });
}
