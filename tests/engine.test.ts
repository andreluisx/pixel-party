import { describe, expect, it } from 'vitest';
import { buildBoard } from '../shared/board/board';
import { REINO_DO_CASTELO } from '../shared/board/maps/reino-do-castelo';
import { act, advance, awaiting, createGame, finishMinigame, activePid, standings, STAR_COST, type GameState } from '../shared/game/engine';
import { decide } from '../shared/game/boardBot';
import { MINIGAME_LIST } from '../shared/minigames';

const board = buildBoard(REINO_DO_CASTELO);
const mgIds = MINIGAME_LIST.map((m) => m.id);
const mkPlayers = () => [0, 1, 2, 3].map((i) => ({ id: `p${i}`, slot: i as 0 | 1 | 2 | 3, name: `J${i}`, characterId: 'c', isBot: true, difficulty: 'medium' as const, personality: (['collector', 'aggressive', 'careful', 'gambler'] as const)[i] }));
const fakeResult = (s: GameState) => {
  const ids = s.players.map((p) => p.id);
  return { kind: 'ranking' as const, ranking: ids.map((id, i) => ({ playerId: id, rank: i + 1, score: 4 - i })) };
};
const rewards = { p0: 8, p1: 6, p2: 4, p3: 3 };

/** Joga uma partida inteira só com bots, validando invariantes a cada passo. */
export function playFull(seed: number) {
  const s = createGame({ board, seed, mgIds, players: mkPlayers() });
  const rng = { rng: seed ^ 0x5bd1 };
  const hist: string[] = [];
  let guard = 0;
  while (s.phase !== 'final') {
    if (++guard > 20000) throw new Error('travou');
    if (s.phase === 'minigame') { hist.push(s.mg!.id); finishMinigame(s, fakeResult(s), rewards); }
    else if (awaiting(s)) { const i = decide(s, board, rng)!; const r = act(s, board, awaiting(s)!.pid, i); if (!r.ok) throw new Error(r.error); }
    else advance(s, board);
    for (const p of s.players) if (p.coins < 0) throw new Error('moeda negativa');
  }
  return { s, hist };
}

