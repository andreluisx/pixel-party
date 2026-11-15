/**
 * Motor da partida de tabuleiro. Puro e determinístico (rng dentro do estado), sem relógio e sem rede:
 * o servidor chama act() com a intenção de quem joga e advance() para cada passo automático.
 */
import type { Board } from '../board/types';
import type { MinigameResult } from '../minigame';
import { nextRandom } from '../rng';
import type { BotDifficulty, BotPersonality, PlayerId, Slot } from '../types';
import { ITEMS, ITEM_IDS, MAX_ITEMS, type ItemId } from './items';

export const TOTAL_ROUNDS = 12;
export const START_COINS = 10;
export const STAR_COST = 25;
export const SECRET_STAR_COST = 12;
export const CATCHUP_DISCOUNT = 5; // quem está 2+ estrelas atrás do líder paga menos
export const STEAL_AMOUNT = 5;
export const DUEL_STAKE = 5;
export const MAX_BONUS_PER_ROUND = 1;

export type Phase = 'round_start' | 'roll' | 'moving' | 'fork' | 'tile' | 'star_offer' | 'shop' | 'pick_die' | 'teleport' | 'duel' | 'minigame' | 'round_end' | 'final';

export interface GPlayer {
  id: PlayerId; slot: Slot; name: string; characterId: string; isBot: boolean;
  difficulty?: BotDifficulty; personality?: BotPersonality;
  tile: string; coins: number; stars: number; wins: number; steps: number; items: ItemId[]; stats: PlayerStats;
  trail: string[]; // últimas casas visitadas (a mais recente por último)
}
/** Números da jornada, usados nos prêmios da Grande Final. */
export interface PlayerStats { mgCoins: number; kills: number; itemsUsed: number; duelsWon: number }
export interface AwardResult {
  id: 'moedas' | 'cacador' | 'campeao' | 'explorador' | 'estrategista';
  title: string; desc: string; unit: string;
  values: Record<PlayerId, number>;
  /** quem levou a estrela (null = ninguém pontuou ou empate total) */
  winner: PlayerId | null;
  /** jogadores empatados no topo antes do desempate */
  tied: PlayerId[];
  /** explicação do desempate por moedas do tabuleiro, quando houve */
  tieNote: string | null;
}
export interface LogEntry { round: number; pid?: PlayerId; text: string }
export interface CoinEntry { round: number; pid: PlayerId; delta: number; reason: string; balance: number }
export interface GameState {
  rng: number;
  board: string;
  round: number; totalRounds: number;
  order: PlayerId[]; turn: number; phase: Phase;
  players: GPlayer[];
  starTile: string;
  move: { pid: PlayerId; remaining: number; prev: string | null; choices: string[]; forced: string | null } | null;
  mg: { id: string; context: 'tile' | 'round'; seq: number } | null;
  mgSeq: number; bonusUsed: number;
  mgHistory: string[];
  appliedRewards: string[];
  coinLog: CoinEntry[];
  mgIds: string[];
  mgWeights: Record<string, number>;
  final: Standing[] | null;
  // ---- Entrega 11
  itemUsed: boolean;                         // 1 item por turno
  choices: string[];                         // opções da fase atual (dados, destinos, alvos)
  offer: { kind: 'main' | 'secret' } | null;
  shopDiscount: number;
  bonusTiles: Record<string, number>;        // Chuva de Tesouros
  blocked: string[];                         // Erupção: casas bloqueadas
  extraEdges: Array<[string, string]>;       // Erupção: caminhos novos
  starDiscount: { amount: number; round: number } | null;
  secretStar: { tile: string; cost: number; round: number } | null;
  log: LogEntry[];
  // ---- Grande Final
  awards: AwardResult[] | null;
  starsBeforeAwards: Record<PlayerId, number> | null;
}
/** tie: como o empate em estrelas foi resolvido ('coins' = moedas do tabuleiro, 'wins' = minigames vencidos, 'shared' = empate total). */
export interface Standing { pid: PlayerId; rank: number; stars: number; coins: number; wins: number; boardStars?: number; awardStars?: number; tie?: 'coins' | 'wins' | 'shared' | null }

export type Intent =
  | { kind: 'roll' } | { kind: 'choose'; tile: string } | { kind: 'buy'; yes: boolean }
  | { kind: 'item'; item: ItemId; target?: PlayerId; value?: number; tile?: string }
  | { kind: 'shopBuy'; item: ItemId } | { kind: 'shopLeave' }
  | { kind: 'pickDie'; value: number } | { kind: 'teleport'; tile: string } | { kind: 'duel'; target: PlayerId | null };
export type Awaiting =
  | { pid: PlayerId; kind: 'roll' }
  | { pid: PlayerId; kind: 'fork'; choices: string[] }
  | { pid: PlayerId; kind: 'buy'; cost: number; secret: boolean }
  | { pid: PlayerId; kind: 'shop'; discount: number }
  | { pid: PlayerId; kind: 'pick_die'; options: number[] }
  | { pid: PlayerId; kind: 'teleport'; choices: string[] }
  | { pid: PlayerId; kind: 'duel'; targets: PlayerId[] };

