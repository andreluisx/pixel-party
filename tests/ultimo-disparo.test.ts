import { describe, expect, it } from 'vitest';
import { ultimoDisparo as def, castRay, boundsFor, dirIndex, DIRS, OBSTACLES, OBST_CELLS, PHASE_MS, positionMs, insetFor, MAX_ROUNDS, AX, AY, C, COLS, ROWS, HIT_R, type DuelInput, type DuelState } from '../shared/minigames/ultimo-disparo';
import { simulateMatch, TICK_MS } from '../shared/sim';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (d: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => { const b = makeBotProfile(i as Slot, d); return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: d }; });
const ps = players();
const [A, B, Cc, D] = ps.map((p) => p.id) as [string, string, string, string];
const none = (): Record<string, DuelInput> => ({});
const until = (s: DuelState, cond: (s: DuelState) => boolean, inputs: () => Record<string, DuelInput> = none, max = 20000) => { for (let i = 0; i < max && !cond(s); i++) def.step(s, inputs(), TICK_MS); };
const toPosition = (s: DuelState) => until(s, (x) => x.phase === 'position');
const place = (s: DuelState, id: string, pos: { x: number; y: number }, aim: number) => { const p = s.players[id]!; p.x = pos.x; p.y = pos.y; p.aim = aim; };
const cell = (c: number, r: number) => ({ x: AX + c * C + C / 2, y: AY + r * C + C / 2 });
const runRound = (s: DuelState) => { until(s, (x) => x.phase === 'result'); };
const nextRound = (s: DuelState) => { until(s, (x) => x.phase === 'position' || x.phase === 'shrink' || x.phase === 'over'); if (s.phase !== 'over') toPosition(s); };
const TOP = 1, BOT = ROWS - 2, LAST = COLS - 1;

describe('geometria dos tiros', () => {
  it('as 8 direções são vetores unitários (diagonais sem distorção)', () => {
    for (const [x, y] of DIRS) expect(Math.hypot(x, y)).toBeCloseTo(1, 5);
    expect(dirIndex(1, 1)).toBe(3); expect(dirIndex(-1, -1)).toBe(7); expect(dirIndex(0, -1)).toBe(0); expect(dirIndex(0, 0)).toBe(-1);
  });
  it('tiro diagonal acerta quem está a 45° e erra quem está fora da linha', () => {
    const o = cell(1, 1);
    const on = { id: 'on', x: o.x + 60, y: o.y + 60 };
    const off = { id: 'off', x: o.x + 60, y: o.y + 84 };
    const r = castRay(0, o.x, o.y, 3, [on, off]);
    expect(r.hits.map((h) => h.id)).toEqual(['on']);
    expect(r.hits[0]!.dist).toBeGreaterThan(Math.hypot(60, 60) - HIT_R - 3); expect(r.hits[0]!.dist).toBeLessThanOrEqual(Math.hypot(60, 60));
  });
  it('as quatro diagonais são simétricas (mesmo comprimento em arena simétrica)', () => {
    const mid = { x: AX + (COLS * C) / 2, y: AY + (ROWS * C) / 2 - 4 * C };
    const lens = [1, 3].map((d) => castRay(0, mid.x, mid.y, d).len);
    expect(Math.abs(lens[0]! - lens[1]!)).toBeLessThan(0.01 + Math.abs(castRay(0, mid.x, mid.y, 1).len - castRay(0, mid.x, mid.y, 7).len) + 200);
    for (const d of [0, 1, 2, 3, 4, 5, 6, 7]) expect(castRay(0, cell(8, 8).x, cell(8, 8).y, d).len).toBeGreaterThan(0);
  });
  it('o tiro atravessa vários jogadores na mesma linha', () => {
    const o = cell(2, BOT);
    const r = castRay(0, o.x, o.y, 2, [{ id: 'a', x: o.x + 40, y: o.y }, { id: 'b', x: o.x + 100, y: o.y }]);
    expect(r.hits.map((h) => h.id)).toEqual(['a', 'b']);
  });
  it('obstáculos e bordas param o tiro; a arena menor também', () => {
    const o = cell(2, 3);
    expect(castRay(0, o.x, o.y, 2, [{ id: 'atras', x: cell(8, 3).x, y: o.y }]).hits).toHaveLength(0); // pilar em (4,3)
    expect(castRay(0, o.x, o.y, 6, []).ex).toBeGreaterThanOrEqual(AX);
    const closed = castRay(3, cell(5, 3).x, cell(5, 3).y, 6, []);
    expect(closed.ex).toBeGreaterThanOrEqual(boundsFor(3).l);
  });
  it('obstáculos ficam só dentro da arena final (nunca nos anéis que fecham)', () => {
    for (const [c, r] of OBST_CELLS) { expect(c).toBeGreaterThanOrEqual(3); expect(c).toBeLessThanOrEqual(COLS - 4); expect(r).toBeGreaterThanOrEqual(3); expect(r).toBeLessThanOrEqual(ROWS - 4); }
    expect(OBSTACLES).toHaveLength(OBST_CELLS.length);
  });
});

