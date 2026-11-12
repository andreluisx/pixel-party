import type Phaser from 'phaser';
import type { LabClient } from '@/net/labClient';
import { buildAllTextures } from './art/textures';
import type { GameView, Pad, PressKey } from './views/GameView';
import { ArenaView } from './views/ArenaView';
import { CorridaView } from './views/CorridaView';
import { ReflexView } from './views/ReflexView';

export interface SceneBridge { client: LabClient; getDebug: () => boolean }

/** Registro de views: um minigame novo = uma linha aqui. */
const VIEWS: Record<string, (scene: Phaser.Scene, ps: import('@shared/types').ParticipantInfo[], me: string | null) => GameView> = {
  'pipeline-test': (s, ps, me) => new ArenaView(s, ps, me),
  'corrida-maluca': (s, ps, me) => new CorridaView(s, ps, me),
  'reflexo-relampago': (s, ps, me) => new ReflexView(s, ps, me),
};

/** Cena genérica de minigame: constrói a view do minigame ativo, lê teclado/toque e envia inputs ao servidor. */
export function createMinigameSceneClass(PhaserLib: typeof Phaser, bridge: SceneBridge) {
  return class MinigameScene extends PhaserLib.Scene {
    private view: GameView | null = null;
    private viewFor = '';
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private capturing = false;
    private keyQueue: PressKey[] = []; // apertos por evento: toques muito rápidos não se perdem entre quadros

    constructor() { super('minigame'); }

    create() {
      buildAllTextures(this);
      const kb = this.input.keyboard!;
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;
      this.cameras.main.setBackgroundColor('#1a1240');
      const MAP: Record<string, PressKey> = { ArrowLeft: 'L', KeyA: 'L', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowRight: 'R', KeyD: 'R' };
      kb.on('keydown', (ev: KeyboardEvent) => { const k = MAP[ev.code]; if (k && !ev.repeat) this.keyQueue.push(k); });
    }

    private readPad(): Pad {
      const k = this.keys;
      const t = bridge.client.touch;
      const down = (...names: string[]) => names.some((n) => k[n]?.isDown);
      let dx = (down('D', 'RIGHT') ? 1 : 0) - (down('A', 'LEFT') ? 1 : 0);
      let dy = (down('S', 'DOWN') ? 1 : 0) - (down('W', 'UP') ? 1 : 0);
      if (dx === 0) dx = t.dx;
      if (dy === 0) dy = t.dy;
      const pressed: PressKey[] = [...this.keyQueue.splice(0), ...bridge.client.touchPresses.splice(0)];
      return { dx, dy, action: down('SPACE', 'ENTER') || t.action, pressed };
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
        const make = intro ? VIEWS[intro.meta.id] : undefined;
        if (intro && make) this.view = make(this, intro.participants, st.you);
      }
      if (!this.view) return;
      const phase = st.lobby?.phase ?? 'lobby';
      // durante a partida, setas e espaço não rolam a página (o Phaser cuida disso sem esconder o evento dele mesmo)
      const wantCapture = phase === 'active' || phase === 'countdown';
      if (wantCapture !== this.capturing) {
        this.capturing = wantCapture;
        const kb = this.input.keyboard!;
        if (wantCapture) kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE'); else kb.removeCapture('UP,DOWN,LEFT,RIGHT,SPACE');
      }
      this.view.setDebug(bridge.getDebug());
      this.view.render(bridge.client.latest, { phase, myId: st.you, time });
      if (phase === 'active') bridge.client.sendInput(this.view.readInput(this.readPad()));
    }
  };
}
