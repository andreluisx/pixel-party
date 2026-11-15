import { describe, expect, it } from 'vitest';
import { buildBoard } from '../shared/board/board';
import { REINO_DO_CASTELO } from '../shared/board/maps/reino-do-castelo';
import { act, advance, awaiting, createGame, finishMinigame, activePid, starCost, STAR_COST, nbrs, type GameState } from '../shared/game/engine';
import { decide } from '../shared/game/boardBot';
import { ITEMS, MAX_ITEMS } from '../shared/game/items';
import { MINIGAME_LIST } from '../shared/minigames';

const board = buildBoard(REINO_DO_CASTELO);
const mgIds = MINIGAME_LIST.map((m) => m.id);
const players = () => [0, 1, 2, 3].map((i) => ({ id: `p${i}`, slot: i as 0 | 1 | 2 | 3, name: `J${i}`, characterId: 'c', isBot: true, difficulty: 'medium' as const, personality: (['collector', 'aggressive', 'careful', 'gambler'] as const)[i] }));
const mk = (seed = 1) => { const s = createGame({ board, seed, mgIds, players: players() }); advance(s, board); return s; };
const me = (s: GameState) => s.players.find((p) => p.id === activePid(s))!;
const other = (s: GameState) => s.players.find((p) => p.id !== activePid(s))!;

describe('Entrega 11: itens', () => {
  it('estrela custa 25', () => expect(STAR_COST).toBe(25));
  it('Dado Especial: só 1 a 3 e consome o item', () => {
    const s = mk(); const p = me(s); p.items = ['dado'];
    expect(act(s, board, p.id, { kind: 'item', item: 'dado', value: 5 }).ok).toBe(false);
    expect(act(s, board, p.id, { kind: 'item', item: 'dado', value: 2 }).ok).toBe(true);
    expect(p.items).toEqual([]); expect(s.move!.remaining).toBe(2); expect(s.phase).toBe('moving');
  });
  it('Cogumelo: dois dados e escolha entre eles', () => {
    const s = mk(2); const p = me(s); p.items = ['cogumelo'];
    expect(act(s, board, p.id, { kind: 'item', item: 'cogumelo' }).ok).toBe(true);
    const aw = awaiting(s)!; expect(aw.kind).toBe('pick_die');
    const opts = (aw as { options: number[] }).options;
    expect(act(s, board, p.id, { kind: 'pickDie', value: 99 }).ok).toBe(false);
    expect(act(s, board, p.id, { kind: 'pickDie', value: opts[1]! }).ok).toBe(true);
    expect(s.move!.remaining).toBe(opts[1]);
  });
  it('Ímã rouba 5, Escudo bloqueia e é consumido', () => {
    const s = mk(3); const p = me(s); const o = other(s); p.items = ['ima']; const a = p.coins, b = o.coins;
    expect(act(s, board, p.id, { kind: 'item', item: 'ima', target: p.id }).ok).toBe(false);
    expect(act(s, board, p.id, { kind: 'item', item: 'ima', target: o.id }).ok).toBe(true);
    expect(p.coins).toBe(a + 5); expect(o.coins).toBe(b - 5); expect(s.phase).toBe('roll');
    // 1 item por turno
    p.items = ['ima'];
    expect(act(s, board, p.id, { kind: 'item', item: 'ima', target: o.id }).ok).toBe(false);
    const s2 = mk(3); const p2 = me(s2); const o2 = other(s2); p2.items = ['ima']; o2.items = ['escudo'];
    act(s2, board, p2.id, { kind: 'item', item: 'ima', target: o2.id });
    expect(o2.items).toEqual([]); expect(o2.coins).toBe(10);
  });
  it('Escudo não é usado à mão; item que não tenho é recusado', () => {
    const s = mk(4); const p = me(s); p.items = ['escudo'];
    expect(act(s, board, p.id, { kind: 'item', item: 'escudo' }).ok).toBe(false);
    expect(act(s, board, p.id, { kind: 'item', item: 'dado', value: 1 }).ok).toBe(false);
  });
  it('Poção leva a um destino válido e encerra o turno', () => {
    const s = mk(5); const p = me(s); p.items = ['pocao']; p.tile = 'R05';
    expect(act(s, board, p.id, { kind: 'item', item: 'pocao', tile: 'R05' }).ok).toBe(false);
    expect(act(s, board, p.id, { kind: 'item', item: 'pocao', tile: 'R11' }).ok).toBe(true);
    expect(p.tile).toBe('R11'); expect(s.phase === 'roll' || s.phase === 'star_offer').toBe(true);
    expect(activePid(s)).not.toBe(p.id);
  });
  it('itens só na vez certa e nunca acima de 2', () => {
    const s = mk(6); const o = other(s); o.items = ['dado'];
    expect(act(s, board, o.id, { kind: 'item', item: 'dado', value: 1 }).ok).toBe(false);
  });
});