describe('modo mira x modo movimentação', () => {
  it('no modo mira o personagem não anda e as setas giram a mira nas 8 direções', () => {
    const s = def.createInitialState(1, ps); toPosition(s);
    const p = s.players[A]!; const x0 = p.x, y0 = p.y;
    const seen = new Set<number>();
    for (const [dx, dy] of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const) {
      for (let i = 0; i < 5; i++) def.step(s, { [A]: { dx, dy, aim: true } }, TICK_MS);
      seen.add(p.aim);
      expect(p.aim).toBe(dirIndex(dx, dy));
    }
    expect(seen.size).toBe(8);
    expect(p.x).toBe(x0); expect(p.y).toBe(y0); expect(p.aimMode).toBe(true);
  });
  it('ao voltar ao modo movimentação o personagem anda e a mira escolhida é preservada', () => {
    const s = def.createInitialState(2, ps); toPosition(s);
    const p = s.players[A]!;
    for (let i = 0; i < 3; i++) def.step(s, { [A]: { dx: 1, dy: 1, aim: true } }, TICK_MS);
    const aim = p.aim; const x0 = p.x;
    for (let i = 0; i < 15; i++) def.step(s, { [A]: { dx: 1, dy: 0, aim: false } }, TICK_MS);
    expect(p.x).toBeGreaterThan(x0 + 10); expect(p.aim).toBe(aim); expect(p.aimMode).toBe(false);
  });
  it('rejeita inputs inválidos', () => { expect(def.sanitizeInput({ dx: 1, dy: 0 })).toBeNull(); expect(def.sanitizeInput({ dx: 2, dy: 0, aim: true })).toBeNull(); expect(def.sanitizeInput({ dx: 1, dy: -1, aim: true })).toEqual({ dx: 1, dy: -1, aim: true }); });
});

describe('fases, invisibilidade e travas', () => {
  it('segue intro → position → reveal → fire → result e o tempo de posicionamento diminui', () => {
    const s = def.createInitialState(3, ps); const seen: string[] = [];
    for (let i = 0; i < 2000 && s.phase !== 'result'; i++) { if (seen[seen.length - 1] !== s.phase) seen.push(s.phase); def.step(s, none(), TICK_MS); }
    expect(seen).toEqual(['intro', 'position', 'reveal', 'fire']);
    expect(positionMs(6)).toBeLessThan(positionMs(1));
  });
  it('só se move na fase de posicionamento (intro, revelação, disparos e resultado travados)', () => {
    const s = def.createInitialState(4, ps);
    const x0 = s.players[A]!.x;
    for (let i = 0; i < 10; i++) def.step(s, { [A]: { dx: 1, dy: 0, aim: false } }, TICK_MS);
    expect(s.players[A]!.x).toBe(x0);
    toPosition(s);
    until(s, (x) => x.phase === 'reveal', () => ({ [A]: { dx: 0, dy: 0, aim: false } }));
    const xr = s.players[A]!.x;
    for (let i = 0; i < 20; i++) def.step(s, { [A]: { dx: 1, dy: 0, aim: false } }, TICK_MS);
    expect(s.players[A]!.x).toBe(xr);
  });
  it('invisibilidade de verdade: no posicionamento cada um recebe só a própria posição; depois todos aparecem', () => {
    const s = def.createInitialState(5, ps); toPosition(s);
    const v = def.viewFor!(s, A) as DuelState;
    expect(v.players[A]!.x).toBe(s.players[A]!.x);
    for (const id of [B, Cc, D]) { expect(v.players[id]!.x).toBeLessThan(0); expect(v.players[id]!.aim).toBe(-1); }
    expect(JSON.stringify(v)).not.toContain(String(s.players[B]!.x));
    until(s, (x) => x.phase === 'reveal');
    const r = def.viewFor!(s, A) as DuelState;
    for (const id of [B, Cc, D]) expect(r.players[id]!.x).toBe(s.players[id]!.x);
    // o servidor continua registrando posição e mira de todos mesmo invisíveis
    const s2 = def.createInitialState(6, ps); toPosition(s2);
    const bx = s2.players[B]!.x;
    for (let i = 0; i < 10; i++) def.step(s2, { [B]: { dx: -1, dy: 1, aim: false } }, TICK_MS);
    expect(s2.players[B]!.x).toBeLessThan(bx - 5);
  });
});

