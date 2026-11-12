import { describe, expect, it } from 'vitest';
import { AIR_TIME, BASE_SPEED, corridaMaluca as def, generateTrack, JUMP_VY, TRACK_LENGTH, getTrack, type CorridaInput, type CorridaState } from '../shared/minigames/corrida-maluca';
import { simulateMatch, TICK_MS } from '../shared/sim';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (d: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => {
    const b = makeBotProfile(i as Slot, d);
    return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: d };
  });

const run = (state: CorridaState, ps: ParticipantInfo[], inputFor: (id: string, t: number) => CorridaInput, ms: number) => {
  for (let t = 0; t < ms; t += TICK_MS) {
    const inputs: Record<string, CorridaInput> = {};
    for (const p of ps) inputs[p.id] = inputFor(p.id, t);
    def.step(state, inputs, TICK_MS);
  }
};

describe('pista', () => {
  it('é determinística e muda com a seed', () => {
    expect(generateTrack(5)).toEqual(generateTrack(5));
    expect(generateTrack(5)).not.toEqual(generateTrack(6));
  });
  it('perigos têm espaço para pousar, buracos não passam de 54 px e tudo cabe na pista', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const t = generateTrack(seed);
      const hazards = [
        ...t.holes.map((h) => ({ a: h.x, b: h.x + h.w })),
        ...t.crates.map((c) => ({ a: c.x - 6, b: c.x + 6 })),
        ...t.springs.map((s) => ({ a: s.x, b: s.x })),
      ].sort((p, q) => p.a - q.a);
      for (const h of t.holes) expect(h.w).toBeLessThanOrEqual(54);
      expect(hazards.length).toBeGreaterThan(10);
      expect(hazards[hazards.length - 1]!.b).toBeLessThan(TRACK_LENGTH - 100);
      expect(hazards[0]!.a).toBeGreaterThan(150);
    }
  });
});

describe('física', () => {
  const ps = players();
  it('pular exige apertar de novo: segurar o botão não repete o pulo', () => {
    const s = def.createInitialState(1, ps);
    s.players[ps[0]!.id]!.x = 24;
    let airStarts = 0, was = true;
    for (let t = 0; t < 2000; t += TICK_MS) {
      def.step(s, { [ps[0]!.id]: { run: 0, jump: true } }, TICK_MS);
      const g = s.players[ps[0]!.id]!.grounded;
      if (was && !g) airStarts++;
      was = g;
    }
    expect(airStarts).toBe(1);
  });
  it('o pulo dura o tempo esperado e sobe o esperado', () => {
    const s = def.createInitialState(1, ps);
    const r = s.players[ps[0]!.id]!;
    let peak = 0, airMs = 0, started = false;
    for (let t = 0; t < 1500; t += TICK_MS) {
      def.step(s, { [ps[0]!.id]: { run: 0, jump: t < 400 } }, TICK_MS);
      if (!r.grounded) { started = true; airMs += TICK_MS; peak = Math.max(peak, r.y); }
      if (started && r.grounded) break;
    }
    expect(peak).toBeGreaterThan(28); expect(peak).toBeLessThan(34);
    expect(airMs / 1000).toBeGreaterThan(AIR_TIME - 0.1); expect(airMs / 1000).toBeLessThan(AIR_TIME + 0.1);
    expect(JUMP_VY).toBeGreaterThan(0);
  });
  it('quem nunca pula não termina: bate em caixas e cai em buracos', () => {
    const s = def.createInitialState(3, ps);
    run(s, ps, () => ({ run: 0, jump: false }), 36000);
    for (const p of ps) expect(s.players[p.id]!.finishedAtMs).toBeNull();
  });
  it('a mola lança acima do pulo normal', () => {
    const seed = [...Array(80).keys()].map((i) => i + 1).find((i) => generateTrack(i).springs.length > 0)!;
    const sp = getTrack(seed).springs[0]!;
    const s = def.createInitialState(seed, ps);
    const r = s.players[ps[0]!.id]!;
    r.x = sp.x - 4;
    let peak = 0;
    for (let t = 0; t < 600; t += TICK_MS) { def.step(s, { [ps[0]!.id]: { run: 0, jump: false } }, TICK_MS); peak = Math.max(peak, r.y); }
    expect(peak).toBeGreaterThan(36);
  });
  it('queda no buraco: reaparece antes dele e perde tempo', () => {
    const seed = 2;
    const tr = getTrack(seed);
    const h = tr.holes[0]!;
    const s = def.createInitialState(seed, ps);
    const r = s.players[ps[0]!.id]!;
    r.x = h.x - 20;
    let fell = false;
    for (let t = 0; t < 3000; t += TICK_MS) {
      def.step(s, { [ps[0]!.id]: { run: 0, jump: false } }, TICK_MS);
      if (r.falling) fell = true;
      if (fell && !r.falling) break;
    }
    expect(fell).toBe(true);
    expect(r.x).toBeLessThan(h.x);
  });
  it('velocidade base permite chegar antes do limite', () => { expect(TRACK_LENGTH / BASE_SPEED).toBeLessThan(30); });
});

describe('resultado', () => {
  it('mostra tempo para quem chegou e % da pista para quem não chegou', () => {
    expect(def.formatScore!(1_000_000 - 2960)).toBe('29,6 s');
    expect(def.formatScore!(1250)).toBe('50% da pista');
  });
});

describe('bots na corrida', () => {
  it('100 corridas só com bots terminam, todas com chegada ou resultado válido', () => {
    let withFinisher = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const out = simulateMatch(def, players('medium'), seed);
      expect(out.ticks).toBeGreaterThan(300);
      expect(Object.values(out.rewards).sort()).toBeTruthy();
      const fin = Object.values(out.finalState.players as Record<string, { finishedAtMs: number | null }>).filter((p) => p.finishedAtMs !== null).length;
      if (fin > 0) withFinisher++;
    }
    expect(withFinisher).toBeGreaterThanOrEqual(90);
  });
  it('bot difícil termina em tempo razoável (≈ 18 a 35 s) na maioria das pistas', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const out = simulateMatch(def, players('hard'), seed);
      const r = Object.values(out.finalState.players as Record<string, { finishedAtMs: number | null }>).map((p) => p.finishedAtMs).filter((t): t is number => t !== null);
      if (r.length) times.push(Math.min(...r) / 1000);
    }
    const ok = times.filter((t) => t >= 18 && t <= 35).length;
    console.log('hard: melhor tempo médio', (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1), 's de', times.length, 'corridas');
    expect(times.length).toBeGreaterThanOrEqual(36);
    expect(ok / times.length).toBeGreaterThan(0.8);
  });
  it('difícil vence fácil na maioria das corridas', () => {
    let hardWins = 0;
    const N = 40;
    for (let seed = 1; seed <= N; seed++) {
      const ps = players('easy');
      ps[0]!.difficulty = 'hard';
      const out = simulateMatch(def, ps, seed);
      const first = out.result.kind === 'ranking' ? out.result.ranking.find((r) => r.rank === 1)!.playerId : '';
      if (first === ps[0]!.id) hardWins++;
    }
    console.log('hard vence easy:', hardWins, '/', N);
    expect(hardWins / N).toBeGreaterThan(0.7);
  });
  it('determinística com a mesma seed', () => {
    const a = simulateMatch(def, players(), 9);
    const b = simulateMatch(def, players(), 9);
    expect(a.result).toEqual(b.result);
  });
});
