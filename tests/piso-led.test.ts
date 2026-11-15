import { describe, expect, it } from 'vitest';
import { pisoLed as def, tileAt, tileCenter, timesFor, COLS, MAX_ROUNDS, TILES, revealedColor, type LedInput, type LedPublic, type LedState } from '../shared/minigames/piso-led';
import { simulateMatch, TICK_MS } from '../shared/sim';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (d: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => {
    const b = makeBotProfile(i as Slot, d);
    return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: d };
  });
const ps = players();
const ids = ps.map((p) => p.id);
const none = (): Record<string, LedInput> => ({});
const until = (s: LedState, cond: (s: LedState) => boolean, inputs: () => Record<string, LedInput> = none, max = 6000) => { for (let i = 0; i < max && !cond(s); i++) def.step(s, inputs(), TICK_MS); };
const put = (s: LedState, id: string, tile: number) => { const c = tileCenter(tile); s.players[id]!.x = c.x; s.players[id]!.y = c.y; };
const pub = (s: LedState) => def.publicState!(s) as LedPublic;
const final = (s: LedState) => s.cfgs[2]!;

describe('fases e informação escondida', () => {
  it('segue banner → show → dark → judge e começa na rodada 1', () => {
    const s = def.createInitialState(1, ps);
    expect(s.phase).toBe('banner'); expect(s.round).toBe(1);
    const seen: string[] = [];
    for (let i = 0; i < 1000 && s.phase !== 'judge'; i++) { if (seen[seen.length - 1] !== s.phase) seen.push(s.phase); def.step(s, none(), TICK_MS); }
    expect(seen).toEqual(['banner', 'show', 'dark']);
    expect(s.phase).toBe('judge');
  });
  it('mostra 3 configurações com apagão curto entre elas; a última é a final', () => {
    const s = def.createInitialState(2, ps);
    until(s, (x) => x.phase === 'show');
    const T = timesFor(1);
    const lit: number[][] = [];
    let last: number[] | null = null;
    for (let i = 0; i < 400 && s.phase === 'show'; i++) {
      def.step(s, none(), TICK_MS);
      const v = pub(s).visible;
      if (v && v !== last) lit.push(v);
      last = v;
    }
    expect(T.show).toBeGreaterThan(4000);
    expect(lit.length).toBe(3);
    expect(lit[2]).toEqual(final(s));
    expect(lit[0]).not.toEqual(lit[2]);
  });
  it('o estado público nunca traz as configurações nem o gerador, e esconde a cor até o anúncio', () => {
    const s = def.createInitialState(3, ps);
    for (let i = 0; i < 2000 && s.phase !== 'judge'; i++) {
      def.step(s, none(), TICK_MS);
      const p = pub(s);
      expect(p.cfgs).toEqual([]); expect(p.rng).toBe(0);
      if ((s.phase as string) !== 'judge') expect(p.finalCfg).toBeNull();
      if (s.phase === 'banner' || s.phase === 'show' || (s.phase === 'dark' && s.phaseMs < timesFor(1).darkLead)) { expect(p.announced).toBe(-1); expect(p.validTiles).toEqual([]); }
      if (s.phase === 'dark' && s.phaseMs >= timesFor(1).darkLead) expect(p.announced).toBe(s.announced);
      if (s.phase === 'dark') expect(p.visible).toBeNull(); // chão apagado
    }
    const j = pub(s);
    expect(j.finalCfg).toEqual(final(s));
    expect(j.validTiles.length).toBeGreaterThanOrEqual(12);
    expect(revealedColor(s)).toBe(s.announced);
  });
});