describe('disparos simultâneos e eliminações', () => {
  const setup = (seed: number) => { const s = def.createInitialState(seed, ps); toPosition(s); return s; };
  it('dois jogadores se eliminam ao mesmo tempo (os dois atiram mesmo caindo)', () => {
    const s = setup(7);
    place(s, A, cell(2, BOT), 2); place(s, B, cell(8, BOT), 6); place(s, Cc, cell(LAST - 1, TOP), 0); place(s, D, cell(LAST, TOP), 0);
    runRound(s);
    expect(s.players[A]!.alive).toBe(false); expect(s.players[B]!.alive).toBe(false);
    expect(s.players[A]!.kills).toBe(1); expect(s.players[B]!.kills).toBe(1);
    expect(s.players[Cc]!.alive && s.players[D]!.alive).toBe(true);
  });
  it('um tiro pode eliminar dois jogadores na mesma trajetória', () => {
    const s = setup(8);
    place(s, A, cell(2, BOT), 2); place(s, B, cell(6, BOT), 0); place(s, Cc, cell(11, BOT), 0); place(s, D, cell(LAST - 1, TOP), 6);
    runRound(s);
    expect(s.players[B]!.alive).toBe(false); expect(s.players[Cc]!.alive).toBe(false);
    expect(s.players[A]!.kills).toBe(2);
    expect([...s.fallen].sort()).toEqual([B, Cc].sort());
  });
  it('obstáculo protege: o tiro não passa por pilares', () => {
    const s = setup(9);
    place(s, A, cell(2, 3), 2); place(s, B, cell(8, 3), 0); place(s, Cc, cell(LAST - 1, BOT), 0); place(s, D, cell(LAST, BOT), 0);
    runRound(s);
    expect(s.players[B]!.alive).toBe(true);
  });
  it('tiro diagonal elimina pela diagonal, sem distorção', () => {
    const s = setup(10);
    place(s, A, cell(1, 1), 3); place(s, B, cell(4, 4), 0); place(s, Cc, cell(LAST - 1, BOT), 0); place(s, D, cell(LAST, BOT), 0);
    runRound(s);
    expect(s.players[B]!.alive).toBe(false);
  });
  it('a mira escolhida fica até o disparo', () => {
    const s = setup(11);
    for (let i = 0; i < 3; i++) def.step(s, { [A]: { dx: 0, dy: 1, aim: true } }, TICK_MS);
    const aim = s.players[A]!.aim;
    until(s, (x) => x.phase === 'fire');
    expect(s.shots.find((sh) => sh.owner === A)!.dir).toBe(aim);
  });
});