export type GEvent =
  | { t: 'roundStart'; round: number; final: boolean; order: PlayerId[] }
  | { t: 'turn'; pid: PlayerId }
  | { t: 'dice'; pid: PlayerId; value: number }
  | { t: 'step'; pid: PlayerId; from: string; to: string; remaining: number }
  | { t: 'fork'; pid: PlayerId; choices: string[] }
  | { t: 'coins'; pid: PlayerId; delta: number; reason: string }
  | { t: 'tile'; pid: PlayerId; tile: string; type: string; msg: string }
  | { t: 'teleport'; pid: PlayerId; from: string; to: string }
  | { t: 'back'; pid: PlayerId; to: string }
  | { t: 'starBuy'; pid: PlayerId; from: string; to: string }
  | { t: 'starOffer'; pid: PlayerId }
  | { t: 'minigame'; id: string; context: 'tile' | 'round' }
  | { t: 'roundEnd'; round: number }
  | { t: 'note'; pid?: PlayerId; msg: string; tone?: 'good' | 'bad' | 'info'; big?: boolean }
  | { t: 'item'; pid: PlayerId; item: ItemId; gained: boolean }
  | { t: 'final'; standings: Standing[] };

export interface CreateOpts {
  board: Board; seed: number; mgIds: string[];
  players: Array<Pick<GPlayer, 'id' | 'slot' | 'name' | 'characterId' | 'isBot' | 'difficulty' | 'personality'>>;
  totalRounds?: number;
  mgWeights?: Record<string, number>;
}

const rnd = (s: GameState) => nextRandom(s);
const rint = (s: GameState, a: number, b: number) => Math.floor(rnd(s) * (b - a + 1)) + a;
const P = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const pick = <T,>(s: GameState, arr: T[]): T => arr[rint(s, 0, arr.length - 1)]!;
export const activePid = (s: GameState) => s.order[s.turn]!;

