import { describe, expect, it } from 'vitest';
import { chuvaDePedras as def, AX0, AX1, AY0, AY1, R, HALF, DURATION_MS, SLIDE_V, type RainInput, type RainState } from '../shared/minigames/chuva-de-pedras';
import { simulateMatch, computeRewards, TICK_MS } from '../shared/sim';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (d: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => { const b = makeBotProfile(i as Slot, d); return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: d }; });
const ps = players();
const [A, B, C, D] = ps.map((p) => p.id) as [string, string, string, string];
const IN: RainInput = { dx: 0, dy: 0 };
const run = (s: RainState, ms: number, inputs: Record<string, RainInput> = {}) => { for (let t = 0; t < ms; t += TICK_MS) def.step(s, inputs, TICK_MS); };
/** Estado limpo: sem quedas automáticas e jogadores em cantos afastados. */
const fresh = (seed = 1) => { const s = def.createInitialState(seed, ps); s.nextDropMs = 1e9; return s; };
const put = (s: RainState, id: string, x: number, y: number) => { const p = s.players[id]!; p.x = x; p.y = y; };
const rock = (s: RainState, x: number, y: number, vx = 0, vy = 0, owner: string | null = null) => { const r = { id: s.nextId++, x, y, vx, vy, owner, graceMs: 0 }; s.rocks.push(r); return r; };
const drop = (s: RainState, x: number, y: number, warnMs = 1000) => { s.incoming.push({ id: s.nextId++, x, y, t: 0, warnMs }); };
const corners = (s: RainState) => { put(s, A, AX0 + 8, AY0 + 8); put(s, B, AX1 - 8, AY0 + 8); put(s, C, AX0 + 8, AY1 - 8); put(s, D, AX1 - 8, AY1 - 8); };

describe('movimento', () => {
  it('anda nas 8 direções e fica dentro da arena', () => {
    const s = fresh(); corners(s); put(s, A, 200, 140);
    run(s, 300, { [A]: { dx: 1, dy: 1 } }); const p = s.players[A]!; expect(p.x).toBeGreaterThan(200); expect(p.y).toBeGreaterThan(140);
    run(s, 6000, { [A]: { dx: -1, dy: -1 } }); expect(p.x).toBe(AX0 + HALF); expect(p.y).toBe(AY0 + HALF);
  });
  it('diagonal não é mais rápida que reta', () => {
    const s = fresh(); corners(s); put(s, A, 200, 140); put(s, B, 200, 100);
    run(s, 300, { [A]: { dx: 1, dy: 1 }, [B]: { dx: 1, dy: 0 } });
    expect(Math.hypot(s.players[A]!.x - 200, s.players[A]!.y - 140)).toBeCloseTo(s.players[B]!.x - 200, 0);
  });
});

describe('queda das pedras', () => {
  it('a marcação avisa antes: a pedra só aparece no impacto e depois permanece', () => {
    const s = fresh(); corners(s); drop(s, 240, 140, 900);
    run(s, 600); expect(s.incoming.length).toBe(1); expect(s.rocks.length).toBe(0);
    run(s, 400); expect(s.incoming.length).toBe(0); expect(s.rocks.length).toBe(1);
    run(s, 3000); expect(s.rocks.length).toBe(1); expect(s.rocks[0]).toMatchObject({ x: 240, y: 140, vx: 0, vy: 0 });
  });
  it('quem fica embaixo é eliminado; quem sai a tempo vive (e a onda de choque só empurra e conta impacto)', () => {
    const s = fresh(); corners(s); put(s, A, 240, 140); put(s, B, 240 + R + 8, 140); put(s, C, 300, 200);
    drop(s, 240, 140, 500); run(s, 600);
    expect(s.players[A]!.alive).toBe(false); expect(s.players[A]!.cause).toBe('crush');
    expect(s.players[B]!.alive).toBe(true); expect(s.players[B]!.impacts).toBe(1); expect(s.players[B]!.x).toBeGreaterThan(240 + R + 8); // empurrado
    expect(s.players[C]!.impacts).toBe(0);
  });
  it('as quedas nunca nascem sobre outra marcação nem sobre pedra, e há limite de pedras', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = def.createInitialState(seed, ps); let maxN = 0;
      for (let t = 0; t < DURATION_MS; t += TICK_MS) {
        def.step(s, {}, TICK_MS); maxN = Math.max(maxN, s.rocks.length + s.incoming.length);
        for (let i = 0; i < s.incoming.length; i++) for (let j = i + 1; j < s.incoming.length; j++) expect(Math.hypot(s.incoming[i]!.x - s.incoming[j]!.x, s.incoming[i]!.y - s.incoming[j]!.y)).toBeGreaterThan(2 * R);
        for (const i of s.incoming) { expect(i.x).toBeGreaterThanOrEqual(AX0 + R); expect(i.x).toBeLessThanOrEqual(AX1 - R); expect(i.y).toBeGreaterThanOrEqual(AY0 + R); expect(i.y).toBeLessThanOrEqual(AY1 - R); }
      }
      expect(maxN).toBeLessThanOrEqual(11);
    }
  });
  it('queda por cima de uma pedra a esmaga', () => {
    const s = fresh(); corners(s); rock(s, 240, 140); drop(s, 244, 142, 300); run(s, 400);
    expect(s.rocks.length).toBe(1); expect(s.rocks[0]!.x).toBe(244);
  });
  it('cai mais rápido e com aviso menor com o passar do tempo', () => {
    const s = def.createInitialState(3, ps); const early: number[] = [], late: number[] = []; const seen = new Set<number>();
    for (let t = 0; t < DURATION_MS; t += TICK_MS) { def.step(s, {}, TICK_MS); s.rocks = []; for (const p of Object.values(s.players)) p.alive = true; for (const i of s.incoming) if (!seen.has(i.id)) { seen.add(i.id); (t < 15000 ? early : late).push(i.warnMs); } }
    expect(Math.min(...early)).toBeGreaterThan(Math.min(...late)); expect(Math.min(...late)).toBeGreaterThanOrEqual(900);
  });
});

