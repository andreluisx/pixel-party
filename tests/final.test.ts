import { describe, expect, it } from 'vitest';
import { act, advance, awaiting, computeAwards, createGame, finishMinigame, standings, type GameState } from '../shared/game/engine';
import { BOARD, botParticipants, playFullGame } from '../shared/game/sim';
import { MINIGAME_LIST } from '../shared/minigames';

const mk = () => {
  const parts = botParticipants();
  return createGame({ board: BOARD, seed: 3, mgIds: MINIGAME_LIST.map((m) => m.id), players: parts.map((p) => ({ id: p.id, slot: p.slot, name: p.name, characterId: p.characterId, isBot: true })) });
};
const [A, B, C, D] = ['bot-0', 'bot-1', 'bot-2', 'bot-3'];
const set = (s: GameState, id: string, f: Partial<{ mg: number; kills: number; wins: number; steps: number; items: number; coins: number }>) => {
  const p = s.players.find((x) => x.id === id)!;
  if (f.mg !== undefined) p.stats.mgCoins = f.mg; if (f.kills !== undefined) p.stats.kills = f.kills; if (f.wins !== undefined) p.wins = f.wins;
  if (f.steps !== undefined) p.steps = f.steps; if (f.items !== undefined) p.stats.itemsUsed = f.items; if (f.coins !== undefined) p.coins = f.coins;
};

describe('Grande Final: prêmios', () => {
  it('cada categoria vai para quem tem o maior valor', () => {
    const s = mk();
    set(s, A!, { mg: 50, kills: 0, wins: 1, steps: 90, items: 0 }); set(s, B!, { mg: 30, kills: 5, wins: 4, steps: 60, items: 1 });
    set(s, C!, { mg: 10, kills: 1, wins: 2, steps: 100, items: 3 }); set(s, D!, { mg: 20, kills: 2, wins: 0, steps: 70, items: 2 });
    const w = Object.fromEntries(computeAwards(s).map((a) => [a.id, a.winner]));
    expect(w).toEqual({ moedas: A, cacador: B, campeao: B, explorador: C, estrategista: C });
  });
  it('ninguém pontuou (todos 0): categoria sem vencedor', () => {
    const s = mk(); const a = computeAwards(s).find((x) => x.id === 'cacador')!;
    expect(a.winner).toBeNull(); expect(a.tied).toEqual([]);
  });
  it('empate: desempate por moedas do tabuleiro, com explicação', () => {
    const s = mk(); set(s, A!, { kills: 3, coins: 40 }); set(s, B!, { kills: 3, coins: 55 });
    const a = computeAwards(s).find((x) => x.id === 'cacador')!;
    expect(a.winner).toBe(B); expect(a.tied).toEqual([A, B]); expect(a.tieNote).toMatch(/Desempate por moedas do tabuleiro/);
  });
  it('empate também nas moedas: ninguém leva a estrela', () => {
    const s = mk(); set(s, A!, { kills: 3, coins: 40 }); set(s, B!, { kills: 3, coins: 40 });
    const a = computeAwards(s).find((x) => x.id === 'cacador')!;
    expect(a.winner).toBeNull(); expect(a.tieNote).toMatch(/ninguém leva/);
  });
  it('ranking final: estrelas dos prêmios somam; empate em estrelas vai para moedas e é sinalizado', () => {
    const s = mk(); s.players.forEach((p, i) => { p.stars = i === 0 ? 2 : 1; p.coins = 10 + i; });
    s.starsBeforeAwards = Object.fromEntries(s.players.map((p) => [p.id, p.stars]));
    s.players[1]!.stars = 2; // bot-1 recebeu 1 estrela de prêmio e empata com bot-0
    const st = standings(s);
    expect(st[0]!.pid).toBe(B); expect(st[0]!.tie).toBe('coins'); expect(st[1]!.tie).toBe('coins');
    expect(st[0]!.awardStars).toBe(1); expect(st[0]!.boardStars).toBe(1);
  });
});

describe('Grande Final: fluxo', () => {
  it('a rodada 12 termina em cerimônia (sem minigame final) e as estrelas dos prêmios entram no ranking', () => {
    const s = mk(); advance(s, BOARD); s.round = 12; s.phase = 'round_end';
    const ev = advance(s, BOARD);
    expect(s.phase).toBe('final'); expect(s.mg).toBeNull();
    expect(ev.some((e) => e.t === 'final')).toBe(true); expect(ev.some((e) => e.t === 'minigame')).toBe(false);
    expect(s.awards).toHaveLength(5);
    const given = s.awards!.filter((a) => a.winner).length;
    expect(s.players.reduce((a, p) => a + p.stars, 0) - Object.values(s.starsBeforeAwards!).reduce((a, b) => a + b, 0)).toBe(given);
  });
  it('abates dos minigames viram estatística; recompensa continua idempotente', () => {
    const s = mk(); advance(s, BOARD); s.phase = 'round_end'; advance(s, BOARD);
    const r = { kind: 'ranking' as const, ranking: s.players.map((p, i) => ({ playerId: p.id, rank: i + 1, score: 0 })), kills: { [B!]: 3 } };
    finishMinigame(s, r, { [A!]: 8, [B!]: 6, [C!]: 4, [D!]: 3 }); finishMinigame(s, r, { [A!]: 8, [B!]: 6, [C!]: 4, [D!]: 3 });
    const b = s.players.find((p) => p.id === B)!;
    expect(b.stats.kills).toBe(3); expect(b.stats.mgCoins).toBe(6); expect(b.coins).toBe(16);
  });
  it('partidas completas com minigames reais: ranking coerente em várias sementes', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state: s, minigames } = playFullGame(seed);
      expect(s.round).toBe(12); expect(s.phase).toBe('final'); expect(minigames.length).toBeGreaterThanOrEqual(11);
      for (const p of s.players) { expect(p.coins).toBeGreaterThanOrEqual(0); expect(p.items.length).toBeLessThanOrEqual(2); }
      const st = s.final!; expect(st).toHaveLength(4);
      for (let i = 1; i < st.length; i++) expect([st[i - 1]!.stars, st[i - 1]!.coins]).toSatisfy((a: number[]) => a[0]! > st[i]!.stars || (a[0] === st[i]!.stars && a[1]! >= st[i]!.coins));
      expect(awaiting(s)).toBeNull();
    }
  }, 120_000);
  it('simulação em massa (sorteando minigames): 300 partidas sem travar, prêmios e empates válidos', () => {
    let tiesTotal = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { state: s } = playFullGame(seed, { fakeMinigames: true });
      expect(s.awards).toHaveLength(5);
      for (const a of s.awards!) { if (a.winner) expect(a.tied.length === 0 || a.tied.includes(a.winner)).toBe(true); if (a.tieNote) tiesTotal++; }
      expect(act(s, BOARD, s.players[0]!.id, { kind: 'roll' }).ok).toBe(false); // depois do final nada mais é aceito
    }
    expect(tiesTotal).toBeGreaterThanOrEqual(0);
  });
});
