import { describe, expect, it } from 'vitest';
import { quebraCabeca as def, PIECES, PICTURES, DURATION_MS, LAST_CHANCE_MS, countCorrect, minSwaps, type PuzzleInput, type PuzzleState } from '../shared/minigames/quebra-cabeca';
import { simulateMatch, TICK_MS } from '../shared/sim';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (d: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => { const b = makeBotProfile(i as Slot, d); return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: d }; });
const ps = players();
const [A, B] = [ps[0]!.id, ps[1]!.id];
const idle = (): Record<string, PuzzleInput> => ({});
const step = (s: PuzzleState, ms: number, inputs: Record<string, PuzzleInput> = idle()) => { for (let t = 0; t < ms; t += TICK_MS) def.step(s, inputs, TICK_MS); };
/** Passos (pares) que resolvem o tabuleiro: coloca a peça certa em cada posição errada. */
const solution = (board: number[]) => { const b = [...board]; const out: [number, number][] = []; for (let p = 0; p < PIECES; p++) if (b[p] !== p) { const q = b.indexOf(p); out.push([p, q]); [b[p], b[q]] = [b[q]!, b[p]!]; } return out; };
const play = (s: PuzzleState, id: string, a: number, b: number) => { const n = s.players[id]!.lastN + 1; step(s, 120, { [id]: { a, b, n } }); };

