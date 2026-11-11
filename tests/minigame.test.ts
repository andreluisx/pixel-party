import { describe, expect, it } from 'vitest';
import { pipelineTest } from '../shared/minigames/pipeline-test';
import { simulateMatch, TICK_MS } from '../shared/sim';
import { rankByScore, rewardsForRanking } from '../shared/rewards';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (difficulty: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => {
    const b = makeBotProfile(i as Slot, difficulty);
    return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty };
  });

describe('recompensas', () => {
  it('sem empate: 8/6/4/3', () => {
    const r = rewardsForRanking(rankByScore([{ playerId: 'a', score: 9 }, { playerId: 'b', score: 7 }, { playerId: 'c', score: 3 }, { playerId: 'd', score: 1 }]));
    expect(r).toEqual({ a: 8, b: 6, c: 4, d: 3 });
  });
  it('empate no 1º lugar divide a média (8+6)/2 = 7', () => {
    const r = rewardsForRanking(rankByScore([{ playerId: 'a', score: 9 }, { playerId: 'b', score: 9 }, { playerId: 'c', score: 3 }, { playerId: 'd', score: 1 }]));
    expect(r).toEqual({ a: 7, b: 7, c: 4, d: 3 });
  });
  it('todos empatados recebem a mesma média', () => {
    const r = rewardsForRanking(rankByScore(['a', 'b', 'c', 'd'].map((p) => ({ playerId: p, score: 0 }))));
    expect(new Set(Object.values(r)).size).toBe(1);
  });
});

describe('arena de teste', () => {
  it('é determinística para a mesma seed', () => {
    const a = simulateMatch(pipelineTest, players(), 1234);
    const b = simulateMatch(pipelineTest, players(), 1234);
    expect(a.result).toEqual(b.result);
    expect(a.ticks).toBe(b.ticks);
  });
  it('termina e premia exatamente 4 jogadores, todos com pelo menos 3 moedas', () => {
    const out = simulateMatch(pipelineTest, players(), 7);
    expect(Object.keys(out.rewards)).toHaveLength(4);
    for (const v of Object.values(out.rewards)) expect(v).toBeGreaterThanOrEqual(3);
  });
  it('100 partidas só com bots: sem travar e com pontuação', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const out = simulateMatch(pipelineTest, players(), seed);
      expect(out.ticks).toBeGreaterThan(0);
      const total = Object.values(out.finalState.players as Record<string, { score: number }>).reduce((s, p) => s + p.score, 0);
      expect(total).toBeGreaterThan(0);
    }
  });
  it('bot difícil vence bot fácil na maioria das partidas', () => {
    let hardWins = 0;
    const N = 40;
    for (let seed = 1; seed <= N; seed++) {
      const ps = players();
      ps[0]!.difficulty = 'hard';
      for (const i of [1, 2, 3]) ps[i]!.difficulty = 'easy';
      const out = simulateMatch(pipelineTest, ps, seed);
      const s = out.finalState.players as Record<string, { score: number }>;
      const hard = s[ps[0]!.id]!.score;
      const bestEasy = Math.max(...[1, 2, 3].map((i) => s[ps[i]!.id]!.score));
      if (hard >= bestEasy) hardWins++;
    }
    expect(hardWins / N).toBeGreaterThan(0.6);
  });
  it('rejeita inputs inválidos', () => {
    expect(pipelineTest.sanitizeInput({ dx: 5, dy: 0 })).toBeNull();
    expect(pipelineTest.sanitizeInput('x')).toBeNull();
    expect(pipelineTest.sanitizeInput({ dx: 1, dy: -1 })).toEqual({ dx: 1, dy: -1 });
  });
  it('jogador não atravessa pedras nem paredes', () => {
    const ps = players();
    const s = pipelineTest.createInitialState(5, ps);
    for (let i = 0; i < 600; i++) pipelineTest.step(s, { [ps[0]!.id]: { dx: 1, dy: 1 } }, TICK_MS);
    const p = s.players[ps[0]!.id]!;
    expect(p.x).toBeLessThanOrEqual(480 - 16 - 5);
    expect(p.y).toBeLessThanOrEqual(270 - 16 - 5);
  });
});