export function createGame(o: CreateOpts): GameState {
  const s: GameState = {
    rng: o.seed | 0, board: o.board.def.id, round: 1, totalRounds: o.totalRounds ?? TOTAL_ROUNDS,
    order: [], turn: 0, phase: 'round_start', players: [], starTile: '', move: null, mg: null, mgSeq: 0, bonusUsed: 0,
    mgHistory: [], appliedRewards: [], coinLog: [], mgIds: o.mgIds, mgWeights: o.mgWeights ?? {}, final: null,
    itemUsed: false, choices: [], offer: null, shopDiscount: 0, bonusTiles: {}, blocked: [], extraEdges: [],
    starDiscount: null, secretStar: null, log: [], awards: null, starsBeforeAwards: null,
  };
  const start = o.board.def.tiles.find((t) => t.start)!.id;
  s.players = o.players.map((p) => ({ ...p, tile: start, coins: START_COINS, stars: 0, wins: 0, steps: 0, items: [], stats: { mgCoins: 0, kills: 0, itemsUsed: 0, duelsWon: 0 }, trail: [start] }));
  const ids = s.players.map((p) => p.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = rint(s, 0, i); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
  s.order = ids;
  s.starTile = o.board.def.starSpots[rint(s, 0, o.board.def.starSpots.length - 1)]!;
  return s;
}

// ---------------------------------------------------------------- consultas
/** Vizinhos válidos a partir de uma casa: grafo do mapa + caminhos abertos, sem casas bloqueadas. */
export function nbrs(s: GameState, board: Board, id: string): string[] {
  const out = [...board.adj[id]!];
  for (const [a, b] of s.extraEdges) { if (a === id && !out.includes(b)) out.push(b); else if (b === id && !out.includes(a)) out.push(a); }
  return out.filter((n) => !s.blocked.includes(n));
}

export function starHere(s: GameState, tile: string): 'main' | 'secret' | null {
  if (tile === s.starTile) return 'main';
  if (s.secretStar && tile === s.secretStar.tile) return 'secret';
  return null;
}
/** Custo da estrela para um jogador: base, desconto de evento e ajuda para quem está bem atrás do líder. */
export function starCost(s: GameState, pid: PlayerId, kind: 'main' | 'secret' = 'main'): number {
  if (kind === 'secret') return s.secretStar?.cost ?? SECRET_STAR_COST;
  const lead = Math.max(...s.players.map((p) => p.stars));
  const catchup = lead - P(s, pid).stars >= 2 ? CATCHUP_DISCOUNT : 0;
  const ev = s.starDiscount && s.starDiscount.round === s.round ? s.starDiscount.amount : 0;
  return Math.max(10, STAR_COST - catchup - ev);
}
export function itemPrice(s: GameState, item: ItemId) { return Math.max(1, ITEMS[item].price - s.shopDiscount); }
/** Destinos de teleporte: casas de teleporte, o altar da estrela (e a estrela secreta, quando existe) e o castelo. */
export function teleportDestinations(s: GameState, board: Board, from: string): string[] {
  const start = board.def.tiles.find((t) => t.start)!.id;
  const all = [...board.def.tiles.filter((t) => t.type === 'teleport').map((t) => t.id), s.starTile, ...(s.secretStar ? [s.secretStar.tile] : []), start];
  return [...new Set(all)].filter((x) => x !== from && !s.blocked.includes(x));
}

export function awaiting(s: GameState): Awaiting | null {
  const pid = activePid(s);
  switch (s.phase) {
    case 'roll': return { pid, kind: 'roll' };
    case 'fork': return s.move ? { pid, kind: 'fork', choices: s.move.choices } : null;
    case 'star_offer': { const k = s.offer?.kind ?? 'main'; return { pid, kind: 'buy', cost: starCost(s, pid, k), secret: k === 'secret' }; }
    case 'shop': return { pid, kind: 'shop', discount: s.shopDiscount };
    case 'pick_die': return { pid, kind: 'pick_die', options: s.choices.map(Number) };
    case 'teleport': return { pid, kind: 'teleport', choices: s.choices };
    case 'duel': return { pid, kind: 'duel', targets: s.choices };
    default: return null;
  }
}
/** true se o motor segue sozinho com advance() */
export const isAuto = (s: GameState) => awaiting(s) === null && s.phase !== 'minigame' && s.phase !== 'final';

// ---------------------------------------------------------------- efeitos básicos
function note(s: GameState, ev: GEvent[], msg: string, o: { pid?: PlayerId; tone?: 'good' | 'bad' | 'info'; big?: boolean } = {}) {
  s.log.push({ round: s.round, pid: o.pid, text: msg });
  if (s.log.length > 80) s.log.shift();
  ev.push({ t: 'note', msg, ...o });
}
const nameOf = (s: GameState, id: PlayerId) => P(s, id).name;

export function addCoins(s: GameState, pid: PlayerId, delta: number, reason: string, ev?: GEvent[]): number {
  const p = P(s, pid);
  const real = Math.max(delta, -p.coins);
  p.coins += real;
  s.coinLog.push({ round: s.round, pid, delta: real, reason, balance: p.coins });
  if (real !== 0) ev?.push({ t: 'coins', pid, delta: real, reason });
  return real;
}
function giveItem(s: GameState, ev: GEvent[], pid: PlayerId, item: ItemId): boolean {
  const p = P(s, pid);
  if (p.items.length >= MAX_ITEMS) return false;
  p.items.push(item);
  ev.push({ t: 'item', pid, item, gained: true });
  return true;
}
/** Escudo bloqueia roubo ou armadilha (e é consumido). */
function shieldBlocks(s: GameState, ev: GEvent[], pid: PlayerId): boolean {
  const p = P(s, pid);
  const i = p.items.indexOf('escudo');
  if (i < 0) return false;
  p.items.splice(i, 1); p.stats.itemsUsed++;
  ev.push({ t: 'item', pid, item: 'escudo', gained: false });
  note(s, ev, `${p.name} usou o Escudo e se protegeu!`, { pid, tone: 'good' });
  return true;
}

function startMove(s: GameState, pid: PlayerId, value: number, ev: GEvent[]) {
  s.move = { pid, remaining: value, prev: null, choices: [], forced: null };
  s.phase = 'moving';
  ev.push({ t: 'dice', pid, value });
}

function moveTo(s: GameState, ev: GEvent[], pid: PlayerId, to: string, kind: 'teleport' | 'back' = 'teleport') {
  const p = P(s, pid);
  const from = p.tile;
  p.tile = to; p.trail.push(to); if (p.trail.length > 8) p.trail.shift();
  ev.push(kind === 'teleport' ? { t: 'teleport', pid, from, to } : { t: 'back', pid, to });
}

/** Depois de um teleporte: sem efeito da casa nova (evita loops), mas o altar da estrela ainda pode ser comprado. */
function afterTeleport(s: GameState, ev: GEvent[], pid: PlayerId) {
  const p = P(s, pid);
  s.move = null;
  const k = starHere(s, p.tile);
  if (k && p.coins >= starCost(s, pid, k)) { s.offer = { kind: k }; s.phase = 'star_offer'; ev.push({ t: 'starOffer', pid }); return; }
  nextTurn(s, ev);
}

function buyStar(s: GameState, board: Board, pid: PlayerId, ev: GEvent[]) {
  const p = P(s, pid);
  const kind = s.offer?.kind ?? starHere(s, p.tile);
  if (!kind || starHere(s, p.tile) !== kind) return;
  const cost = starCost(s, pid, kind);
  if (p.coins < cost) return;
  addCoins(s, pid, -cost, 'estrela', ev);
  p.stars++;
  const from = p.tile;
  if (kind === 'secret') {
    s.secretStar = null;
    ev.push({ t: 'starBuy', pid, from, to: from });
    note(s, ev, `${p.name} achou a estrela secreta!`, { pid, tone: 'good' });
    return;
  }
  const spots = board.def.starSpots.filter((x) => x !== from);
  const far = spots.filter((x) => board.dist(x, p.tile) >= 5);
  const pool = far.length ? far : [[...spots].sort((a, b) => board.dist(b, p.tile) - board.dist(a, p.tile))[0]!];
  s.starTile = pick(s, pool);
  ev.push({ t: 'starBuy', pid, from, to: s.starTile });
  note(s, ev, `${p.name} comprou a estrela por ${cost} moedas!`, { pid, tone: 'good' });
}

function nextTurn(s: GameState, ev: GEvent[]) {
  s.move = null; s.offer = null; s.choices = []; s.itemUsed = false; s.shopDiscount = 0;
  s.turn++;
  if (s.turn >= s.order.length) { s.phase = 'round_end'; return; }
  s.phase = 'roll';
  ev.push({ t: 'turn', pid: activePid(s) });
}

// ---------------------------------------------------------------- ações dos jogadores
const KIND_OK: Record<Awaiting['kind'], Intent['kind'][]> = {
  roll: ['roll', 'item'], fork: ['choose'], buy: ['buy'], shop: ['shopBuy', 'shopLeave'], pick_die: ['pickDie'], teleport: ['teleport'], duel: ['duel'],
};

/** Intenção de um jogador. Valida vez, fase, item, alvo e caminho; o valor dos dados é sorteado aqui (servidor). */
export function act(s: GameState, board: Board, pid: PlayerId, intent: Intent): { ok: boolean; error?: string; events: GEvent[] } {
  const ev: GEvent[] = [];
  const bad = (error: string) => ({ ok: false, error, events: ev });
  const aw = awaiting(s);
  if (!aw) return bad('Agora não é hora de agir');
  if (aw.pid !== pid) return bad('Não é a sua vez');
  if (!KIND_OK[aw.kind].includes(intent.kind)) return bad('Ação inválida agora');
  const p = P(s, pid);

  switch (intent.kind) {
    case 'roll': startMove(s, pid, rint(s, 1, 6), ev); break;
    case 'choose':
      if (aw.kind !== 'fork' || !aw.choices.includes(intent.tile)) return bad('Caminho inválido');
      s.move!.forced = intent.tile; s.phase = 'moving'; break;
    case 'buy':
      if (intent.yes) buyStar(s, board, pid, ev);
      s.offer = null;
      if (s.move && s.move.remaining > 0) s.phase = 'moving'; // estava só passando pelo altar: segue o caminho
      else nextTurn(s, ev);
      break;
    case 'item': {
      if (s.itemUsed) return bad('Só dá para usar 1 item por turno');
      const it = ITEMS[intent.item];
      if (!it || !p.items.includes(intent.item)) return bad('Você não tem esse item');
      if (it.passive) return bad('O Escudo funciona sozinho quando necessário');
      const consume = () => { p.items.splice(p.items.indexOf(intent.item), 1); p.stats.itemsUsed++; s.itemUsed = true; ev.push({ t: 'item', pid, item: intent.item, gained: false }); };
      if (intent.item === 'dado') {
        const v = Number(intent.value);
        if (!Number.isInteger(v) || v < 1 || v > 3) return bad('Escolha um valor de 1 a 3');
        consume(); note(s, ev, `${p.name} usou o Dado Especial: ${v}`, { pid, tone: 'info' }); startMove(s, pid, v, ev);
      } else if (intent.item === 'cogumelo') {
        consume(); const a = rint(s, 1, 6), b = rint(s, 1, 6);
        s.choices = [String(a), String(b)]; s.phase = 'pick_die';
        note(s, ev, `${p.name} usou o Cogumelo Veloz: ${a} e ${b}`, { pid, tone: 'info' });
      } else if (intent.item === 'ima') {
        const t = s.players.find((x) => x.id === intent.target);
        if (!t || t.id === pid) return bad('Escolha um adversário');
        if (t.coins <= 0) return bad('Esse jogador não tem moedas');
        consume();
        if (shieldBlocks(s, ev, t.id)) note(s, ev, `O roubo de ${p.name} foi bloqueado`, { pid, tone: 'bad' });
        else { const n = Math.min(STEAL_AMOUNT, t.coins); addCoins(s, t.id, -n, 'roubo', ev); addCoins(s, pid, n, 'roubo', ev); note(s, ev, `${p.name} roubou ${n} moedas de ${t.name}!`, { pid, tone: 'good' }); }
      } else if (intent.item === 'pocao') {
        const dests = teleportDestinations(s, board, p.tile);
        if (!intent.tile || !dests.includes(intent.tile)) return bad('Destino de teleporte inválido');
        consume(); note(s, ev, `${p.name} bebeu a Poção de Teleporte`, { pid, tone: 'info' });
        moveTo(s, ev, pid, intent.tile); afterTeleport(s, ev, pid);
      }
      break;
    }
    case 'pickDie': {
      if (!s.choices.includes(String(intent.value))) return bad('Valor inválido');
      s.choices = []; startMove(s, pid, intent.value, ev); break;
    }
    case 'shopBuy': {
      const price = itemPrice(s, intent.item);
      if (!ITEMS[intent.item]) return bad('Item inexistente');
      if (p.items.length >= MAX_ITEMS) return bad('Você já carrega 2 itens');
      if (p.coins < price) return bad('Moedas insuficientes');
      addCoins(s, pid, -price, 'loja', ev); giveItem(s, ev, pid, intent.item);
      note(s, ev, `${p.name} comprou ${ITEMS[intent.item].name}`, { pid, tone: 'info' });
      break;
    }
    case 'shopLeave': nextTurn(s, ev); break;
    case 'teleport': {
      if (!s.choices.includes(intent.tile)) return bad('Destino inválido');
      if (intent.tile === p.tile) { nextTurn(s, ev); break; }
      moveTo(s, ev, pid, intent.tile); afterTeleport(s, ev, pid); break;
    }
    case 'duel': {
      if (intent.target === null) { note(s, ev, `${p.name} recusou o duelo`, { pid, tone: 'info' }); nextTurn(s, ev); break; }
      if (!s.choices.includes(intent.target)) return bad('Adversário inválido');
      duel(s, ev, pid, intent.target); nextTurn(s, ev); break;
    }
  }
  return { ok: true, events: ev };
}

/** Duelo de dados: maior número ganha até 5 moedas do outro. Empate repete até 3 vezes. */
function duel(s: GameState, ev: GEvent[], a: PlayerId, b: PlayerId) {
  let ra = 0, rb = 0;
  for (let i = 0; i < 3 && ra === rb; i++) { ra = rint(s, 1, 6); rb = rint(s, 1, 6); }
  const A = P(s, a), B = P(s, b);
  if (ra === rb) { note(s, ev, `Duelo ${A.name} ${ra} x ${rb} ${B.name}: empate!`, { pid: a, tone: 'info' }); return; }
  const [w, l] = ra > rb ? [A, B] : [B, A];
  w.stats.duelsWon++;
  const n = Math.min(DUEL_STAKE, l.coins);
  addCoins(s, l.id, -n, 'duelo', ev); addCoins(s, w.id, n, 'duelo', ev);
  note(s, ev, `Duelo ${A.name} ${ra} x ${rb} ${B.name}: ${w.name} ganha ${n} moedas!`, { pid: w.id, tone: 'good' });
}

// ---------------------------------------------------------------- minigame, eventos e passos automáticos
export function pickMinigame(s: GameState): string {
  const prev = s.mgHistory[s.mgHistory.length - 1];
  const cand = s.mgIds.filter((id) => id !== prev);
  const pool = cand.length ? cand : s.mgIds;
  const w = pool.map((id) => (s.mgWeights[id] ?? 1) * Math.pow(0.35, s.mgHistory.filter((h) => h === id).length));
  let r = rnd(s) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]!; if (r <= 0) return pool[i]!; }
  return pool[pool.length - 1]!;
}

