import { describe, expect, it } from 'vitest';
import {
  AIM_MS, BR, GOALS_TO_WIN, CX, CY, DURATION_MS, FX0, FX1, FY0, FY1, GOAL_H, GOAL_MS, PR, POWER_PERIOD_MS, futebolBotao as def, keeperY, powerAt, speedFor,
  type FutebolInput, type FutebolState,
} from '../shared/minigames/futebol-botao';
import { computeRewards, simulateMatch, TICK_MS } from '../shared/sim';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (d: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => {
    const b = makeBotProfile(i as Slot, d);
    return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: d };
  });
const ps = players();
const IDLE: FutebolInput = { turn: 0, aim: null, snap: 0, charge: false };
const tick = (s: FutebolState, inp: Partial<FutebolInput> = {}, n = 1) => {
  for (let i = 0; i < n; i++) def.step(s, { [s.cur]: { ...IDLE, ...inp } }, TICK_MS);
};
const me = (s: FutebolState) => s.pieces.find((p) => p.id === s.cur)!;
/** deixa tudo parado e pronto para a próxima jogada */
const settle = (s: FutebolState) => { for (let i = 0; i < 300 && s.phase === 'roll'; i++) tick(s); };

describe('duplas e turnos', () => {
  it('duas duplas de dois, sorteadas pela seed (determinístico, muda com a seed)', () => {
    const a = def.createInitialState(7, ps), b = def.createInitialState(7, ps);
    expect(a.members).toEqual(b.members);
    expect(a.members[0]).toHaveLength(2); expect(a.members[1]).toHaveLength(2);
    expect(new Set([...a.members[0], ...a.members[1]]).size).toBe(4);
    const variants = new Set(Array.from({ length: 30 }, (_, i) => def.createInitialState(i + 1, ps).members[0].slice().sort().join()));
    expect(variants.size).toBeGreaterThan(2);
  });
  it('as equipes se alternam e dentro da dupla os jogadores se alternam', () => {
    const s = def.createInitialState(3, ps);
    const seq: string[] = [s.cur];
    const teams: number[] = [s.teams[s.cur]!];
    for (let k = 0; k < 6; k++) {
      tick(s, { charge: false }, AIM_MS / TICK_MS + 2); // estoura o tempo: joga sozinho
      settle(s);
      if (s.phase === 'goal' || s.phase === 'over') break;
      seq.push(s.cur); teams.push(s.teams[s.cur]!);
    }
    for (let i = 1; i < teams.length; i++) expect(teams[i]).not.toBe(teams[i - 1]);
    expect(teams.length).toBeGreaterThanOrEqual(4);
    expect(seq[0]).not.toBe(seq[2]); // dentro da dupla, quem jogou dá a vez ao parceiro
    expect(seq[0]).toBe(seq[4] ?? seq[0]);
  });
});