describe('embaralhamento', () => {
  it('é igual para todos os jogadores, é permutação e é bem bagunçado', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = def.createInitialState(seed, ps);
      const boards = ps.map((p) => s.players[p.id]!.board);
      for (const b of boards) { expect(b).toEqual(boards[0]); expect([...b].sort((x, y) => x - y)).toEqual(Array.from({ length: PIECES }, (_, i) => i)); expect(PIECES - countCorrect(b)).toBeGreaterThanOrEqual(13); }
    }
  });
  it('seeds diferentes dão tabuleiros e imagens diferentes; mesma seed repete', () => {
    expect(def.createInitialState(5, ps).players[A]!.board).toEqual(def.createInitialState(5, ps).players[A]!.board);
    expect(def.createInitialState(5, ps).players[A]!.board).not.toEqual(def.createInitialState(6, ps).players[A]!.board);
    expect(new Set([1, 2, 3, 4, 5, 6].map((sd) => def.createInitialState(sd, ps).picture)).size).toBe(PICTURES);
  });
  it('minSwaps conta peças menos ciclos', () => { expect(minSwaps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).toBe(0); expect(minSwaps([1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).toBe(1); expect(minSwaps([1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).toBe(2); });
});

describe('regras e validação no servidor', () => {
  it('uma troca vale só quando o contador n muda; repetir o mesmo pedido não troca de novo', () => {
    const s = def.createInitialState(1, ps);
    const before = [...s.players[A]!.board];
    step(s, 120, { [A]: { a: 0, b: 1, n: 1 } });
    expect(s.players[A]!.board[0]).toBe(before[1]); expect(s.players[A]!.board[1]).toBe(before[0]);
    step(s, 600, { [A]: { a: 0, b: 1, n: 1 } }); // mesmo n
    expect(s.players[A]!.swaps).toBe(1);
  });
  it('trocar a peça com ela mesma é inválido, e trocas rápidas demais são ignoradas', () => {
    const s = def.createInitialState(2, ps);
    step(s, 120, { [A]: { a: 3, b: 3, n: 1 } });
    expect(s.players[A]!.swaps).toBe(0); expect(s.players[A]!.invalid).toBe(1);
    def.step(s, { [A]: { a: 0, b: 1, n: 2 } }, TICK_MS);
    def.step(s, { [A]: { a: 2, b: 3, n: 3 } }, TICK_MS); // 33 ms depois: rápido demais
    expect(s.players[A]!.swaps).toBe(1);
  });
  it('índices fora do tabuleiro e tipos errados são rejeitados', () => {
    for (const bad of [null, 'x', { a: -1, b: 0, n: 1 }, { a: 0, b: 16, n: 1 }, { a: 1.5, b: 0, n: 1 }, { a: 0, b: 1, n: -3 }, { a: 0, b: 1 }, { a: '0', b: 1, n: 1 }]) expect(def.sanitizeInput(bad)).toBeNull();
    expect(def.sanitizeInput({ a: 15, b: 0, n: 9 })).toEqual({ a: 15, b: 0, n: 9 });
  });
  it('cada jogador só mexe no próprio tabuleiro', () => {
    const s = def.createInitialState(3, ps);
    const bBoard = [...s.players[B]!.board];
    step(s, 120, { [A]: { a: 0, b: 1, n: 1 } });
    expect(s.players[B]!.board).toEqual(bBoard);
  });
  it('montar tudo termina o jogador, trava o tabuleiro e conta o tempo', () => {
    const s = def.createInitialState(4, ps);
    for (const [a, b] of solution(s.players[A]!.board)) play(s, A, a, b);
    const p = s.players[A]!;
    expect(p.correct).toBe(PIECES); expect(p.finishedAtMs).not.toBeNull(); expect(s.firstFinishMs).toBe(p.finishedAtMs);
    const boardDone = [...p.board];
    play(s, A, 0, 1);
    expect(p.board).toEqual(boardDone);
  });
});

describe('fim da partida e pontuação', () => {
  it('o primeiro a terminar vence; os outros têm mais 6 s e depois valem pelo progresso', () => {
    const s = def.createInitialState(5, ps);
    for (const [a, b] of solution(s.players[A]!.board)) play(s, A, a, b);
    const sol = solution(s.players[B]!.board);
    for (const [a, b] of sol.slice(0, 5)) play(s, B, a, b);
    expect(def.isFinished(s)).toBe(false);
    step(s, LAST_CHANCE_MS + 200);
    expect(def.isFinished(s)).toBe(true);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error();
    expect(r.ranking.find((e) => e.playerId === A)!.rank).toBe(1);
    expect(r.ranking.find((e) => e.playerId === B)!.rank).toBe(2); // mais peças certas que quem não mexeu
    expect(def.formatScore!(r.ranking.find((e) => e.playerId === B)!.score)).toMatch(/peças$/);
  });
  it('quem termina antes tem tempo melhor; empate só se o tempo for igual', () => {
    const s = def.createInitialState(6, ps);
    for (const [a, b] of solution(s.players[A]!.board)) play(s, A, a, b);
    step(s, 400);
    for (const [a, b] of solution(s.players[B]!.board)) play(s, B, a, b);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error();
    expect(r.ranking.find((e) => e.playerId === A)!.rank).toBeLessThan(r.ranking.find((e) => e.playerId === B)!.rank);
    expect(def.formatScore!(r.ranking[0]!.score)).toMatch(/ s$/);
  });
  it('ninguém terminou: vence quem tem mais peças certas, e iguais empatam', () => {
    const s = def.createInitialState(7, ps);
    const sol = solution(s.players[A]!.board);
    for (const [a, b] of sol.slice(0, 3)) play(s, A, a, b);
    for (const [a, b] of sol.slice(0, 3)) play(s, B, a, b);
    step(s, DURATION_MS);
    expect(def.isFinished(s)).toBe(true);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error();
    const rk = (id: string) => r.ranking.find((e) => e.playerId === id)!.rank;
    expect(rk(A)).toBe(rk(B)); expect(rk(A)).toBe(1);
  });
  it('termina quando todos montam, sem esperar o tempo', () => {
    const s = def.createInitialState(8, ps);
    for (const p of ps) for (const [a, b] of solution(s.players[p.id]!.board)) play(s, p.id, a, b);
    expect(def.isFinished(s)).toBe(true); expect(s.elapsedMs).toBeLessThan(DURATION_MS);
  });
});

describe('bots no quebra-cabeça', () => {
  it('100 partidas só com bots terminam com ranking válido', () => { for (let seed = 1; seed <= 100; seed++) { const o = simulateMatch(def, players('medium'), seed); expect(Object.keys(o.rewards)).toHaveLength(4); } });
  it('bots melhores terminam antes e mais vezes; difícil vence fácil quase sempre', () => {
    const stat: Record<string, { fin: number; time: number; n: number }> = {};
    for (const d of ['easy', 'medium', 'hard'] as const) {
      let fin = 0, time = 0, n = 0;
      for (let seed = 1; seed <= 40; seed++) { const o = simulateMatch(def, players(d), seed); for (const p of Object.values((o.finalState as PuzzleState).players)) { n++; if (p.finishedAtMs !== null) { fin++; time += p.finishedAtMs; } } }
      stat[d] = { fin: fin / n, time: fin ? time / fin / 1000 : 99, n };
    }
    let wins = 0;
    for (let seed = 1; seed <= 60; seed++) { const q = players('easy'); q[0]!.difficulty = 'hard'; const o = simulateMatch(def, q, seed); if (o.result.kind === 'ranking' && o.result.ranking.find((e) => e.playerId === q[0]!.id)!.rank === 1) wins++; }
    console.log('terminam / tempo médio (s):', JSON.stringify(stat), 'hard vence 3 easy:', wins, '/ 60');
    expect(stat.hard!.fin).toBeGreaterThan(stat.medium!.fin); expect(stat.medium!.fin).toBeGreaterThanOrEqual(stat.easy!.fin);
    expect(stat.hard!.time).toBeLessThan(stat.medium!.time); expect(stat.medium!.time).toBeLessThan(stat.easy!.time);
    expect(stat.hard!.fin).toBeGreaterThan(0.9); expect(wins / 60).toBeGreaterThan(0.9);
  });
  it('bot só usa o tabuleiro dele (nunca o dos outros) e é determinístico', () => {
    expect(simulateMatch(def, players(), 4).result).toEqual(simulateMatch(def, players(), 4).result);
    const src = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../shared/minigames/quebra-cabeca.ts'), 'utf8') as string;
    const brain = src.slice(src.indexOf('function createBrain'), src.indexOf('// ---------------------------------------------------------------- definição'));
    expect(brain).not.toMatch(/s\.players\[(?!playerId)/);
  });
});