describe('engine', () => {
  it('cria partida: 4 jogadores, 10 moedas, ordem, estrela em altar', () => {
    const s = createGame({ board, seed: 1, mgIds, players: mkPlayers() });
    expect(s.players.every((p) => p.coins === 10 && p.stars === 0 && p.tile === 'R00')).toBe(true);
    expect([...s.order].sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(REINO_DO_CASTELO.starSpots).toContain(s.starTile);
  });
  it('valida vez, fase e caminho', () => {
    const s = createGame({ board, seed: 2, mgIds, players: mkPlayers() });
    advance(s, board);
    const me = activePid(s); const other = s.order[1]!;
    expect(act(s, board, other, { kind: 'roll' }).ok).toBe(false);
    expect(act(s, board, me, { kind: 'buy', yes: true }).ok).toBe(false);
    expect(act(s, board, me, { kind: 'roll' }).ok).toBe(true);
    expect(act(s, board, me, { kind: 'roll' }).ok).toBe(false);
  });
  it('anda passo a passo sem voltar e pára em bifurcação esperando escolha válida', () => {
    const s = createGame({ board, seed: 3, mgIds, players: mkPlayers() });
    advance(s, board);
    const me = activePid(s);
    s.players.find((p) => p.id === me)!.tile = 'R05';
    s.move = { pid: me, remaining: 3, prev: 'R04', choices: [], forced: null }; s.phase = 'moving';
    advance(s, board);
    expect(s.phase).toBe('fork');
    expect(s.move!.choices).toEqual(['R06', 'B3']);
    expect(act(s, board, me, { kind: 'choose', tile: 'R04' }).ok).toBe(false);
    expect(act(s, board, me, { kind: 'choose', tile: 'B3' }).ok).toBe(true);
    advance(s, board);
    expect(s.players.find((p) => p.id === me)!.tile).toBe('B3');
  });
  it('compra a estrela (-20), realoca e respeita a distância', () => {
    const s = createGame({ board, seed: 4, mgIds, players: mkPlayers() });
    advance(s, board);
    const me = activePid(s); const p = s.players.find((x) => x.id === me)!;
    p.tile = s.starTile; p.coins = 25; s.phase = 'star_offer'; s.move = { pid: me, remaining: 0, prev: null, choices: [], forced: null };
    const old = s.starTile;
    expect(act(s, board, me, { kind: 'buy', yes: true }).ok).toBe(true);
    expect(p.stars).toBe(1); expect(p.coins).toBe(25 - STAR_COST);
    expect(s.starTile).not.toBe(old);
    expect(board.dist(s.starTile, p.tile)).toBeGreaterThanOrEqual(4);
  });
  it('passar pelo altar com 20+ moedas oferece a estrela e depois segue andando', () => {
    const s = createGame({ board, seed: 8, mgIds, players: mkPlayers() });
    advance(s, board);
    const me = activePid(s); const p = s.players.find((x) => x.id === me)!;
    s.starTile = 'R03'; p.tile = 'R02'; p.coins = 30;
    s.move = { pid: me, remaining: 3, prev: 'R01', choices: [], forced: null }; s.phase = 'moving';
    advance(s, board);
    expect(p.tile).toBe('R03'); expect(s.phase).toBe('star_offer');
    expect(act(s, board, me, { kind: 'buy', yes: false }).ok).toBe(true);
    expect(s.phase).toBe('moving'); expect(s.move!.remaining).toBe(2);
    advance(s, board); expect(p.tile).toBe('R04');
  });
  it('recompensa de minigame é idempotente e moedas nunca ficam negativas', () => {
    const s = createGame({ board, seed: 5, mgIds, players: mkPlayers() });
    s.phase = 'round_end'; advance(s, board);
    expect(s.phase).toBe('minigame');
    const r = fakeResult(s);
    finishMinigame(s, r, rewards); finishMinigame(s, r, rewards);
    expect(s.players.map((p) => p.coins)).toEqual([18, 16, 14, 13]);
    expect(s.round).toBe(2);
    expect(s.players[0]!.wins).toBe(1);
  });
  it('a ordem gira a cada rodada', () => {
    const s = createGame({ board, seed: 6, mgIds, players: mkPlayers() });
    const o = [...s.order];
    s.phase = 'round_end'; advance(s, board); finishMinigame(s, fakeResult(s), rewards);
    expect(s.order).toEqual([...o.slice(1), o[0]]);
  });
  it('12 rodadas completas chegam ao final sem travar, sem repetir minigame em sequência', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { s, hist } = playFull(seed);
      expect(s.round).toBe(12);
      expect(s.final).toHaveLength(4);
      for (let i = 1; i < hist.length; i++) expect(hist[i]).not.toBe(hist[i - 1]);
      expect(hist.length).toBeGreaterThanOrEqual(11);
      expect(new Set(s.appliedRewards).size).toBe(s.appliedRewards.length);
    }
  });
  it('as estrelas são compradas nas partidas de bots', () => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) total += playFull(seed).s.players.reduce((a, p) => a + p.stars, 0);
    expect(total).toBeGreaterThan(10);
  });
  it('desempate: estrelas > moedas > vitórias; empate total divide a colocação', () => {
    const s = createGame({ board, seed: 7, mgIds, players: mkPlayers() });
    s.players[0]!.stars = 1; s.players[1]!.coins = 50; s.players[2]!.coins = 50; s.players[3]!.coins = 50; s.players[2]!.wins = 1;
    const st = standings(s);
    expect(st.map((x) => x.pid)).toEqual(['p0', 'p2', 'p1', 'p3']);
    expect(st.map((x) => x.rank)).toEqual([1, 2, 3, 3]);
  });
});