function startMinigame(s: GameState, context: 'tile' | 'round', ev: GEvent[]) {
  const id = pickMinigame(s);
  s.mgHistory.push(id);
  s.mg = { id, context, seq: ++s.mgSeq };
  s.phase = 'minigame';
  ev.push({ t: 'minigame', id, context });
}

/** Eventos aleatórios da casa de evento. Devolve true se o evento abriu uma fase própria (loja). */
function randomEvent(s: GameState, board: Board, pid: PlayerId, ev: GEvent[]): boolean {
  const p = P(s, pid);
  const kinds = ['mercador', 'bau', 'troca', 'barata', 'teleporte', 'inesperada', 'armadilha', 'sorte'] as const;
  const k = pick(s, [...kinds]);
  const say = (m: string, tone: 'good' | 'bad' | 'info' = 'info') => note(s, ev, `Evento: ${m}`, { pid, tone });
  switch (k) {
    case 'mercador': say('um comerciante misterioso abre a loja com desconto!'); s.shopDiscount = 2; s.phase = 'shop'; return true;
    case 'bau': {
      if (rnd(s) < 0.5 && p.items.length < MAX_ITEMS) { const it = pick(s, ITEM_IDS); giveItem(s, ev, pid, it); say(`baú com ${ITEMS[it].name}!`, 'good'); }
      else { const v = rint(s, 4, 8); addCoins(s, pid, v, 'baú', ev); say(`baú com ${v} moedas!`, 'good'); }
      return false;
    }
    case 'troca': {
      const others = s.players.filter((x) => x.id !== pid);
      const o = pick(s, others);
      const diff = o.coins - p.coins;
      const n = Math.min(10, Math.abs(diff)); // limite: um evento não decide o jogo
      if (n === 0) { say(`troca de moedas com ${o.name}: nada mudou`); return false; }
      const dir = Math.sign(diff);
      addCoins(s, pid, dir * n, 'troca', ev); addCoins(s, o.id, -dir * n, 'troca', ev);
      say(`troca de moedas com ${o.name}: ${dir > 0 ? '+' : '-'}${n}`, dir > 0 ? 'good' : 'bad'); return false;
    }
    case 'barata': s.starDiscount = { amount: 8, round: s.round }; say('a estrela está mais barata até o fim da rodada!', 'good'); return false;
    case 'teleporte': {
      const dests = teleportDestinations(s, board, p.tile);
      const to = pick(s, dests); say('teletransporte surpresa!'); moveTo(s, ev, pid, to); s.phase = 'tile'; s.move = null;
      // chega sem efeito da casa nova (só pode comprar a estrela)
      afterTeleport(s, ev, pid); return true;
    }
    case 'inesperada': { const v = rint(s, 3, 6); addCoins(s, pid, v, 'recompensa', ev); say(`recompensa inesperada: +${v}`, 'good'); return false; }
    case 'armadilha':
      if (shieldBlocks(s, ev, pid)) return false;
      addCoins(s, pid, -4, 'evento', ev); say('armadilha! -4 moedas', 'bad'); return false;
    case 'sorte': addCoins(s, pid, 6, 'sorte', ev); say('dia de sorte! +6', 'good'); return false;
  }
}

