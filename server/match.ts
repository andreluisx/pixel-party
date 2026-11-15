import type { IO, Sock } from './labRoom';
import type { ParticipantInfo, PlayerId } from '../shared/types';
import type { GameUpdate } from '../shared/protocol';
import { buildBoard } from '../shared/board/board';
import { REINO_DO_CASTELO } from '../shared/board/maps/reino-do-castelo';
import { act, advance, awaiting, createGame, finishMinigame, publicGame, type GameState, type GEvent, type Intent } from '../shared/game/engine';
import { decide } from '../shared/game/boardBot';
import { getMinigame, MINIGAME_LIST } from '../shared/minigames';
import { MinigameSession } from './minigameSession';

export const BOARD_DEF = buildBoard(REINO_DO_CASTELO);
export const HUMAN_WAIT_MS = 45_000;
const BOT_THINK: [number, number] = [700, 1400];

const EVENT_DELAY: Partial<Record<GEvent['t'], number>> = {
  roundStart: 2200, turn: 500, dice: 1100, step: 380, coins: 300, tile: 1300, teleport: 900, back: 800,
  starBuy: 1900, minigame: 1600, roundEnd: 1800,
};

export interface MatchDeps {
  io: IO; channel: string; seed: number;
  participants: () => ParticipantInfo[];
  socketOf: (id: PlayerId) => Sock | undefined;
  /** 1 = tempo real. < 0.1 = modo rápido (testes). */
  timeScale?: number;
  humanWaitMs?: number;
  /** chamado uma vez quando a partida termina */
  onFinal?: (s: GameState) => void;
}

/** Executa uma partida inteira: ritmo, bots, minigames e quedas de conexão. O estado vive no motor puro. */
export class Match {
  state: GameState;
  private session: MinigameSession | null = null;
  private timer: NodeJS.Timeout | null = null;
  private botRng: { rng: number };
  private seq = 0;
  private disposed = false;
  private waitSince = 0;
  private finalSent = false;

  constructor(private d: MatchDeps) {
    const parts = d.participants();
    this.state = createGame({
      board: BOARD_DEF, seed: d.seed, mgIds: MINIGAME_LIST.map((m) => m.id),
      players: parts.map((p) => ({ id: p.id, slot: p.slot, name: p.name, characterId: p.characterId, isBot: p.isBot, difficulty: p.difficulty, personality: p.personality })),
    });
    this.botRng = { rng: d.seed ^ 0x9e3779b9 };
  }

  private scale() { return this.d.timeScale ?? 1; }
  private isBotDriven(pid: PlayerId) {
    const p = this.d.participants().find((x) => x.id === pid);
    return !p || p.isBot || !p.connected;
  }

  start() { this.emit([]); this.pump(0); }

  private waiting() { return awaiting(this.state); }
  private payload(events: GEvent[]): GameUpdate {
    const aw = this.waiting();
    return { seq: ++this.seq, game: publicGame(this.state), events, waiting: aw };
  }
  private emit(events: GEvent[]) { (this.d.io.to(this.d.channel) as any).emit('game:update', this.payload(events)); }
  /** Estado atual para quem entrou/voltou. */
  resync(sock: Sock) {
    sock.emit('game:update', { ...this.payload([]), events: [] });
    this.session?.resync(sock);
    // se o humano que voltou era esperado, devolve o controle e reinicia a contagem
    if (this.waiting() && !this.isBotDriven(this.waiting()!.pid)) this.pump(0);
  }

  private delayFor(events: GEvent[]) {
    let ms = 0;
    for (const e of events) ms = Math.max(ms, EVENT_DELAY[e.t] ?? 0);
    return ms * this.scale();
  }

  private schedule(ms: number, fn: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; if (!this.disposed) fn(); }, ms);
  }

  /** Decide o que fazer a seguir, depois de `delay` ms. */
  private pump(delay: number) {
    if (this.disposed) return;
    const s = this.state;
    if (s.phase === 'final') { if (!this.finalSent) { this.finalSent = true; this.d.onFinal?.(s); } return; }
    if (s.phase === 'minigame') { this.schedule(delay, () => this.runMinigame()); return; }
    const aw = this.waiting();
    if (!aw) { this.schedule(delay, () => { const ev = advance(s, BOARD_DEF); this.emit(ev); this.pump(this.delayFor(ev)); }); return; }
    const humanDown = !this.isBotDriven(aw.pid) ? false : !this.d.participants().find((p) => p.id === aw.pid)?.isBot;
    const botTurn = this.isBotDriven(aw.pid);
    let wait: number;
    if (botTurn && !humanDown) wait = (BOT_THINK[0] + Math.random() * (BOT_THINK[1] - BOT_THINK[0])) * this.scale();
    else if (botTurn) wait = (this.d.humanWaitMs ?? HUMAN_WAIT_MS) * this.scale(); // humano caído: dá um tempo para voltar
    else wait = (this.d.humanWaitMs ?? HUMAN_WAIT_MS) * 4 * this.scale() || 1; // humano presente: só um limite de segurança
    this.waitSince = Date.now();
    this.schedule(delay + wait, () => {
      const cur = awaiting(this.state);
      if (!cur || cur.pid !== aw.pid) return;
      // bot (ou humano caído / ausente por muito tempo): o bot decide por ele
      const intent = decide(this.state, BOARD_DEF, this.botRng);
      if (intent) this.apply(cur.pid, intent, true);
    });
  }

  private apply(pid: PlayerId, intent: Intent, auto = false) {
    const r = act(this.state, BOARD_DEF, pid, intent);
    if (!r.ok) { if (!auto) this.d.socketOf(pid)?.emit('game:error', r.error ?? 'Ação inválida'); return; }
    this.emit(r.events);
    this.pump(this.delayFor(r.events));
  }

  /** Entradas dos humanos (validadas pelo motor: vez, fase e caminho). */
  handle(pid: PlayerId, intent: Intent) { if (!this.disposed) this.apply(pid, intent); }
  handleInput(pid: PlayerId, seq: number, raw: unknown) { this.session?.handleInput(pid, seq, raw); }

  private runMinigame() {
    const s = this.state;
    if (s.phase !== 'minigame' || !s.mg || this.session) return;
    const def = getMinigame(s.mg.id)!;
    const seqNo = s.mg.seq;
    this.session = new MinigameSession({
      io: this.d.io, channel: this.d.channel, def, seed: this.d.seed + seqNo * 7919,
      participants: this.d.participants, socketOf: this.d.socketOf, rewardEventId: `${this.d.channel}:${seqNo}`,
      timeScale: this.scale(),
      onDone: (result, rewards) => {
        // dá tempo de ver o placar do minigame antes de voltar ao tabuleiro
        this.schedule(this.scale() < 0.1 ? 10 : 6000, () => {
          this.session = null;
          const ev = finishMinigame(this.state, result, rewards);
          this.emit(ev);
          this.pump(this.delayFor(ev));
        });
      },
    });
    this.session.start();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.session?.dispose();
  }
}