describe('empurrar e deslizar', () => {
  it('encostar empurra: a pedra desliza para longe do ponto de contato e depois para', () => {
    const s = fresh(); corners(s); put(s, A, 200, 140); const r = rock(s, 200 + R + HALF - 1, 140);
    run(s, 100, { [A]: { dx: 1, dy: 0 } });
    expect(r.vx).toBeGreaterThan(0); expect(Math.abs(r.vy)).toBeLessThan(5); expect(r.owner).toBe(A);
    run(s, 3000); expect(r.vx).toBe(0); expect(r.x).toBeGreaterThan(230); expect(r.x).toBeLessThanOrEqual(AX1 - R);
  });
  it('empurra na diagonal e na direção oposta ao toque', () => {
    const s = fresh(); corners(s); put(s, A, 240, 140); const r = rock(s, 240 + 10, 140 + 10);
    run(s, 60, { [A]: { dx: 1, dy: 1 } }); expect(r.vx).toBeGreaterThan(0); expect(r.vy).toBeGreaterThan(0);
    expect(Math.hypot(r.vx, r.vy)).toBeLessThanOrEqual(SLIDE_V + 1);
  });
  it('as pedras respeitam os limites da arena (param na parede, escorregam em paralelo)', () => {
    const s = fresh(); corners(s); const r = rock(s, 240, 140, 270, 0); run(s, 3000);
    expect(r.x).toBeLessThanOrEqual(AX1 - R); const r2 = rock(s, 240, 100, 0, -270); run(s, 3000); expect(r2.y).toBeGreaterThanOrEqual(AY0 + R);
    const r3 = rock(s, 300, 100, 200, 200); run(s, 4000); expect(r3.x).toBeLessThanOrEqual(AX1 - R); expect(r3.y).toBeLessThanOrEqual(AY1 - R);
  });
  it('pedra encostada na parede não sai do lugar e continua sólida', () => {
    const s = fresh(); corners(s); const r = rock(s, AX1 - R, 140); put(s, A, AX1 - R - R - HALF + 2, 140);
    run(s, 300, { [A]: { dx: 1, dy: 0 } }); expect(r.vx).toBe(0); expect(r.x).toBe(AX1 - R); expect(s.players[A]!.x).toBeLessThanOrEqual(AX1 - R - R - HALF + 0.5); // bloqueado, não atravessa
  });
  it('pedra deslizando elimina quem toca e o abate vai para quem empurrou (+1 moeda)', () => {
    const s = fresh(); corners(s); put(s, A, 100 + 30, 140); put(s, B, 300, 140); const r = rock(s, 130 + R + HALF - 1, 140);
    run(s, 80, { [A]: { dx: 1, dy: 0 } }); run(s, 800);
    expect(s.players[B]!.alive).toBe(false); expect(s.players[B]!.cause).toBe('slide'); expect(s.players[A]!.kills).toBe(1); expect(s.players[A]!.alive).toBe(true);
    void r; const res = def.computeResult(s); if (res.kind !== 'ranking') throw new Error(); expect(res.bonus![A]).toBe(1);
    expect(computeRewards(res, ps)[A]).toBeGreaterThanOrEqual(1 + 3);
  });
  it('quem empurrou não é atingido pela própria pedra ao empurrar', () => {
    const s = fresh(); corners(s); put(s, A, 200, 140); rock(s, 200 + R + HALF - 2, 140); run(s, 400, { [A]: { dx: 1, dy: 0 } });
    expect(s.players[A]!.alive).toBe(true);
  });
  it('deslizando contra parada: destrói a parada e segue; duas deslizando: as duas quebram', () => {
    const s = fresh(); corners(s); const mover = rock(s, 150, 140, 270, 0), still = rock(s, 200, 140); run(s, 200);
    expect(s.rocks.find((r) => r.id === still.id)).toBeUndefined(); expect(s.rocks.find((r) => r.id === mover.id)).toBeDefined(); expect(mover.x).toBeGreaterThan(150);
    const t = fresh(); corners(t); const a = rock(t, 150, 140, 270, 0), b = rock(t, 260, 140, -270, 0); run(t, 400);
    expect(t.rocks.find((r) => r.id === a.id || r.id === b.id)).toBeUndefined();
  });
});