describe('Entrega 11: loja, duelo, teleporte, estrela', () => {
  it('loja: compra, saldo, limite de 2 itens, sair', () => {
    const s = mk(7); const p = me(s); p.tile = 'R07'; s.move = { pid: p.id, remaining: 0, prev: null, choices: [], forced: null }; s.phase = 'tile';
    advance(s, board); expect(s.phase).toBe('shop');
    p.coins = 20;
    expect(act(s, board, p.id, { kind: 'shopBuy', item: 'ima' }).ok).toBe(true); expect(p.coins).toBe(10);
    expect(act(s, board, p.id, { kind: 'shopBuy', item: 'ima' }).ok).toBe(true); expect(p.coins).toBe(0);
    expect(act(s, board, p.id, { kind: 'shopBuy', item: 'dado' }).ok).toBe(false); // sem moedas e inventário cheio
    expect(p.items).toHaveLength(MAX_ITEMS);
    expect(act(s, board, p.id, { kind: 'shopLeave' }).ok).toBe(true);
    expect(activePid(s)).not.toBe(p.id);
  });
  it('loja: sem moedas não compra', () => {
    const s = mk(8); const p = me(s); p.tile = 'R07'; p.coins = 3; s.move = { pid: p.id, remaining: 0, prev: null, choices: [], forced: null }; s.phase = 'tile';
    advance(s, board);
    expect(act(s, board, p.id, { kind: 'shopBuy', item: 'dado' }).ok).toBe(false); expect(p.coins).toBe(3);
  });
  it('duelo: alvo válido, no máximo 5 moedas, saldo nunca negativo', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = mk(seed); const p = me(s); const o = other(s); p.tile = 'J0'; o.coins = 2;
      s.move = { pid: p.id, remaining: 0, prev: null, choices: [], forced: null }; s.phase = 'tile'; advance(s, board);
      expect(s.phase).toBe('duel');
      expect(act(s, board, p.id, { kind: 'duel', target: p.id }).ok).toBe(false);
      const before = p.coins + o.coins;
      expect(act(s, board, p.id, { kind: 'duel', target: o.id }).ok).toBe(true);
      expect(p.coins + o.coins).toBe(before); expect(o.coins).toBeGreaterThanOrEqual(0);
    }
  });
  it('teleporte: escolher destino, ficar, e destino inválido', () => {
    const s = mk(9); const p = me(s); p.tile = 'R11'; s.move = { pid: p.id, remaining: 0, prev: null, choices: [], forced: null }; s.phase = 'tile';
    advance(s, board); expect(s.phase).toBe('teleport');
    expect(act(s, board, p.id, { kind: 'teleport', tile: 'R20' }).ok).toBe(false);
    expect(act(s, board, p.id, { kind: 'teleport', tile: 'L1' }).ok).toBe(true);
    expect(p.tile).toBe('L1');
  });
  it('estrela: ajuda para quem está 2+ estrelas atrás, desconto de evento e piso de 10', () => {
    const s = mk(10); s.players[0]!.stars = 2;
    expect(starCost(s, 'p0')).toBe(25); expect(starCost(s, 'p1')).toBe(20);
    s.starDiscount = { amount: 8, round: s.round }; expect(starCost(s, 'p1')).toBe(12); expect(starCost(s, 'p0')).toBe(17);
    s.round++; expect(starCost(s, 'p0')).toBe(25);
  });
});