describe('regra principal: só a terceira configuração vale', () => {
  it('quem está numa placa da cor anunciada na ÚLTIMA sobrevive; as outras (inclusive da 1ª/2ª) eliminam', () => {
    const s = def.createInitialState(5, ps);
    const f = final(s), ann = s.announced;
    const good = f.findIndex((c) => c === ann);
    const wrongButInFirst = s.cfgs[0]!.findIndex((c, i) => c === ann && f[i] !== ann); // cor certa na 1ª, mas não na última
    const wrongPlain = f.findIndex((c) => c !== ann);
    expect(wrongButInFirst).toBeGreaterThanOrEqual(0);
    until(s, (x) => x.phase === 'dark' && x.phaseMs > 800);
    put(s, ids[0]!, good); put(s, ids[1]!, wrongButInFirst); put(s, ids[2]!, wrongPlain); put(s, ids[3]!, good);
    until(s, (x) => x.phase === 'judge', () => Object.fromEntries(ids.map((id) => [id, { dx: 0, dy: 0 } as LedInput])));
    expect(s.players[ids[0]!]!.alive).toBe(true);
    expect(s.players[ids[1]!]!.alive).toBe(false);
    expect(s.players[ids[2]!]!.alive).toBe(false);
    expect(s.players[ids[3]!]!.alive).toBe(true);
    expect(s.players[ids[1]!]!.elimRound).toBe(1);
  });
  it('dá para se mexer durante as luzes e no escuro, mas não no julgamento; eliminado não se mexe', () => {
    const s = def.createInitialState(6, ps);
    const x0 = s.players[ids[0]!]!.x;
    until(s, (x) => x.phase === 'show');
    for (let i = 0; i < 15; i++) def.step(s, { [ids[0]!]: { dx: 1, dy: 0 } }, TICK_MS);
    expect(s.players[ids[0]!]!.x).toBeGreaterThan(x0 + 10);
    until(s, (x) => x.phase === 'judge');
    const xj = s.players[ids[0]!]!.x;
    for (let i = 0; i < 10; i++) def.step(s, { [ids[0]!]: { dx: 1, dy: 0 } }, TICK_MS);
    expect(s.players[ids[0]!]!.x).toBe(xj);
  });
  it('fica dentro da arena', () => {
    const s = def.createInitialState(7, ps);
    for (let i = 0; i < 600; i++) def.step(s, { [ids[0]!]: { dx: -1, dy: -1 } }, TICK_MS);
    expect(tileAt(s.players[ids[0]!]!.x, s.players[ids[0]!]!.y)).toBe(0);
  });
});

describe('rodadas e fim', () => {
  const stand = (s: LedState, who: string[]) => { for (const id of ids) { const good = final(s).findIndex((c) => c === s.announced); const bad = final(s).findIndex((c) => c !== s.announced); put(s, id, who.includes(id) ? good : bad); } };
  const runRound = (s: LedState, survivors: string[]) => {
    until(s, (x) => x.phase === 'dark' && x.phaseMs > 800);
    stand(s, survivors);
    until(s, (x) => x.phase === 'judge');
  };
  it('termina quando sobra 1: o vencedor ganha; os eliminados na mesma rodada empatam', () => {
    const s = def.createInitialState(8, ps);
    runRound(s, [ids[0]!]);
    until(s, (x) => x.phase === 'over');
    const r = def.computeResult(s);
    if (r.kind !== 'ranking') throw new Error();
    expect(r.ranking.find((e) => e.playerId === ids[0])!.rank).toBe(1);
    expect(new Set(r.ranking.filter((e) => e.playerId !== ids[0]).map((e) => e.rank))).toEqual(new Set([2]));
  });
  it('rodada nova quando ainda há 2+ vivos: mais rápida e com menos placas certas', () => {
    const s = def.createInitialState(9, ps);
    runRound(s, [ids[0]!, ids[1]!]);
    until(s, (x) => x.round === 2);
    expect(s.round).toBe(2);
    expect(timesFor(2).move).toBeLessThan(timesFor(1).move);
    expect(timesFor(7).showEach).toBeLessThan(timesFor(1).showEach);
    expect(s.players[ids[2]!]!.alive).toBe(false);
    expect(s.players[ids[0]!]!.survived).toBe(1);
  });
  it('eliminação dos últimos ao mesmo tempo é empate entre eles (acima de quem caiu antes)', () => {
    const s = def.createInitialState(10, ps);
    runRound(s, [ids[0]!, ids[1]!]);
    until(s, (x) => x.round === 2);
    runRound(s, []); // os dois erram juntos
    until(s, (x) => x.phase === 'over');
    const r = def.computeResult(s);
    if (r.kind !== 'ranking') throw new Error();
    const rk = (id: string) => r.ranking.find((e) => e.playerId === id)!.rank;
    expect(rk(ids[0]!)).toBe(rk(ids[1]!));
    expect(rk(ids[0]!)).toBeLessThan(rk(ids[2]!));
  });
  it('na última rodada, vários vivos = empate no topo', () => {
    const s = def.createInitialState(11, ps);
    for (let r = 1; r <= MAX_ROUNDS; r++) { runRound(s, [ids[0]!, ids[1]!]); if (r < MAX_ROUNDS) until(s, (x) => x.round === r + 1); }
    until(s, (x) => x.phase === 'over');
    const res = def.computeResult(s);
    if (res.kind !== 'ranking') throw new Error();
    expect(res.ranking.filter((e) => e.rank === 1)).toHaveLength(2);
  });
  it('placas certas diminuem ao longo das rodadas e a final sempre tem ao menos 5', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = def.createInitialState(seed, ps);
      const counts: number[] = [];
      for (let r = 1; r <= MAX_ROUNDS; r++) {
        until(s, (x) => x.phase === 'dark');
        counts.push(final(s).filter((c) => c === s.announced).length);
        expect(final(s).length).toBe(TILES);
        stand(s, [ids[0]!, ids[1]!]); until(s, (x) => x.phase === 'judge');
        if (r < MAX_ROUNDS) until(s, (x) => x.round === r + 1);
      }
      expect(counts.every((c) => c >= 5)).toBe(true);
      expect(counts[0]!).toBeGreaterThan(counts[MAX_ROUNDS - 1]!);
    }
  });
  it('rejeita inputs inválidos', () => { expect(def.sanitizeInput({ dx: 2, dy: 0 })).toBeNull(); expect(def.sanitizeInput({ dx: 1, dy: -1 })).toEqual({ dx: 1, dy: -1 }); expect(COLS).toBe(10); });
});