describe('fim, vitória e empates', () => {
  const kill = (s: RainState, id: string) => { const p = s.players[id]!; p.alive = false; p.elimAtMs = s.elapsedMs; };
  it('último vivo vence e a partida termina logo depois', () => {
    const s = fresh(); corners(s); kill(s, B); kill(s, C); run(s, 100); expect(def.isFinished(s)).toBe(false); kill(s, D); run(s, TICK_MS); run(s, 1400);
    expect(def.isFinished(s)).toBe(true); const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error(); expect(r.ranking.find((e) => e.playerId === A)!.rank).toBe(1);
  });
  it('quem caiu depois fica melhor; eliminados juntos empatam; todos eliminados juntos = empate geral', () => {
    const s = fresh(); corners(s); run(s, 1000); kill(s, B); run(s, 1000); kill(s, C); kill(s, D); run(s, 1500);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error(); const rk = (id: string) => r.ranking.find((e) => e.playerId === id)!.rank;
    expect(rk(A)).toBe(1); expect(rk(C)).toBe(rk(D)); expect(rk(C)).toBeLessThan(rk(B));
    const t = fresh(); corners(t); run(t, 500); for (const id of [A, B, C, D]) kill(t, id); run(t, 1500);
    const r2 = def.computeResult(t); if (r2.kind !== 'ranking') throw new Error(); expect(new Set(r2.ranking.map((e) => e.rank)).size).toBe(1);
  });
  it('tempo esgotado: vivos vencem; entre vivos, menos impactos; iguais dividem', () => {
    const s = fresh(); corners(s); kill(s, D); s.players[A]!.impacts = 0; s.players[B]!.impacts = 2; s.players[C]!.impacts = 0;
    run(s, DURATION_MS + 100); expect(def.isFinished(s)).toBe(true);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error(); const rk = (id: string) => r.ranking.find((e) => e.playerId === id)!.rank;
    expect(rk(A)).toBe(1); expect(rk(C)).toBe(1); expect(rk(B)).toBe(3); expect(rk(D)).toBe(4);
    expect(def.formatScore!(r.ranking[0]!.score)).toContain('0 impactos'); expect(def.formatScore!(r.ranking.find((e) => e.playerId === B)!.score)).toContain('2 impactos');
  });
  it('rejeita inputs inválidos; eliminado não age', () => {
    for (const bad of [null, 'x', { dx: 2, dy: 0 }, { dx: 0 }]) expect(def.sanitizeInput(bad)).toBeNull();
    expect(def.sanitizeInput({ dx: 1, dy: -1 })).toEqual({ dx: 1, dy: -1 });
    const s = fresh(); corners(s); kill(s, A); const x = s.players[A]!.x; run(s, 300, { [A]: { dx: 1, dy: 0 } }); expect(s.players[A]!.x).toBe(x);
  });
});

describe('bots', () => {
  it('partidas só com bots terminam com ranking válido; há eliminações e abates por pedra empurrada', () => {
    let elim = 0, kills = 0, dur = 0; const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const o = simulateMatch(def, players('medium'), seed); expect(Object.keys(o.rewards)).toHaveLength(4);
      const st = o.finalState as RainState; elim += Object.values(st.players).filter((p) => !p.alive).length; kills += Object.values(st.players).reduce((a, p) => a + p.kills, 0); dur += st.elapsedMs;
    }
    console.log('chuva: eliminações/jogo', (elim / N).toFixed(2), 'abates por pedra/jogo', (kills / N).toFixed(2), 'duração média s', (dur / N / 1000).toFixed(1));
    expect(elim / N).toBeGreaterThan(1);
  });
  it('bots fáceis são esmagados pelas quedas bem mais que os difíceis (desviam pior)', () => {
    const crushed = (d: 'easy' | 'hard') => { let n = 0; for (let seed = 1; seed <= 60; seed++) n += Object.values(simulateMatch(def, players(d), seed).finalState.players).filter((p) => p.cause === 'crush').length; return n; };
    const e = crushed('easy'), h = crushed('hard'); console.log('esmagados em 60 jogos: fácil', e, 'difícil', h);
    expect(e).toBeGreaterThan(h);
  });
  it('determinística', () => { expect(simulateMatch(def, players(), 9).result).toEqual(simulateMatch(def, players(), 9).result); });
});