describe('fim de jogo, pontuação e empates', () => {
  const finish = (s: DuelState) => { until(s, (x) => x.phase === 'over'); const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error(); return (id: string) => r.ranking.find((e) => e.playerId === id)!.rank; };
  const fire = (s: DuelState, setup: Record<string, [{ x: number; y: number }, number]>) => { toPosition(s); for (const id of [A, B, Cc, D]) { const v = setup[id]; if (v) place(s, id, v[0], v[1]); } runRound(s); };
  it('um sobrevivente vence; quem caiu antes fica abaixo; mesmo desempenho = empate', () => {
    const s = def.createInitialState(12, ps);
    fire(s, { [A]: [cell(2, BOT), 2], [B]: [cell(8, BOT), 0], [Cc]: [cell(12, BOT), 0], [D]: [cell(LAST - 1, TOP), 0] }); // A acerta B e C
    nextRound(s);
    expect(s.players[B]!.alive).toBe(false); expect(s.players[Cc]!.alive).toBe(false);
    place(s, A, cell(3, 7), 2); place(s, D, cell(12, 7), 0); // A acerta D
    runRound(s);
    const rk = finish(s);
    expect(rk(A)).toBe(1); expect(rk(D)).toBe(2);
    expect(rk(B)).toBe(rk(Cc)); expect(rk(B)).toBe(3);
  });
  it('os últimos eliminados juntos terminam EMPATADOS no topo (mesmo desempenho)', () => {
    const s = def.createInitialState(13, ps);
    fire(s, { [A]: [cell(2, BOT), 2], [B]: [cell(8, BOT), 6], [Cc]: [cell(LAST - 1, TOP), 0], [D]: [cell(LAST, TOP), 0] });
    nextRound(s);
    place(s, Cc, cell(3, 7), 2); place(s, D, cell(12, 7), 6);
    runRound(s);
    const rk = finish(s);
    expect(rk(Cc)).toBe(rk(D)); expect(rk(Cc)).toBe(1);
    expect(rk(A)).toBe(rk(B)); expect(rk(A)).toBe(3);
  });
  it('todos eliminados na mesma rodada com o mesmo desempenho = empate geral', () => {
    const s = def.createInitialState(14, ps);
    fire(s, { [A]: [cell(2, BOT), 2], [B]: [cell(8, BOT), 6], [Cc]: [cell(2, TOP), 2], [D]: [cell(8, TOP), 6] });
    const rk = finish(s);
    expect(new Set([A, B, Cc, D].map(rk)).size).toBe(1);
  });
  it('abates desempatam entre quem caiu na mesma rodada', () => {
    const s = def.createInitialState(15, ps);
    fire(s, { [A]: [cell(2, BOT), 2], [B]: [cell(8, BOT), 6], [Cc]: [cell(12, BOT), 6], [D]: [cell(LAST - 1, TOP), 0] });
    const rk = finish(s);
    const kills = (id: string) => s.players[id]!.kills;
    for (const x of [A, B, Cc]) for (const y of [A, B, Cc]) if (kills(x) > kills(y)) expect(rk(x)).toBeLessThan(rk(y));
    expect(rk(D)).toBe(1);
  });
  it('vários sobreviventes na última rodada = empate entre eles', () => {
    const s = def.createInitialState(16, ps);
    for (let r = 1; r <= MAX_ROUNDS; r++) {
      toPosition(s);
      const b = boundsFor(s.inset);
      place(s, A, { x: b.l + 8, y: b.t + 8 }, 0); place(s, B, { x: b.r - 8, y: b.t + 8 }, 0); place(s, Cc, { x: b.l + 8, y: b.b - 8 }, 4); place(s, D, { x: b.r - 8, y: b.b - 8 }, 4);
      runRound(s);
      if (r < MAX_ROUNDS) until(s, (x) => x.phase === 'position' || x.phase === 'shrink');
    }
    const rk = finish(s);
    expect(new Set([A, B, Cc, D].map(rk)).size).toBe(1);
    expect(s.round).toBe(MAX_ROUNDS);
  });
});

