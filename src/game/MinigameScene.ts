import type Phaser from 'phaser';
import type { LabClient } from '@/net/labClient';
import { buildAllTextures } from './art/textures';
import { ArenaView } from './views/ArenaView';

export interface SceneBridge { client: LabClient; getDebug: () => boolean }

/** Cena genérica de minigame: constrói a "view" do minigame ativo, lê o teclado e envia inputs. */
export function createMinigameSceneClass(PhaserLib: typeof Phaser, bridge: SceneBridge) {
  return class MinigameScene extends PhaserLib.Scene {
    private view: ArenaView | null = null;
    private viewFor = '';
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;

    constructor() { super('minigame'); }

    create() {
      buildAllTextures(this);
      const kb = this.input.keyboard!;
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
      this.cameras.main.setBackgroundColor('#1a1240');
    }

    update(time: number) {
      const st = bridge.client.state;
      const intro = st.intro;
      const key = intro ? `${st.lobby?.matchNo}:${intro.meta.id}` : '';
      if (key !== this.viewFor) {
        this.view?.destroy();
        this.children.removeAll(true);
        this.view = null;
        this.viewFor = key;
        if (intro && intro.meta.id === 'pipeline-test') this.view = new ArenaView(this, intro.participants, st.you);
      }
      if (!this.view) return;
      this.view.setDebug(bridge.getDebug());
      this.view.render(bridge.client.latest, time);

      if (st.lobby?.phase === 'active') {
        const k = this.keys;
        let dx = (k.D!.isDown || k.RIGHT!.isDown ? 1 : 0) - (k.A!.isDown || k.LEFT!.isDown ? 1 : 0);
        let dy = (k.S!.isDown || k.DOWN!.isDown ? 1 : 0) - (k.W!.isDown || k.UP!.isDown ? 1 : 0);
        if (dx === 0 && dy === 0) { dx = bridge.client.touch.dx; dy = bridge.client.touch.dy; }
        bridge.client.sendInput(dx, dy);
      }
    }
  };
}
