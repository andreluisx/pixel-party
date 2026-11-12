import { describe, expect, it } from 'vitest';
import { reflexoRelampago as def, DURATION_MS, type ReflexInput, type ReflexState } from '../shared/minigames/reflexo-relampago';
import { simulateMatch, TICK_MS } from '../shared/sim';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (d: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => {
    const b = makeBotProfile(i as Slot, d);
    return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: d };
  });
const ps = players();
const A = ps[0]!.id, B = ps[1]!.id;
const idle = (): Record<string, ReflexInput> => Object.fromEntries(ps.map((p) => [p.id, { k: 0, n: 0 }]));
const tickUntil = (s: ReflexState, cond: () => boolean, inputs: () => Record<string, ReflexInput> = idle, max = 200) => { for (let i = 0; i < max && !cond(); i++) def.step(s, inputs(), TICK_MS); };

describe('regras', () => {
  it('apertar sem seta é erro: trava, perde pontos e ignora apertos seguintes', () => {
    const s = def.createInitialState(1, ps);
    s.players[A]!.points = 10;
    def.step(s, { ...idle(), [A]: { k: 1, n: 1 } }, TICK_MS);
    expect(s.players[A]!.errors).toBe(1);
    expect(s.players[A]!.points).toBe(7);
    expect(s.players[A]!.lockMs).toBeGreaterThan(600);
    def.step(s, { ...idle(), [A]: { k: 2, n: 2 } }, TICK_MS);
    expect(s.players[A]!.errors).toBe(1); // ignorado enquanto travado
  });
  it('acertar a seta dá pontos, rápido vale mais, e só uma vez por seta', () => {
    const s = def.createInitialState(1, ps);
    tickUntil(s, () => s.active !== null);
    const a = s.active!;
    def.step(s, { ...idle(), [A]: { k: a.symbol, n: 1 } }, TICK_MS);
    expect(s.players[A]!.hits).toBe(1);
    const first = s.players[A]!.points;
    expect(first).toBeGreaterThanOrEqual(15);
    def.step(s, { ...idle(), [A]: { k: a.symbol, n: 2 } }, TICK_MS); // aperta de novo na mesma seta
    expect(s.players[A]!.hits).toBe(1);
    expect(s.players[A]!.errors).toBe(1);
  });
  it('tecla errada com seta na tela é erro', () => {
    const s = def.createInitialState(1, ps);
    tickUntil(s, () => s.active !== null);
    const wrong = (s.active!.symbol + 1) % 4;
    def.step(s, { ...idle(), [A]: { k: wrong, n: 1 } }, TICK_MS);
    expect(s.players[A]!.errors).toBe(1);
    expect(s.players[A]!.lockMs).toBeGreaterThan(0);
  });
  it('quem não aperta perde a seta (miss) e zera a sequência', () => {
    const s = def.createInitialState(1, ps);
    tickUntil(s, () => s.active !== null);
    const no = s.active!.no;
    tickUntil(s, () => s.active === null || s.active.no !== no, idle, 100);
    expect(s.players[A]!.misses).toBe(1);
  });
  it('aperto logo depois da seta sumir (carência) não é erro', () => {
    const s = def.createInitialState(1, ps);
    tickUntil(s, () => s.active !== null);
    const no = s.active!.no;
    tickUntil(s, () => s.active === null || s.active.no !== no, idle, 100);
    def.step(s, { ...idle(), [A]: { k: 1, n: 1 } }, TICK_MS);
    expect(s.players[A]!.errors).toBe(0);
  });
  it('um jogador acertar não tira o ponto do outro (cada um resolve a sua)', () => {
    const s = def.createInitialState(1, ps);
    tickUntil(s, () => s.active !== null);
    const a = s.active!;
    def.step(s, { ...idle(), [A]: { k: a.symbol, n: 1 } }, TICK_MS);
    def.step(s, { ...idle(), [A]: { k: a.symbol, n: 1 }, [B]: { k: a.symbol, n: 1 } }, TICK_MS);
    expect(s.players[B]!.hits).toBe(1);
  });
  it('rejeita inputs inválidos', () => {
    for (const bad of [null, 'x', { k: 9, n: 0 }, { k: 1.5, n: 0 }, { k: 1, n: -1 }, { k: '1', n: 1 }]) expect(def.sanitizeInput(bad)).toBeNull();
    expect(def.sanitizeInput({ k: 3, n: 5 })).toEqual({ k: 3, n: 5 });
  });
});

