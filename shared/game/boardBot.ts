import type { Board, TileType } from '../board/types';
import { nextRandom } from '../rng';
import type { BotDifficulty, BotPersonality } from '../types';
import { ITEMS, MAX_ITEMS, type ItemId } from './items';
import { awaiting, itemPrice, nbrs, starCost, type GameState, type GPlayer, type Intent } from './engine';

const BASE: Record<TileType, number> = { blue: 3, red: -3, treasure: 6, trap: -2, teleport: 1, event: 1, shop: 0.5, duel: 1, minigame: 1.5, star: 0 };
const PERS: Record<BotPersonality, Partial<Record<TileType, number>>> = {
  collector: { blue: 2, treasure: 3 },
  aggressive: { duel: 4, minigame: 3 },
  careful: { red: -4, trap: -5 },
  gambler: { event: 4, treasure: 2, teleport: 3, trap: 1 },
};
/** Preferência de compra por personalidade (maior = mais quer). */
const SHOP_PREF: Record<BotPersonality, Record<ItemId, number>> = {
  collector: { escudo: 5, dado: 4, cogumelo: 3, pocao: 2, ima: 1 },
  aggressive: { ima: 5, escudo: 3, cogumelo: 3, dado: 2, pocao: 1 },
  careful: { escudo: 6, dado: 4, cogumelo: 2, pocao: 2, ima: 1 },
  gambler: { pocao: 5, cogumelo: 4, ima: 3, dado: 2, escudo: 1 },
};
const RANDOMNESS: Record<BotDifficulty, number> = { easy: 0.4, medium: 0.15, hard: 0.03 };
type Rng = { rng: number };
const r = (g: Rng) => nextRandom(g);
const pickOf = <T,>(g: Rng, a: T[]) => a[Math.floor(r(g) * a.length)]!;

/** Decide pela vez; usa só o estado público. Sempre devolve uma intenção válida. */
export function decide(s: GameState, board: Board, rng: Rng): Intent | null {
  const aw = awaiting(s);
  if (!aw) return null;
  const p = s.players.find((x) => x.id === aw.pid)!;
  const pers = p.personality ?? 'collector';
  const rand = RANDOMNESS[p.difficulty ?? 'medium'];
  const goal = (): string | null => (p.coins >= starCost(s, p.id) ? s.starTile : null);

  switch (aw.kind) {
    case 'roll': return decideRoll(s, board, p, pers, rng) ?? { kind: 'roll' };
    case 'buy': return { kind: 'buy', yes: true }; // só é oferecido com moedas suficientes
    case 'shop': return decideShop(s, p, pers, rng, aw.discount);
    case 'pick_die': return { kind: 'pickDie', value: bestValue(s, board, p, aw.options, goal(), rng) };
    case 'teleport': {
      if (r(rng) < rand) return { kind: 'teleport', tile: pickOf(rng, aw.choices) };
      const g = goal();
      if (g && aw.choices.includes(g)) return { kind: 'teleport', tile: g };
      if (pers === 'gambler') return { kind: 'teleport', tile: pickOf(rng, aw.choices) };
      return { kind: 'teleport', tile: p.tile }; // ficar onde está
    }
    case 'duel': {
      const rich = [...aw.targets].sort((a, b) => coinsOf(s, b) - coinsOf(s, a))[0]!;
      const want = pers === 'aggressive' || pers === 'gambler' || p.coins >= 8;
      return { kind: 'duel', target: want ? rich : null };
    }
    case 'fork': {
      if (r(rng) < rand) return { kind: 'choose', tile: pickOf(rng, aw.choices) };
      return { kind: 'choose', tile: bestFork(s, board, p, pers, aw.choices, rng) };
    }
  }
}

const coinsOf = (s: GameState, id: string) => s.players.find((x) => x.id === id)!.coins;