describe('Entrega 11: eventos das rodadas', () => {
  const toRound = (n: number, seed = 1) => { const s = mk(seed); s.round = n - 1; s.phase = 'round_end'; advance(s, board); finishMinigame(s, { kind: 'ranking', ranking: s.players.map((p, i) => ({ playerId: p.id, rank: i + 1, score: 0 })) }, {}); advance(s, board); return s; };
  it('rodada 3: 6 casas com brilho que pagam uma vez e somem na rodada 4', () => {
    const s = toRound(3); expect(Object.keys(s.bonusTiles)).toHaveLength(6);
    const s2 = toRound(4); expect(Object.keys(s2.bonusTiles)).toHaveLength(0);
  });
  it('rodada 6: porto bloqueado, caminhos novos; limpa na rodada 8', () => {
    const s = toRound(6);
    expect(s.blocked).toEqual(['R09', 'R10']);
    expect(nbrs(s, board, 'R08')).not.toContain('R09');
    expect(nbrs(s, board, 'S2')).toContain('R12');
    for (const p of s.players) expect(s.blocked).not.toContain(p.tile);
    const s8 = toRound(8); expect(s8.blocked).toEqual([]); expect(s8.extraEdges).toEqual([]);
  });
  it('rodada 9: um dos três portais acontece', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const s = toRound(9, seed);
      const msg = s.log[s.log.length - 1]?.text ?? '';
      outcomes.add(/trocaram/.test(msg) ? 'troca' : /item/.test(msg) ? 'itens' : /secreta/.test(msg) ? 'estrela' : msg);
      if (s.secretStar) expect(s.secretStar.tile).not.toBe(s.starTile);
    }
    expect([...outcomes].sort()).toEqual(['estrela', 'itens', 'troca']);
  });
});

describe('Entrega 11: partidas completas só com bots', () => {
  it('invariantes em 60 partidas: moedas >= 0, itens <= 2, sem travar, ninguém preso em casa bloqueada', () => {
    let items = 0, stars = 0, shops = 0, duels = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = createGame({ board, seed, mgIds, players: players() });
      const rng = { rng: seed ^ 0x77 }; let guard = 0;
      while (s.phase !== 'final') {
        if (++guard > 30000) throw new Error('travou ' + seed + ' ' + s.phase);
        if (s.phase === 'minigame') finishMinigame(s, { kind: 'ranking', ranking: s.players.map((p, i) => ({ playerId: p.id, rank: i + 1, score: 4 - i })) }, { p0: 8, p1: 6, p2: 4, p3: 3 });
        else if (awaiting(s)) {
          const aw = awaiting(s)!; if (aw.kind === 'shop') shops++; if (aw.kind === 'duel') duels++;
          const i = decide(s, board, rng)!; const r = act(s, board, aw.pid, i); if (!r.ok) throw new Error(`bot inválido ${JSON.stringify(i)}: ${r.error}`);
          for (const e of r.events) if (e.t === 'item' && e.gained) items++;
        } else advance(s, board);
        for (const p of s.players) { if (p.coins < 0) throw new Error('negativo'); if (p.items.length > MAX_ITEMS) throw new Error('itens'); }
        if (s.phase === 'roll') for (const p of s.players) if (s.blocked.includes(p.tile) && s.round === 6 && s.turn === 0) throw new Error('preso');
      }
      stars += s.players.reduce((a, p) => a + p.stars, 0);
      expect(Object.values(ITEMS)).toHaveLength(5);
    }
    expect(items).toBeGreaterThan(20); expect(shops).toBeGreaterThan(20); expect(duels).toBeGreaterThan(5); expect(stars).toBeGreaterThan(30);
  });
});

describe('teleporte até a estrela permite comprar', () => {
  const tpTo = (via: 'tile' | 'potion', secret: boolean) => {
    const s = mk(9); const p = me(s); p.coins = 60;
    if (secret) s.secretStar = { tile: 'L1', cost: 12, round: s.round };
    const dest = secret ? 'L1' : s.starTile;
    if (via === 'potion') { p.items = ['pocao']; expect(act(s, board, p.id, { kind: 'item', item: 'pocao', tile: dest }).ok).toBe(true); }
    else { p.tile = 'R11'; s.move = { pid: p.id, remaining: 0, prev: null, choices: [], forced: null }; s.phase = 'tile'; advance(s, board); expect(act(s, board, p.id, { kind: 'teleport', tile: dest }).ok).toBe(true); }
    return { s, p };
  };
  for (const via of ['tile', 'potion'] as const) for (const secret of [false, true]) {
    it(`${via} → estrela ${secret ? 'secreta' : 'principal'}: oferece e compra`, () => {
      const { s, p } = tpTo(via, secret);
      expect(awaiting(s)!.kind).toBe('buy');
      const stars = p.stars, coins = p.coins;
      expect(act(s, board, p.id, { kind: 'buy', yes: true }).ok).toBe(true);
      expect(p.stars).toBe(stars + 1); expect(p.coins).toBeLessThan(coins);
    });
  }
  it('sem moedas suficientes não oferece', () => {
    const s = mk(9); const p = me(s); p.coins = 3; p.items = ['pocao'];
    act(s, board, p.id, { kind: 'item', item: 'pocao', tile: s.starTile });
    expect(awaiting(s)?.kind).not.toBe('buy');
  });
});