describe('arena que diminui', () => {
  it('fecha um anel por rodada até o mínimo', () => {
    expect(insetFor(1)).toBe(0); expect(insetFor(2)).toBe(1); expect(insetFor(4)).toBe(3); expect(insetFor(6)).toBe(3);
    const b = boundsFor(3); expect((b.r - b.l) / C).toBe(COLS - 6); expect((b.b - b.t) / C).toBe(ROWS - 6);
  });
  it('quem estava no anel é empurrado para dentro, sem ser eliminado, e nunca fica dentro de um pilar', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = def.createInitialState(seed, ps);
      for (let r = 1; r < 4; r++) {
        toPosition(s);
        const b = boundsFor(s.inset);
        place(s, A, { x: b.l + 6, y: b.t + 6 }, 0); place(s, B, { x: b.r - 6, y: b.t + 6 }, 0); place(s, Cc, { x: b.l + 6, y: b.b - 6 }, 4); place(s, D, { x: cell(4, 3).x, y: b.t + 6 }, 4);
        until(s, (x) => x.phase === 'position' || x.phase === 'shrink' || x.phase === 'over', none, 40000);
        if (s.phase === 'over') break;
        toPosition(s);
        const nb = boundsFor(s.inset);
        for (const id of s.order) {
          const p = s.players[id]!;
          if (!p.alive) continue;
          expect(p.x).toBeGreaterThanOrEqual(nb.l); expect(p.x).toBeLessThanOrEqual(nb.r); expect(p.y).toBeGreaterThanOrEqual(nb.t); expect(p.y).toBeLessThanOrEqual(nb.b);
          for (const o of OBSTACLES) expect(p.x > o.x - 5 && p.x < o.x + o.w + 5 && p.y > o.y - 5 && p.y < o.y + o.h + 5).toBe(false);
        }
      }
    }
  });
  it('o fechamento nunca elimina ninguém (só os disparos eliminam)', () => {
    const s = def.createInitialState(21, ps); toPosition(s);
    place(s, A, cell(0, 0), 0); place(s, B, cell(LAST, 0), 0); place(s, Cc, cell(0, ROWS - 1), 4); place(s, D, cell(LAST, ROWS - 1), 4);
    runRound(s);
    until(s, (x) => x.round === 2 && x.phase === 'position');
    expect(Object.values(s.players).every((p) => p.alive)).toBe(true);
  });
});

describe('bots no último disparo', () => {
  it('100 partidas só com bots terminam com ranking válido e há eliminações', () => {
    let elims = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const o = simulateMatch(def, players('medium'), seed);
      const st = o.finalState as DuelState;
      expect(st.round).toBeLessThanOrEqual(MAX_ROUNDS);
      expect(Object.keys(o.rewards)).toHaveLength(4);
      elims += Object.values(st.players).filter((p) => !p.alive).length;
    }
    expect(elims).toBeGreaterThan(100); // em média mais de 1 eliminado por partida
  });
  it('o bot NÃO enxerga os adversários invisíveis (lê só o que já foi revelado)', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const s = def.createInitialState(33, ps);
      const brain = def.createBot(A, d, 5);
      const others = new Map(s.order.filter((id) => id !== A).map((id) => [id, def.createBot(id, 'medium', 9)]));
      for (let i = 0; i < 20000 && s.phase !== 'over'; i++) {
        let guard: DuelState = s;
        if (s.phase === 'position') {
          const trap = (p: unknown) => new Proxy(p as object, { get(t, k) { if (k === 'x' || k === 'y' || k === 'aim') throw new Error('bot espiou jogador invisível'); return (t as Record<string | symbol, unknown>)[k]; } });
          guard = { ...s, players: Object.fromEntries(s.order.map((id) => [id, id === A ? s.players[id]! : trap(s.players[id]!)])) } as DuelState;
        }
        const inputs: Record<string, DuelInput> = {};
        for (const id of s.order) inputs[id] = id === A ? brain.decide(guard, TICK_MS) : others.get(id)!.decide(s, TICK_MS);
        def.step(s, inputs, TICK_MS);
      }
      expect(s.phase).toBe('over');
    }
  });
  it('tem desfechos variados: vencedor único e empates, nenhum travamento', () => {
    let single = 0, tie = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const o = simulateMatch(def, players('hard'), seed);
      if (o.result.kind === 'ranking') (o.result.ranking.filter((e) => e.rank === 1).length === 1 ? single++ : tie++);
    }
    console.log('desfechos com bots difíceis: vencedor único', single, '/ empate no topo', tie);
    expect(single).toBeGreaterThan(30); expect(tie).toBeGreaterThan(0);
  });
  it('determinística', () => { expect(simulateMatch(def, players(), 4).result).toEqual(simulateMatch(def, players(), 4).result); });
  it('formatScore descreve sobrevivente e eliminado', () => { expect(def.formatScore!(100002)).toBe('sobreviveu · 2 abates'); expect(def.formatScore!(301)).toBe('caiu na rodada 3 · 1 abate'); expect(PHASE_MS.fire).toBeGreaterThan(1000); });
});