/** Eventos especiais das rodadas 3, 6 e 9 e limpeza dos efeitos temporários. */
function roundSpecials(s: GameState, board: Board, ev: GEvent[]) {
  if (s.round > 3 && Object.keys(s.bonusTiles).length) s.bonusTiles = {};
  if (s.round > 7 && (s.blocked.length || s.extraEdges.length)) { s.blocked = []; s.extraEdges = []; note(s, ev, 'O vulcão se acalmou: os caminhos voltam ao normal', { tone: 'info' }); }
  if (s.secretStar && s.secretStar.round < s.round) { s.secretStar = null; }
  if (s.round === 3) {
    const cand = board.def.tiles.filter((t) => ['blue', 'red', 'event', 'minigame'].includes(t.type) && !t.start).map((t) => t.id);
    for (let i = 0; i < 6 && cand.length; i++) s.bonusTiles[cand.splice(rint(s, 0, cand.length - 1), 1)[0]!] = 4;
    note(s, ev, 'CHUVA DE TESOUROS! Casas com brilho dão +4 moedas extras', { tone: 'good', big: true });
  } else if (s.round === 6) {
    s.blocked = board.def.tiles.filter((t) => t.region === 'porto').map((t) => t.id);
    s.extraEdges = [['S2', 'R12'], ['A3', 'L2']];
    for (const p of s.players) if (s.blocked.includes(p.tile)) { const to = board.adj[p.tile]!.find((n) => !s.blocked.includes(n)) ?? 'R00'; moveTo(s, ev, p.id, to, 'back'); }
    note(s, ev, 'ERUPÇÃO VULCÂNICA! O porto está bloqueado e novos caminhos se abriram (rodadas 6 e 7)', { tone: 'bad', big: true });
  } else if (s.round === s.totalRounds) {
    note(s, ev, 'ÚLTIMA RODADA! Depois dela, a Grande Final premia a jornada de cada um com estrelas', { tone: 'info', big: true });
  } else if (s.round === 9) {
    const o = rint(s, 0, 2);
    if (o === 0) {
      const ps = s.order.map((id) => P(s, id)); const tiles = ps.map((p) => p.tile);
      ps.forEach((p, i) => { const to = tiles[(i + 1) % ps.length]!; if (to !== p.tile) moveTo(s, ev, p.id, to); });
      note(s, ev, 'PORTAL MISTERIOSO! Os jogadores trocaram de lugar', { tone: 'info', big: true });
    } else if (o === 1) {
      for (const p of s.players) if (!giveItem(s, ev, p.id, pick(s, ITEM_IDS))) addCoins(s, p.id, 3, 'portal', ev);
      note(s, ev, 'PORTAL MISTERIOSO! Todos encontraram um item (ou 3 moedas)', { tone: 'good', big: true });
    } else {
      const spots = board.def.starSpots.filter((x) => x !== s.starTile);
      s.secretStar = { tile: pick(s, spots), cost: SECRET_STAR_COST, round: s.round };
      note(s, ev, `PORTAL MISTERIOSO! Uma estrela secreta (${SECRET_STAR_COST} moedas) apareceu num altar, só nesta rodada`, { tone: 'good', big: true });
    }
  }
}

