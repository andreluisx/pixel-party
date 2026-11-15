import type Phaser from 'phaser';
import type { BridgeClient } from '@/net/bridge';
import { buildAllTextures } from './art/textures';
import { buildBoardArt } from './art/boardArt';
import { BoardView } from './views/BoardView';
import type { GameView, Pad, PressKey } from './views/GameView';
import { ArenaView } from './views/ArenaView';
import { CorridaView } from './views/CorridaView';
import { ReflexView } from './views/ReflexView';
import { LedFloorView } from './views/LedFloorView';
import { DuelView } from './views/DuelView';
import { PuzzleView } from './views/PuzzleView';
import { ArcherView } from './views/ArcherView';
import { RainView } from './views/RainView';

export interface SceneBridge { client: BridgeClient; getDebug: () => boolean }

/** Registro de views: um minigame novo = uma linha aqui. */
const VIEWS: Record<string, (scene: Phaser.Scene, ps: import('@shared/types').ParticipantInfo[], me: string | null) => GameView> = {
  'caca-moedas': (s, ps, me) => new ArenaView(s, ps, me),
  'corrida-maluca': (s, ps, me) => new CorridaView(s, ps, me),
  'reflexo-relampago': (s, ps, me) => new ReflexView(s, ps, me),
  'piso-led': (s, ps, me) => new LedFloorView(s, ps, me),
  'ultimo-disparo': (s, ps, me) => new DuelView(s, ps, me),
  'quebra-cabeca': (s, ps, me) => new PuzzleView(s, ps, me),
  'duelo-arqueiros': (s, ps, me) => new ArcherView(s, ps, me),
  'chuva-de-pedras': (s, ps, me) => new RainView(s, ps, me),
};

/** Cena genérica de minigame: constrói a view do minigame ativo, lê teclado/toque e envia inputs ao servidor. */
export function createMinigameSceneClass(PhaserLib: typeof Phaser, bridge: SceneBridge) {
  return class MinigameScene extends PhaserLib.Scene {
    private view: GameView | null = null;
    private board: BoardView | null = null;
    private viewFor = '';
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private capturing = false;
    private keyQueue: PressKey[] = []; // apertos por evento: toques muito rápidos não se perdem entre quadros

    constructor() { super('minigame'); }

    create() {
      buildAllTextures(this);
      buildBoardArt(this);
      const kb = this.input.keyboard!;
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ENTER,SHIFT,F') as Record<string, Phaser.Input.Keyboard.Key>;
      this.cameras.main.setBackgroundColor('#1a1240');
      this.input.mouse?.disableContextMenu();
      const MAP: Record<string, PressKey> = { ArrowLeft: 'L', KeyA: 'L', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowRight: 'R', KeyD: 'R' };
      kb.on('keydown', (ev: KeyboardEvent) => {
        const k = MAP[ev.code] ?? (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'NumpadEnter' ? 'A' : undefined);
        if (k && !ev.repeat) this.keyQueue.push(k);
        // E ou Espaço alternam MOVER/MIRAR nos minigames com mira
        if ((ev.code === 'KeyE' || ev.code === 'Space') && !ev.repeat && bridge.client.state.intro?.meta.instructions.touch?.aimToggle && bridge.client.state.lobby?.phase === 'active') bridge.client.toggleAim();
      });
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
      return { dx, dy, action: down('SPACE', 'ENTER') || t.action, aim: bridge.client.state.aimMode, run: down('SHIFT') || t.run, fire: down('F') || t.fire, pressed };
    }

    update(time: number) {
      const st = bridge.client.state;
      const intro = st.intro;
      const wantBoard = !intro && !!st.game;
      const key = wantBoard ? 'board' : intro ? `${st.lobby?.matchNo}:${intro.meta.id}` : '';
      if (key !== this.viewFor) {
        this.view?.destroy();
        this.board?.destroy();
        this.children.removeAll(true);
        this.view = null; this.board = null;
        this.viewFor = key;
        if (wantBoard) this.board = new BoardView(this, bridge.client);
        else {
          const make = intro ? VIEWS[intro.meta.id] : undefined;
          if (intro && make) this.view = make(this, intro.participants, st.you);
        }
      }
      if (this.board) { this.board.render(time); this.keyQueue.length = 0; bridge.client.touchPresses.length = 0; return; }
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
      else { this.keyQueue.length = 0; bridge.client.touchPresses.length = 0; } // apertos fora da partida não valem
    }
  };
}