/** Antes de rolar: usa um item quando compensa (no máximo 1 por turno, como o motor exige). */
function decideRoll(s: GameState, board: Board, p: GPlayer, pers: BotPersonality, rng: Rng): Intent | null {
  if (s.itemUsed || !p.items.length) return null;
  const g = p.coins >= starCost(s, p.id) ? s.starTile : null;
  const has = (i: ItemId) => p.items.includes(i);
  const rich = s.players.filter((x) => x.id !== p.id && x.coins >= 8).sort((a, b) => b.coins - a.coins)[0];
  if (has('ima') && rich && (pers === 'aggressive' || r(rng) < 0.5)) return { kind: 'item', item: 'ima', target: rich.id };
  if (g && has('pocao') && board.dist(p.tile, g) > 6) {
    const dests = [g, ...board.def.tiles.filter((t) => t.type === 'teleport').map((t) => t.id)].filter((x) => x !== p.tile);
    const best = dests.sort((a, b) => board.dist(a, g) - board.dist(b, g))[0];
    if (best && board.dist(best, g) < board.dist(p.tile, g) - 3) return { kind: 'item', item: 'pocao', tile: best };
  }
  if (g && has('dado') && board.dist(p.tile, g) <= 3) return { kind: 'item', item: 'dado', value: Math.max(1, Math.min(3, board.dist(p.tile, g))) };
  if (g && has('cogumelo') && board.dist(p.tile, g) <= 12) return { kind: 'item', item: 'cogumelo' };
  if (has('cogumelo') && pers === 'gambler' && r(rng) < 0.3) return { kind: 'item', item: 'cogumelo' };
  return null;
}

/** Escolhe o melhor valor entre opções de dado: perto da estrela se der pra comprar, senão o maior. */
function bestValue(s: GameState, board: Board, p: GPlayer, options: number[], goal: string | null, rng: Rng): number {
  if (goal) {
    const d = board.dist(p.tile, goal);
    const exact = options.find((o) => o === d);
    if (exact) return exact;
    const under = options.filter((o) => o <= d);
    if (under.length) return Math.max(...under);
  }
  void rng;
  return Math.max(...options);
}

function decideShop(s: GameState, p: GPlayer, pers: BotPersonality, rng: Rng, _discount: number): Intent {
  // com moedas para a estrela, guarda tudo; senão compra o item preferido que couber (sobrando pelo menos 3)
  if (p.items.length >= MAX_ITEMS || p.coins >= starCost(s, p.id) || r(rng) < 0.35) return { kind: 'shopLeave' };
  const opts = (Object.keys(ITEMS) as ItemId[])
    .filter((i) => itemPrice(s, i) <= p.coins - 3 && !p.items.includes(i))
    .sort((a, b) => SHOP_PREF[pers][b] - SHOP_PREF[pers][a]);
  return opts.length ? { kind: 'shopBuy', item: opts[0]! } : { kind: 'shopLeave' };
}

function bestFork(s: GameState, board: Board, p: GPlayer, pers: BotPersonality, choices: string[], rng: Rng): string {
  const reach = s.move?.remaining ?? 1;
  let best = choices[0]!, bestScore = -Infinity;
  for (const c of choices) {
    let score = 0; let frontier = [{ id: c, prev: p.tile }];
    for (let d = 0; d < Math.min(reach, 4) && frontier.length; d++) {
      const nxt: typeof frontier = [];
      for (const f of frontier) {
        const t = board.byId[f.id]!;
        const w = (BASE[t.type] + (PERS[pers][t.type] ?? 0) + (s.bonusTiles[f.id] ?? 0)) / (d + 1);
        score += w;
        if (f.id === s.starTile && p.coins >= starCost(s, p.id)) score += pers === 'collector' ? 12 : 8;
        for (const n of nbrs(s, board, f.id)) if (n !== f.prev) nxt.push({ id: n, prev: f.id });
      }
      frontier = nxt.slice(0, 12);
    }
    if (p.coins >= starCost(s, p.id)) score -= board.dist(c, s.starTile) * (pers === 'collector' ? 1.5 : 0.8);
    score += r(rng) * 0.5;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}