/** Um passo automático. Devolve os eventos para o cliente animar. */
export function advance(s: GameState, board: Board): GEvent[] {
  const ev: GEvent[] = [];
  switch (s.phase) {
    case 'round_start': {
      s.turn = 0; s.bonusUsed = 0; s.itemUsed = false; s.phase = 'roll';
      ev.push({ t: 'roundStart', round: s.round, final: s.round === s.totalRounds, order: [...s.order] });
      roundSpecials(s, board, ev);
      ev.push({ t: 'turn', pid: activePid(s) });
      break;
    }
    case 'moving': {
      const m = s.move!; const p = P(s, m.pid);
      if (m.remaining <= 0) { s.phase = 'tile'; break; }
      let choices = nbrs(s, board, p.tile).filter((n) => n !== m.prev);
      if (!choices.length) choices = nbrs(s, board, p.tile);
      if (!choices.length) choices = [...board.adj[p.tile]!]; // caso extremo: ignora bloqueios
      let to = m.forced;
      m.forced = null;
      if (to && !choices.includes(to)) to = null;
      if (!to) {
        if (choices.length > 1) { m.choices = choices; s.phase = 'fork'; ev.push({ t: 'fork', pid: m.pid, choices }); break; }
        to = choices[0]!;
      }
      const from = p.tile;
      p.tile = to; p.steps++; m.prev = from; m.remaining--;
      p.trail.push(to); if (p.trail.length > 8) p.trail.shift();
      ev.push({ t: 'step', pid: m.pid, from, to, remaining: m.remaining });
      if (m.remaining === 0) { s.phase = 'tile'; break; }
      const k = starHere(s, p.tile);
      if (k && p.coins >= starCost(s, p.id, k)) { s.offer = { kind: k }; s.phase = 'star_offer'; ev.push({ t: 'starOffer', pid: p.id }); } // passou pelo altar com moedas
      break;
    }
    case 'tile': {
      const p = P(s, activePid(s)); const t = board.byId[p.tile]!;
      const msg = (m: string) => ev.push({ t: 'tile', pid: p.id, tile: t.id, type: t.type, msg: m });
      let after: 'next' | 'star' | 'mg' = 'next';
      let own = false; // a casa abriu uma fase própria
      const bonus = s.bonusTiles[t.id];
      if (bonus) { delete s.bonusTiles[t.id]; addCoins(s, p.id, bonus, 'tesouros', ev); note(s, ev, `${p.name} achou um brilho: +${bonus}`, { pid: p.id, tone: 'good' }); }
      switch (t.type) {
        case 'blue': addCoins(s, p.id, 3, 'casa azul', ev); msg('+3 moedas'); break;
        case 'red': addCoins(s, p.id, -3, 'casa vermelha', ev); msg('-3 moedas'); break;
        case 'treasure': { const v = rint(s, 5, 15); addCoins(s, p.id, v, 'tesouro', ev); msg('Tesouro!'); break; }
        case 'trap':
          if (shieldBlocks(s, ev, p.id)) { msg('Armadilha bloqueada!'); break; }
          if (rnd(s) < 0.5) { addCoins(s, p.id, -3, 'armadilha', ev); msg('Armadilha! -3'); }
          else {
            const idx = Math.max(0, p.trail.length - 3);
            const to = p.trail[idx]!;
            p.trail = p.trail.slice(0, idx + 1); p.tile = to;
            msg('Armadilha! Volta 2'); ev.push({ t: 'back', pid: p.id, to });
          }
          break;
        case 'teleport': {
          const dests = teleportDestinations(s, board, p.tile);
          s.choices = [p.tile, ...dests]; s.phase = 'teleport'; own = true; msg('Teleporte: escolha o destino'); break;
        }
        case 'event': msg('Casa de evento!'); own = randomEvent(s, board, p.id, ev); break;
        case 'shop': s.shopDiscount = 0; s.phase = 'shop'; own = true; msg('Loja!'); break;
        case 'duel': {
          const targets = s.players.filter((x) => x.id !== p.id && x.coins > 0).map((x) => x.id);
          if (targets.length) { s.choices = targets; s.phase = 'duel'; own = true; msg('Duelo! Escolha o adversário'); } else msg('Ninguém para duelar');
          break;
        }
        case 'minigame':
          if (s.bonusUsed < MAX_BONUS_PER_ROUND) { s.bonusUsed++; msg('Minigame extra!'); after = 'mg'; } else msg('Já teve minigame extra');
          break;
        case 'star': {
          const k = starHere(s, t.id);
          if (k && p.coins >= starCost(s, p.id, k)) { msg(`A estrela! ${starCost(s, p.id, k)} moedas`); s.offer = { kind: k }; after = 'star'; }
          else msg(k ? 'Faltam moedas para a estrela' : 'Altar sem estrela');
          break;
        }
      }
      if (own) { if (s.phase === 'tile') nextTurn(s, ev); break; } // (se o evento já terminou o turno por conta própria, não repete)
      if (after === 'star') { s.phase = 'star_offer'; ev.push({ t: 'starOffer', pid: p.id }); }
      else if (after === 'mg') { s.move = null; startMinigame(s, 'tile', ev); }
      else nextTurn(s, ev);
      break;
    }
    case 'round_end': {
      ev.push({ t: 'roundEnd', round: s.round });
      if (s.round >= s.totalRounds) finalize(s, ev); // a Grande Final é uma cerimônia de prêmios, não um minigame
      else startMinigame(s, 'round', ev);
      break;
    }
    default: break;
  }
  return ev;
}