describe('força e lançamento', () => {
  it('a barra de força sobe e desce sem parar', () => {
    expect(powerAt(0)).toBe(0);
    expect(powerAt(POWER_PERIOD_MS / 2)).toBeCloseTo(1, 5);
    expect(powerAt(POWER_PERIOD_MS)).toBeCloseTo(0, 5);
    expect(powerAt(POWER_PERIOD_MS * 1.25)).toBeCloseTo(0.5, 5);
  });
  it('segurar carrega, soltar lança com a força do momento, na direção da mira', () => {
    const s = def.createInitialState(3, ps);
    tick(s, { charge: false }, 2); // soltar antes não conta
    tick(s, { aim: 0, charge: true }, Math.round((POWER_PERIOD_MS / 4) / TICK_MS));
    expect(s.charging).toBe(true);
    expect(s.power).toBeGreaterThan(0.3);
    const p = me(s);
    const pw = s.power;
    tick(s, { aim: 0, charge: false });
    expect(s.phase).toBe('roll');
    expect(p.vx).toBeGreaterThan(speedFor(pw) * 0.8);
    expect(Math.abs(p.vy)).toBeLessThan(1);
  });
  it('segurar o botão desde antes do turno não dispara sozinho', () => {
    const s = def.createInitialState(3, ps);
    tick(s, { charge: true }, 30);
    expect(s.charging).toBe(false);
    expect(s.phase).toBe('aim');
  });
  it('estourar o tempo lança a peça automaticamente', () => {
    const s = def.createInitialState(3, ps);
    tick(s, {}, Math.ceil(AIM_MS / TICK_MS) + 1);
    expect(s.phase === 'roll' || s.turnNo > 1).toBe(true);
  });
  it('mira por tecla gira, por mouse é absoluta e os atalhos apontam para a bola e para o gol', () => {
    const s = def.createInitialState(3, ps);
    const a0 = s.aim;
    tick(s, { turn: 1 }, 10);
    expect(s.aim).not.toBeCloseTo(a0, 2);
    tick(s, { aim: 1.234 });
    expect(s.aim).toBeCloseTo(1.234, 5);
    tick(s, { snap: 1 });
    const p = me(s);
    expect(s.aim).toBeCloseTo(Math.atan2(s.ball.y - p.y, s.ball.x - p.x), 5);
    tick(s, { snap: 2 });
    expect(Math.cos(s.aim) * (s.teams[s.cur] === 0 ? 1 : -1)).toBeGreaterThan(0);
  });
  it('só quem tem a vez joga: o input dos outros é ignorado', () => {
    const s = def.createInitialState(3, ps);
    const other = ps.find((p) => p.id !== s.cur)!.id;
    const aim0 = s.aim;
    def.step(s, { [other]: { turn: 1, aim: 2, snap: 0, charge: true } }, TICK_MS);
    expect(s.aim).toBe(aim0);
    expect(s.charging).toBe(false);
  });
});

describe('física', () => {
  it('a peça lançada empurra a bola e a bola ganha velocidade', () => {
    const s = def.createInitialState(3, ps);
    const p = me(s);
    const dir = p.x < CX ? 1 : -1, ang = dir > 0 ? 0 : Math.PI;
    const x0 = p.x + 40 * dir;
    s.ball.x = x0; s.ball.y = p.y; // bola logo à frente (em direção ao centro)
    tick(s, { aim: ang, charge: false });
    tick(s, { aim: ang, charge: true }, 20);
    tick(s, { aim: ang, charge: false });
    for (let i = 0; i < 40; i++) tick(s);
    expect((s.ball.x - x0) * dir).toBeGreaterThan(60);
    expect(s.lastTouch).toBe(p.id);
  });
  it('peça contra peça: o momento total é conservado (aprox.) e elas se afastam', () => {
    const s = def.createInitialState(3, ps);
    const a = s.pieces[0]!, b = s.pieces[1]!;
    a.x = 200; a.y = 130; b.x = 222; b.y = 130; a.vx = 300; a.vy = 0; b.vx = 0; b.vy = 0;
    s.phase = 'roll'; s.shotBy = a.id;
    const p0 = a.vx + b.vx;
    def.step(s, {}, TICK_MS);
    expect(a.vx + b.vx).toBeGreaterThan(p0 * 0.9);
    expect(b.vx).toBeGreaterThan(a.vx);
  });
  it('peças e bola respeitam as bordas do campo durante 12 partidas de bots', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = def.createInitialState(seed, ps);
      const brains = ps.map((p) => def.createBot(p.id, 'medium', seed + 1));
      let guard = 0;
      while (!def.isFinished(s) && guard++ < 5000) {
        const inputs: Record<string, FutebolInput> = {};
        ps.forEach((p, i) => { inputs[p.id] = brains[i]!.decide(s, TICK_MS); });
        def.step(s, inputs, TICK_MS);
        for (const p of s.pieces) {
          expect(p.x).toBeGreaterThanOrEqual(FX0 + PR - 0.5); expect(p.x).toBeLessThanOrEqual(FX1 - PR + 0.5);
          expect(p.y).toBeGreaterThanOrEqual(FY0 + PR - 0.5); expect(p.y).toBeLessThanOrEqual(FY1 - PR + 0.5);
        }
        const b = s.ball;
        expect(b.y).toBeGreaterThanOrEqual(FY0 + BR - 0.6); expect(b.y).toBeLessThanOrEqual(FY1 - BR + 0.6);
        expect(b.x).toBeGreaterThan(FX0 - 20); expect(b.x).toBeLessThan(FX1 + 20);
      }
      expect(def.isFinished(s)).toBe(true);
    }
  }, 60000);
});