describe('bots no piso de LED', () => {
  it('100 partidas só com bots terminam com ranking válido em até 7 rodadas', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const o = simulateMatch(def, players('medium'), seed);
      const st = o.finalState as LedState;
      expect(st.round).toBeLessThanOrEqual(MAX_ROUNDS);
      expect(Object.keys(o.rewards)).toHaveLength(4);
    }
  });
  it('bots melhores sobrevivem mais; difícil costuma vencer fácil', () => {
    const surv: Record<string, number> = {}; let wins = 0, games = 0;
    for (const d of ['easy', 'medium', 'hard'] as const) {
      let tot = 0, n = 0;
      for (let seed = 1; seed <= 40; seed++) { const o = simulateMatch(def, players(d), seed); for (const p of Object.values((o.finalState as LedState).players)) { tot += p.survived; n++; } }
      surv[d] = tot / n;
    }
    for (let seed = 1; seed <= 60; seed++) {
      const q = players('easy'); q[0]!.difficulty = 'hard';
      const o = simulateMatch(def, q, seed);
      if (o.result.kind === 'ranking') { games++; const me = o.result.ranking.find((e) => e.playerId === q[0]!.id)!; if (me.rank === 1) wins++; }
    }
    console.log('rodadas sobrevividas (média por bot)', surv, 'hard no 1º lugar contra 3 easy', wins, '/', games);
    expect(surv.hard!).toBeGreaterThan(surv.medium!); expect(surv.medium!).toBeGreaterThan(surv.easy!);
    expect(wins / games).toBeGreaterThan(0.5);
  });
  it('determinística', () => { expect(simulateMatch(def, players(), 4).result).toEqual(simulateMatch(def, players(), 4).result); });
  it('bot nunca lê as configurações escondidas (só o que está aceso)', () => {
    const src = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../shared/minigames/piso-led.ts'), 'utf8') as string;
    const brain = src.slice(src.indexOf('function createBrain'), src.indexOf('// ---------------------------------------------------------------- definição'));
    expect(brain).not.toMatch(/\.cfgs/);
    expect(brain).not.toMatch(/\.announced\b/);
  });
});