/** Aplica o resultado do minigame (idempotente por sequência) e segue o fluxo. */
export function finishMinigame(s: GameState, result: MinigameResult, rewards: Record<PlayerId, number>): GEvent[] {
  const ev: GEvent[] = [];
  if (s.phase !== 'minigame' || !s.mg) return ev;
  const key = `mg-${s.mg.seq}`;
  if (s.appliedRewards.includes(key)) return ev;
  s.appliedRewards.push(key);
  for (const p of s.players) { const r = rewards[p.id] ?? 0; addCoins(s, p.id, r, 'minigame', ev); p.stats.mgCoins += Math.max(0, r); }
  if (result.kind === 'ranking') {
    for (const e of result.ranking) if (e.rank === 1) P(s, e.playerId).wins++;
    for (const [id, k] of Object.entries(result.kills ?? {})) { const pl = s.players.find((x) => x.id === id); if (pl) pl.stats.kills += Math.max(0, Math.floor(k)); }
  }
  const ctx = s.mg.context;
  s.mg = null;
  if (ctx === 'tile') { nextTurn(s, ev); return ev; }
  if (s.round >= s.totalRounds) finalize(s, ev);
  else {
    s.round++; s.order.push(s.order.shift()!); s.phase = 'round_start';
  }
  return ev;
}