describe('gols e goleiros', () => {
  const shootInto = (s: FutebolState, side: 'left' | 'right', y: number) => {
    s.phase = 'roll'; s.phaseMs = 0; s.shotBy = s.cur;
    s.ball.x = side === 'left' ? FX0 + 40 : FX1 - 40; s.ball.y = y;
    s.ball.vx = side === 'left' ? -420 : 420; s.ball.vy = 0;
  };
  it('bola no gol da direita = ponto do AZUL; no da esquerda = ponto do VERMELHO; depois reinicia e quem levou o gol joga', () => {
    // esquerda: ponto do vermelho
    for (const [side, scoring] of [['right', 0], ['left', 1]] as const) {
      const s = def.createInitialState(5, ps);
      // tira o goleiro do caminho esperando o momento em que ele está longe do centro
      let t = 0; while (Math.abs(keeperY(s.keepT + t, side === 'right' ? 1 : 0) - CY) < 16 && t < 5) t += 0.05;
      s.keepT += t;
      shootInto(s, side, CY + (keeperY(s.keepT, side === 'right' ? 1 : 0) > CY ? -22 : 22));
      let guard = 0; while (s.phase === 'roll' && guard++ < 100) def.step(s, {}, TICK_MS);
      expect(s.phase).toBe('goal');
      expect(s.score[scoring]).toBe(1);
      expect(s.score[1 - scoring]).toBe(0);
      for (let i = 0; i < Math.ceil(GOAL_MS / TICK_MS) + 2; i++) def.step(s, {}, TICK_MS);
      expect(s.phase).toBe('aim');
      expect(s.ball.x).toBeCloseTo(CX, 3); expect(s.ball.y).toBeCloseTo(CY, 3);
      expect(s.teams[s.cur]).toBe(1 - scoring); // quem levou o gol começa
    }
  });
  it('gol contra vale para o adversário e não dá bônus ao jogador que tocou', () => {
    const s = def.createInitialState(5, ps);
    const mate = s.members[0][0]!;
    s.lastTouch = mate;
    let t = 0; while (Math.abs(keeperY(s.keepT + t, 0) - CY) < 16 && t < 5) t += 0.05;
    s.keepT += t;
    shootInto(s, 'left', CY + (keeperY(s.keepT, 0) > CY ? -22 : 22)); // time 0 (azul) defende a esquerda
    let guard = 0; while (s.phase === 'roll' && guard++ < 100) def.step(s, {}, TICK_MS);
    expect(s.score).toEqual([0, 1]);
    expect(s.goalsBy[mate]).toBe(0);
  });
  it('o goleiro vai e volta dentro das traves e defende um chute no meio', () => {
    for (let k = 0; k < 200; k++) {
      const y = keeperY(k * 0.1, 0);
      expect(Math.abs(y - CY)).toBeLessThan(GOAL_H / 2 - 8);
    }
    const s = def.createInitialState(5, ps);
    // chute reto no goleiro: acompanha a altura dele
    const ky = keeperY(s.keepT + 0.25, 1);
    s.phase = 'roll'; s.shotBy = s.cur;
    s.ball.x = FX1 - 60; s.ball.y = ky; s.ball.vx = 300; s.ball.vy = 0;
    let saved = false;
    for (let i = 0; i < 60 && s.phase === 'roll'; i++) {
      def.step(s, {}, TICK_MS);
      if (s.events.some((e) => e.kind === 'save')) saved = true;
    }
    expect(saved).toBe(true);
    expect(s.score).toEqual([0, 0]);
  });
});