describe('imprevisibilidade e dificuldade', () => {
  const record = (seed: number) => {
    const s = def.createInitialState(seed, ps);
    const starts: number[] = [], windows: number[] = [], syms: number[] = [];
    let last = 0;
    while (!def.isFinished(s)) { def.step(s, idle(), TICK_MS); if (s.active && s.active.no !== last) { last = s.active.no; starts.push(s.active.startMs); windows.push(s.active.windowMs); syms.push(s.active.symbol); } }
    return { starts, windows, syms };
  };
  it('intervalos variam bastante e mudam de seed para seed', () => {
    const a = record(1), b = record(2);
    const gaps = a.starts.slice(1).map((v, i) => v - a.starts[i]!);
    const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((x, y) => x + (y - mean) ** 2, 0) / gaps.length);
    expect(sd).toBeGreaterThan(120);
    expect(a.syms).not.toEqual(b.syms);
    expect(a.starts.length).toBeGreaterThan(12);
  });
  it('nunca 3 setas iguais seguidas e a janela encolhe', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = record(seed);
      for (let i = 2; i < r.syms.length; i++) expect(r.syms[i] === r.syms[i - 1] && r.syms[i] === r.syms[i - 2]).toBe(false);
      expect(r.windows[r.windows.length - 1]!).toBeLessThan(r.windows[0]!);
    }
  });
  it('o estado público não revela o gerador aleatório', () => {
    const s = def.createInitialState(123456, ps);
    expect((def.publicState!(s) as ReflexState).rng).toBe(0);
    expect(JSON.stringify(def.publicState!(s))).not.toContain('123456');
  });
  it('a duração fica em torno de 25 s', () => { expect(DURATION_MS).toBe(25000); });
});

describe('bots no reflexo', () => {
  it('100 partidas só com bots terminam, ninguém com pontos negativos', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const out = simulateMatch(def, players('medium'), seed);
      for (const p of Object.values(out.finalState.players as Record<string, { points: number }>)) expect(p.points).toBeGreaterThanOrEqual(0);
    }
  });
  it('difícil vence fácil quase sempre, e a média de pontos acompanha a dificuldade', () => {
    let wins = 0; const N = 40;
    const avg: Record<string, number> = {};
    for (const d of ['easy', 'medium', 'hard'] as const) {
      let tot = 0, n = 0;
      for (let seed = 1; seed <= 30; seed++) { const o = simulateMatch(def, players(d), seed); for (const p of Object.values(o.finalState.players as Record<string, { points: number }>)) { tot += p.points; n++; } }
      avg[d] = tot / n;
    }
    for (let seed = 1; seed <= N; seed++) {
      const q = players('easy'); q[0]!.difficulty = 'hard';
      const o = simulateMatch(def, q, seed);
      if (o.result.kind === 'ranking' && o.result.ranking.find((r) => r.rank === 1)!.playerId === q[0]!.id) wins++;
    }
    console.log('média de pontos', avg, 'hard vence easy', wins, '/', N);
    expect(avg.hard!).toBeGreaterThan(avg.medium!); expect(avg.medium!).toBeGreaterThan(avg.easy!);
    expect(wins / N).toBeGreaterThan(0.8);
  });
  it('determinística e com ranking e recompensas para os 4', () => {
    const a = simulateMatch(def, players(), 7), b = simulateMatch(def, players(), 7);
    expect(a.result).toEqual(b.result);
    expect(Object.keys(a.rewards)).toHaveLength(4);
  });
  it('desempate: mesmos pontos, vence quem reagiu mais rápido; formatScore mostra pontos', () => {
    const s = def.createInitialState(1, ps);
    s.players[A]!.points = 50; s.players[A]!.reactionSum = 3000;
    s.players[B]!.points = 50; s.players[B]!.reactionSum = 2500;
    const r = def.computeResult(s);
    if (r.kind !== 'ranking') throw new Error();
    expect(r.ranking.find((x) => x.playerId === B)!.rank).toBeLessThan(r.ranking.find((x) => x.playerId === A)!.rank);
    expect(def.formatScore!(r.ranking[0]!.score)).toBe('50 pts');
  });
});