const AWARD_DEFS: Array<{ id: AwardResult['id']; title: string; desc: string; unit: string; one: string; of: (p: GPlayer) => number }> = [
  { id: 'moedas', title: 'Rei das Moedas', desc: 'Mais moedas ganhas nos minigames', unit: 'moedas', one: 'moeda', of: (p) => p.stats.mgCoins },
  { id: 'cacador', title: 'Caçador', desc: 'Mais jogadores eliminados nos minigames', unit: 'abates', one: 'abate', of: (p) => p.stats.kills },
  { id: 'campeao', title: 'Campeão dos Minigames', desc: 'Mais minigames vencidos', unit: 'vitórias', one: 'vitória', of: (p) => p.wins },
  { id: 'explorador', title: 'Grande Explorador', desc: 'Mais casas percorridas no tabuleiro', unit: 'casas', one: 'casa', of: (p) => p.steps },
  { id: 'estrategista', title: 'Estrategista', desc: 'Mais itens usados', unit: 'itens', one: 'item', of: (p) => p.stats.itemsUsed },
];

/** Cada prêmio dá 1 estrela. Empate no topo: desempate por moedas do tabuleiro (e fica explicado); empate total: ninguém leva. */
export function computeAwards(s: GameState): AwardResult[] {
  return AWARD_DEFS.map((d) => {
    const values: Record<PlayerId, number> = {};
    for (const p of s.players) values[p.id] = d.of(p);
    const top = Math.max(...Object.values(values));
    const tied = top > 0 ? s.players.filter((p) => values[p.id] === top).map((p) => p.id) : [];
    let winner: PlayerId | null = null; let tieNote: string | null = null;
    if (tied.length === 1) winner = tied[0]!;
    else if (tied.length > 1) {
      const maxCoins = Math.max(...tied.map((id) => P(s, id).coins));
      const u = top === 1 ? d.one : d.unit;
      const best = tied.filter((id) => P(s, id).coins === maxCoins);
      const names = tied.map((id) => `${P(s, id).name} (${P(s, id).coins})`).join(' x ');
      if (best.length === 1) { winner = best[0]!; tieNote = `Empate em ${top} ${u}! Desempate por moedas do tabuleiro: ${names}`; }
      else tieNote = `Empate total em ${top} ${u} e nas moedas do tabuleiro (${names}): ninguém leva esta estrela`;
    }
    return { id: d.id, title: d.title, desc: d.desc, unit: d.unit, values, winner, tied, tieNote };
  });
}

/** Encerra a partida: entrega as estrelas dos prêmios e fecha o ranking. */
function finalize(s: GameState, ev: GEvent[]) {
  s.starsBeforeAwards = Object.fromEntries(s.players.map((p) => [p.id, p.stars]));
  s.awards = computeAwards(s);
  for (const a of s.awards) if (a.winner) P(s, a.winner).stars++;
  s.final = standings(s);
  s.phase = 'final';
  ev.push({ t: 'final', standings: s.final });
}

/** Ranking: estrelas; empate em estrelas: moedas do tabuleiro; depois minigames vencidos; igual em tudo divide a colocação. */
export function standings(s: GameState): Standing[] {
  const before = s.starsBeforeAwards;
  const arr: Standing[] = s.players.map((p) => ({ pid: p.id, stars: p.stars, coins: p.coins, wins: p.wins, rank: 0, boardStars: before ? before[p.id] : p.stars, awardStars: before ? p.stars - before[p.id]! : 0, tie: null }));
  const key = (x: Standing) => [x.stars, x.coins, x.wins];
  arr.sort((a, b) => { const A = key(a), B = key(b); for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return B[i]! - A[i]!; return 0; });
  arr.forEach((x, i) => {
    const prev = arr[i - 1];
    x.rank = prev && key(prev).join() === key(x).join() ? prev.rank : i + 1;
  });
  // como cada empate em estrelas foi resolvido
  for (const x of arr) {
    const same = arr.filter((y) => y.stars === x.stars);
    if (same.length < 2) continue;
    const coinsDiffer = new Set(same.map((y) => y.coins)).size > 1;
    const winsDiffer = new Set(same.map((y) => y.wins)).size > 1;
    x.tie = coinsDiffer ? 'coins' : winsDiffer ? 'wins' : 'shared';
  }
  return arr;
}

/** Estado enviado aos clientes (sem a semente do sorteio). */
export function publicGame(s: GameState): Omit<GameState, 'rng' | 'coinLog' | 'appliedRewards'> & { coinLog: CoinEntry[] } {
  const { rng: _r, appliedRewards: _a, ...rest } = s;
  return { ...rest, coinLog: s.coinLog.slice(-40), log: s.log.slice(-30) };
}