describe('resultado e bots', () => {
  it('quem faz mais gols vence: a dupla inteira recebe a mesma colocação e recompensa; empate divide tudo', () => {
    const s = def.createInitialState(5, ps);
    s.score = [2, 1];
    let res = def.computeResult(s);
    if (res.kind !== 'ranking') throw new Error();
    const rankOf = (id: string) => res.kind === 'ranking' ? res.ranking.find((r) => r.playerId === id)!.rank : 0;
    for (const id of s.members[0]) expect(rankOf(id)).toBe(1);
    for (const id of s.members[1]) expect(rankOf(id)).toBe(3);
    const rw = computeRewards(res, ps);
    for (const id of s.members[0]) expect(rw[id]).toBe(7);
    for (const id of s.members[1]) expect(rw[id]).toBe(3);
    s.score = [1, 1];
    res = def.computeResult(s);
    if (res.kind !== 'ranking') throw new Error();
    expect(new Set(res.ranking.map((r) => r.rank))).toEqual(new Set([1]));
    expect(Object.values(computeRewards(res, ps)).every((v) => v === 5)).toBe(true);
  });
  it('partida de bots: acaba quando uma dupla faz 2 gols ou quando o tempo (2 min) acaba, sem travar', () => {
    let early = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const out = simulateMatch(def, players('medium'), seed);
      const [a, b] = out.finalState.score;
      expect(out.ticks * TICK_MS).toBeLessThan(DURATION_MS + 8000);
      if (Math.max(a, b) >= GOALS_TO_WIN) { early++; expect(Math.max(a, b)).toBe(GOALS_TO_WIN); expect(out.ticks * TICK_MS).toBeLessThan(DURATION_MS + 8000); }
      else expect(out.ticks * TICK_MS).toBeGreaterThan(DURATION_MS - 500);
    }
    expect(early).toBeGreaterThan(8);
  }, 60000);
  it('o 2º gol de uma dupla encerra a partida depois da comemoração; antes disso o jogo continua', () => {
    const play = (score: [number, number]) => {
      const s = def.createInitialState(5, ps);
      s.score = score;
      let t = 0; while (Math.abs(keeperY(s.keepT + t, 1) - CY) < 16 && t < 5) t += 0.05;
      s.keepT += t;
      s.phase = 'roll'; s.phaseMs = 0; s.shotBy = s.cur;
      s.ball.x = FX1 - 40; s.ball.y = CY + (keeperY(s.keepT, 1) > CY ? -22 : 22); s.ball.vx = 420; s.ball.vy = 0;
      let g = 0; while (s.phase === 'roll' && g++ < 100) def.step(s, {}, TICK_MS);
      expect(s.phase).toBe('goal');
      for (let i = 0; i < Math.ceil(GOAL_MS / TICK_MS) + 2; i++) def.step(s, {}, TICK_MS);
      return s;
    };
    expect(play([0, 0]).phase).toBe('aim'); // 1º gol: segue
    const fin = play([1, 0]); // 2º gol do azul
    expect(fin.score).toEqual([2, 0]);
    expect(def.isFinished(fin)).toBe(true);
    const res = def.computeResult(fin);
    if (res.kind !== 'ranking') throw new Error();
    for (const id of fin.members[0]) expect(res.ranking.find((r) => r.playerId === id)!.rank).toBe(1);
  });
  it('bots difíceis fazem mais gols que os fáceis', () => {
    const total = (d: 'easy' | 'hard') => Array.from({ length: 20 }, (_, i) => { const o = simulateMatch(def, players(d), i + 1); return o.finalState.score[0] + o.finalState.score[1]; }).reduce((a, b) => a + b, 0);
    expect(total('hard')).toBeGreaterThan(total('easy'));
  });
  it('é determinística', () => {
    const a = simulateMatch(def, players('hard'), 11), b = simulateMatch(def, players('hard'), 11);
    expect(a.finalState).toEqual(b.finalState);
  });
  it('sanitizeInput valida direção, força e rejeita lixo', () => {
    expect(def.sanitizeInput({ turn: 1, aim: 9, snap: 2, charge: true })).toMatchObject({ turn: 1, snap: 2, charge: true });
    expect(Math.abs((def.sanitizeInput({ turn: 0, aim: 9, snap: 0, charge: false }) as FutebolInput).aim!)).toBeLessThanOrEqual(Math.PI);
    expect(def.sanitizeInput({ turn: 0, aim: null, snap: 0, charge: false })).toEqual({ turn: 0, aim: null, snap: 0, charge: false });
    expect((def.sanitizeInput({ turn: 0, aim: 'x', snap: 7, charge: false }) as FutebolInput).aim).toBeNull();
    expect(def.sanitizeInput({ turn: 3, aim: 0, snap: 0, charge: false })).toBeNull();
    expect(def.sanitizeInput({ turn: 0, charge: 'sim' })).toBeNull();
    expect(def.sanitizeInput(null)).toBeNull();
  });
});
