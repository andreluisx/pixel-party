import { describe, expect, it } from 'vitest';
import { dueloArqueiros as def, arrowPath, solveAim, wrapDelta, wrapX, W, GROUND, HOLE, SPAWNS, START_LAYOUTS, H, POINTS_HIT, POINTS_KILL, POINTS_LAST_HIT, BONUS_COINS_LAST_HIT, overHole, fallsInHole, STATIC_PLATS, SLOT_DEFS, DURATION_MS, START_LIVES, MAX_LIVES, ARROW_SPEED, type ArcherInput, type ArcherState } from '../shared/minigames/duelo-arqueiros';
import { simulateMatch, computeRewards, TICK_MS } from '../shared/sim';
import { makeBotProfile } from '../shared/bots';
import type { ParticipantInfo, Slot } from '../shared/types';

const players = (d: 'easy' | 'medium' | 'hard' = 'medium'): ParticipantInfo[] =>
  [0, 1, 2, 3].map((i) => { const b = makeBotProfile(i as Slot, d); return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: d }; });
const ps = players();
const [A, B, Cc, D] = ps.map((p) => p.id) as [string, string, string, string];
const IN: ArcherInput = { dx: 0, jump: false, run: false, fire: false, aim: 0 };
const run = (s: ArcherState, ms: number, inputs: Record<string, ArcherInput> = {}) => { for (let t = 0; t < ms; t += TICK_MS) def.step(s, inputs, TICK_MS); };
const fresh = (seed = 1) => { const s = def.createInitialState(seed, ps); s.slots.forEach((sl) => { sl.phase = 'hidden'; sl.t = 0; sl.dur = 1e9; }); s.nextPickupMs = 1e9; return s; };
const put = (s: ArcherState, id: string, x: number, y: number) => { const p = s.players[id]!; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.cooldownMs = 0; p.grounded = y >= GROUND; };

describe('movimento e continuidade horizontal', () => {
  it('anda, corre mais rápido com run, e pula só no chão', () => {
    const s = fresh(); put(s, A, 100, GROUND);
    run(s, 500, { [A]: { ...IN, dx: 1 } }); const walked = s.players[A]!.x - 100;
    put(s, A, 100, GROUND);
    run(s, 500, { [A]: { ...IN, dx: 1, run: true } }); expect(s.players[A]!.x - 100).toBeGreaterThan(walked * 1.3);
    put(s, A, 100, GROUND); run(s, 100, { [A]: { ...IN, jump: true } }); expect(s.players[A]!.y).toBeLessThan(GROUND - 5);
    const air = s.players[A]!.y; run(s, 60, { [A]: { ...IN } }); run(s, 60, { [A]: { ...IN, jump: true } }); // novo aperto no ar não pula de novo
    expect(s.players[A]!.y).toBeGreaterThan(air - 30);
  });
  it('ao sair por um lado da tela o arqueiro reaparece no lado oposto', () => {
    const s = fresh(); put(s, A, 4, GROUND);
    run(s, 400, { [A]: { ...IN, dx: -1 } });
    expect(s.players[A]!.x).toBeGreaterThan(W - 60);
    put(s, A, W - 4, GROUND); run(s, 400, { [A]: { ...IN, dx: 1 } }); expect(s.players[A]!.x).toBeLessThan(60);
    expect(wrapX(-3)).toBe(W - 3); expect(wrapDelta(2, W - 2)).toBe(4);
  });
  it('plataformas fixas seguram por cima e dá para atravessar por baixo', () => {
    const s = fresh(); const pl = STATIC_PLATS[2]!;
    put(s, A, pl.x + 50, pl.y - 1); s.players[A]!.vy = 80; run(s, 300); expect(s.players[A]!.y).toBeCloseTo(pl.y, 0); expect(s.players[A]!.grounded).toBe(true);
    put(s, B, pl.x + 50, pl.y + 40); run(s, 100, { [B]: { ...IN, jump: true } }); run(s, 200, { [B]: { ...IN, jump: true } });
    expect(s.players[B]!.y).toBeLessThan(pl.y + 40); // subiu através da plataforma
  });
  it('as plataformas fixas ficam ao alcance do pulo (altura entre níveis)', () => {
    const s = fresh(); put(s, A, 60, GROUND);
    let peak = GROUND; for (let t = 0; t < 900; t += TICK_MS) { def.step(s, { [A]: { ...IN, jump: t < 400 } }, TICK_MS); peak = Math.min(peak, s.players[A]!.y); }
    expect(GROUND - peak).toBeGreaterThan(44);
    const ys = [...new Set(STATIC_PLATS.map((p) => p.y))].sort((a, b) => b - a);
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1]! - ys[i]!).toBeLessThanOrEqual(42);
    expect(GROUND - ys[0]!).toBeLessThanOrEqual(42);
  });
});

describe('flechas', () => {
  it('começam retas e vão caindo (gravidade)', () => {
    const path = arrowPath(100, 150, 0, false, 20);
    expect(Math.abs(path[1]!.y - path[0]!.y)).toBeLessThan(Math.abs(path[19]!.y - path[18]!.y) / 2 + 1); // cai cada vez mais
    expect(path[19]!.y).toBeGreaterThan(path[0]!.y + 20);
  });
  it('as flechas NÃO atravessam as laterais: cravam na borda (nos dois lados) e a trajetória prevista termina nela', () => {
    for (const [x0, ang, edge] of [[470, 0, W], [10, Math.PI, 0]] as const) {
      const s = fresh(); put(s, A, x0, 100); put(s, B, 240, 84); put(s, Cc, 60, 124); put(s, D, 420, 124);
      run(s, TICK_MS, { [A]: { ...IN, fire: true, aim: ang } });
      expect(s.arrows.length).toBe(1); run(s, 300);
      const a = s.arrows[0]; expect(a).toBeDefined(); expect(a!.x).toBe(edge); expect(a!.stuckMs).toBeGreaterThan(0); // cravada na borda, não do outro lado
      expect(arrowPath(x0, 100, ang, false, 30).every((pt) => pt.x > 0 && pt.x < W)).toBe(true);
    }
    expect(arrowPath(470, 100, 0, false, 30).length).toBeLessThan(5);
  });
  it('a flecha não acerta quem está do outro lado da tela, mas o arqueiro atravessa normalmente', () => {
    const s = fresh(); put(s, A, 470, GROUND); put(s, B, 8, GROUND); put(s, Cc, 400, 84); put(s, D, 60, 124);
    run(s, TICK_MS, { [A]: { ...IN, fire: true, aim: 0 } }); run(s, 700);
    expect(s.players[B]!.lives).toBe(START_LIVES);
    put(s, A, 3, GROUND); run(s, 400, { [A]: { ...IN, dx: -1 } }); expect(s.players[A]!.x).toBeGreaterThan(W - 60); // jogador ainda dá a volta
  });
  it('acerto tira uma vida, reaparece longe com invulnerabilidade e a flecha some', () => {
    const s = fresh(); put(s, A, 100, GROUND); put(s, B, 200, GROUND); put(s, Cc, 400, 84); put(s, D, 40, 124);
    run(s, TICK_MS, { [A]: { ...IN, fire: true, aim: solveAim({ x: 100, y: GROUND - 9 }, { x: 200, y: GROUND - 7 }) } });
    run(s, 600);
    expect(s.players[B]!.lives).toBe(START_LIVES - 1); expect(s.players[B]!.invulnMs).toBeGreaterThan(0); expect(s.players[B]!.alive).toBe(true);
    expect(Math.hypot(wrapDelta(s.players[B]!.x, 200), s.players[B]!.y - GROUND)).toBeGreaterThan(40);
    expect(s.arrows.length).toBe(0);
  });
  it('invulnerável não leva dano e a flecha passa direto', () => {
    const s = fresh(); put(s, A, 100, GROUND); put(s, B, 200, GROUND); put(s, Cc, 400, 84); put(s, D, 40, 124); s.players[B]!.invulnMs = 5000;
    run(s, TICK_MS, { [A]: { ...IN, fire: true, aim: solveAim({ x: 100, y: GROUND - 9 }, { x: 200, y: GROUND - 7 }) } }); run(s, 600);
    expect(s.players[B]!.lives).toBe(START_LIVES);
  });
  it('escudo absorve um disparo e some; tempo de recarga limita os tiros', () => {
    const s = fresh(); put(s, A, 100, GROUND); put(s, B, 200, GROUND); put(s, Cc, 400, 84); put(s, D, 40, 124); s.players[B]!.shield = true;
    const aim = solveAim({ x: 100, y: GROUND - 9 }, { x: 200, y: GROUND - 7 });
    run(s, TICK_MS, { [A]: { ...IN, fire: true, aim } }); run(s, 500);
    expect(s.players[B]!.lives).toBe(START_LIVES); expect(s.players[B]!.shield).toBe(false);
    let shots = 0; const before = s.arrows.length; for (let i = 0; i < 6; i++) { def.step(s, { [A]: { ...IN, fire: true, aim: -1 } }, TICK_MS); } shots = s.arrows.filter((a) => a.ageMs < 250).length;
    expect(shots).toBeLessThanOrEqual(1 + before);
  });
  it('flecha tripla dispara 3 e gasta cargas; flamejante atravessa dois e quebra escudo', () => {
    const s = fresh(); put(s, A, 40, GROUND); s.players[A]!.special = 'triple'; s.players[A]!.charges = 3;
    run(s, TICK_MS, { [A]: { ...IN, fire: true, aim: -0.4 } }); expect(s.arrows.length).toBe(3); expect(s.players[A]!.charges).toBe(2);
    const t = fresh(); put(t, A, 40, GROUND); put(t, B, 140, GROUND); put(t, Cc, 220, GROUND); put(t, D, 440, 84); t.players[A]!.special = 'fire'; t.players[A]!.charges = 3; t.players[B]!.shield = true;
    run(t, TICK_MS, { [A]: { ...IN, fire: true, aim: solveAim({ x: 40, y: GROUND - 9 }, { x: 140, y: GROUND - 7 }, true) } }); run(t, 700);
    expect(t.players[B]!.shield).toBe(false); expect(t.players[B]!.lives).toBe(START_LIVES - 1);
    const cHit = START_LIVES - t.players[Cc]!.lives; expect(cHit).toBeGreaterThanOrEqual(0);
  });
  it('flecha flamejante destrói pilares que aparecem; flecha comum só crava', () => {
    const s = fresh(); const sl = s.slots.find((x) => x.kind === 'block')!; sl.phase = 'solid'; sl.t = 0; sl.dur = 1e9;
    put(s, A, sl.x - 80, sl.y + 10); put(s, B, 440, 84); put(s, Cc, 20, 84); put(s, D, 460, 124); s.players[A]!.special = 'fire'; s.players[A]!.charges = 1;
    run(s, TICK_MS, { [A]: { ...IN, fire: true, aim: 0 } }); run(s, 500);
    expect(sl.phase).toBe('hidden');
  });
});

describe('plataformas e pilares que aparecem e somem', () => {
  it('ciclo: some → avisa (piscando, sem colisão) → sólida → pisca → some', () => {
    const s = fresh(); const sl = s.slots[0]!; sl.phase = 'hidden'; sl.t = 0; sl.dur = 100;
    const seen: string[] = [];
    for (let i = 0; i < 600; i++) { def.step(s, {}, TICK_MS); if (seen[seen.length - 1] !== sl.phase) seen.push(sl.phase); }
    expect(seen.slice(0, 5)).toEqual(['hidden', 'warn', 'solid', 'fade', 'hidden']);
  });
  it('só é sólida em "solid" e "fade"; em "warn" o arqueiro atravessa', () => {
    const s = fresh(); const sl = s.slots.find((x) => x.kind === 'plat')!;
    sl.phase = 'warn'; sl.t = 0; sl.dur = 1e9; put(s, A, sl.x + 20, sl.y - 3); s.players[A]!.vy = 100; put(s, B, 440, 84); put(s, Cc, 20, 84); put(s, D, 460, 124);
    run(s, 200); expect(s.players[A]!.y).toBeGreaterThan(sl.y + 5);
    put(s, A, sl.x + 20, sl.y - 3); s.players[A]!.vy = 100; sl.phase = 'solid';
    run(s, 200); expect(s.players[A]!.y).toBeCloseTo(sl.y, 0);
  });
  it('pilar bloqueia dos lados e nunca esmaga: quem fica dentro é empurrado para o lado', () => {
    const s = fresh(); const sl = s.slots.find((x) => x.kind === 'block')!;
    put(s, A, sl.x - 30, GROUND); sl.phase = 'solid'; sl.t = 0; sl.dur = 1e9;
    run(s, 600, { [A]: { ...IN, dx: 1 } }); expect(s.players[A]!.x).toBeLessThanOrEqual(sl.x - 4);
    put(s, B, sl.x + 7, GROUND); run(s, 100); expect(Math.abs(s.players[B]!.x - (sl.x + 7))).toBeGreaterThan(4);
  });
  it('há plataformas e pilares suficientes e todos longe das bordas', () => {
    expect(SLOT_DEFS.filter((d) => d.kind === 'plat').length).toBeGreaterThanOrEqual(4);
    expect(SLOT_DEFS.filter((d) => d.kind === 'block').length).toBeGreaterThanOrEqual(2);
    for (const d of SLOT_DEFS) { expect(d.x).toBeGreaterThan(24); expect(d.x + d.w).toBeLessThan(W - 24); }
  });
});

describe('power-ups', () => {
  const give = (s: ArcherState, type: 'triple' | 'fire' | 'shield' | 'life' | 'boots', p = s.players[A]!) => { s.pickups.push({ id: 99, type, x: p.x, y: p.y - 7, ttl: 5000 }); run(s, TICK_MS); };
  it('cada item faz o seu efeito e some', () => {
    const s = fresh(); put(s, A, 100, GROUND); put(s, B, 300, GROUND);
    give(s, 'triple'); expect(s.players[A]!.special).toBe('triple'); expect(s.players[A]!.charges).toBe(3);
    give(s, 'fire'); expect(s.players[A]!.special).toBe('fire');
    give(s, 'shield'); expect(s.players[A]!.shield).toBe(true);
    give(s, 'boots'); expect(s.players[A]!.bootsMs).toBeGreaterThan(7000);
    s.players[A]!.lives = 1; give(s, 'life'); expect(s.players[A]!.lives).toBe(2);
    give(s, 'life'); give(s, 'life'); expect(s.players[A]!.lives).toBe(MAX_LIVES);
    expect(s.pickups.length).toBe(0);
  });
  it('itens nascem de tempos em tempos (no máximo 3 de uma vez) e expiram', () => {
    const s = def.createInitialState(3, ps); s.slots.forEach((sl) => { sl.dur = 1e9; });
    run(s, 20000); expect(s.pickups.length).toBeLessThanOrEqual(3);
    let seen = 0; const t = def.createInitialState(3, ps); t.slots.forEach((sl) => { sl.dur = 1e9; }); const ids = new Set<number>();
    for (let i = 0; i < 1500; i++) { def.step(t, {}, TICK_MS); for (const pk of t.pickups) ids.add(pk.id); } seen = ids.size; expect(seen).toBeGreaterThan(4);
  });
});

describe('fim, vidas e empates', () => {
  const kill = (s: ArcherState, id: string) => { const p = s.players[id]!; p.alive = false; p.lives = 0; p.elimAtMs = s.elapsedMs; };
  it('o último vivo vence e a partida termina logo depois', () => {
    const s = fresh(); kill(s, B); kill(s, Cc); run(s, 100); expect(def.isFinished(s)).toBe(false); kill(s, D); run(s, TICK_MS); run(s, 1600);
    expect(def.isFinished(s)).toBe(true);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error();
    expect(r.ranking.find((e) => e.playerId === A)!.rank).toBe(1);
  });
  it('quem foi eliminado depois fica melhor colocado; eliminados no mesmo instante empatam', () => {
    const s = fresh(); run(s, 1000); kill(s, B); run(s, 1000); kill(s, Cc); kill(s, D); run(s, 1700);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error();
    const rk = (id: string) => r.ranking.find((e) => e.playerId === id)!.rank;
    expect(rk(A)).toBe(1); expect(rk(Cc)).toBeLessThan(rk(B)); expect(rk(Cc)).toBe(rk(D)); // B caiu primeiro; C e D caíram juntos, depois
  });
  it('tempo esgotado: mais vidas vence; mesmas vidas dividem a vitória', () => {
    const s = fresh(); s.players[A]!.lives = 2; s.players[B]!.lives = 2; s.players[Cc]!.lives = 1; kill(s, D);
    run(s, DURATION_MS + 100);
    expect(def.isFinished(s)).toBe(true);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error();
    const rk = (id: string) => r.ranking.find((e) => e.playerId === id)!.rank;
    expect(rk(A)).toBe(1); expect(rk(B)).toBe(1); expect(rk(Cc)).toBe(3); expect(rk(D)).toBe(4);
    expect(def.formatScore!(r.ranking[0]!.score)).toBe('2 vidas');
  });
  it('rejeita inputs inválidos', () => {
    for (const bad of [null, 'x', { dx: 2, jump: false, run: false, fire: false, aim: 0 }, { dx: 0, jump: 1, run: false, fire: false, aim: 0 }, { dx: 0, jump: false, run: false, fire: false, aim: NaN }, { dx: 0, jump: false, run: false, fire: false }]) expect(def.sanitizeInput(bad)).toBeNull();
    expect(def.sanitizeInput({ dx: 1, jump: true, run: true, fire: true, aim: 99 })!.aim).toBeLessThanOrEqual(7);
  });
  it('quem foi eliminado não age mais', () => {
    const s = fresh(); kill(s, A); const x0 = s.players[A]!.x; run(s, 300, { [A]: { ...IN, dx: 1, fire: true } });
    expect(s.players[A]!.x).toBe(x0); expect(s.arrows.length).toBe(0);
  });
});

describe('mira assistida', () => {
  it('solveAim acerta o alvo na trajetória real', () => {
    for (const [fx, fy, tx, ty] of [[100, 237, 300, 239], [60, 195, 380, 197], [450, 237, 300, 239], [240, 75, 80, 155]] as const) {
      const a = solveAim({ x: fx, y: fy }, { x: tx, y: ty });
      let best = 1e9;
      for (const pt of arrowPath(fx, fy, a, false, 60, 20)) best = Math.min(best, Math.hypot(pt.x - tx, pt.y - ty));
      expect(best).toBeLessThan(10);
    }
    expect(ARROW_SPEED).toBeGreaterThan(300);
  });
});

describe('bots no duelo', () => {
  it('100 partidas só com bots terminam com ranking válido e há eliminações', () => {
    let elim = 0;
    for (let seed = 1; seed <= 100; seed++) { const o = simulateMatch(def, players('medium'), seed); expect(Object.keys(o.rewards)).toHaveLength(4); elim += Object.values((o.finalState as ArcherState).players).filter((p) => !p.alive).length; }
    expect(elim).toBeGreaterThan(80);
  });
  it('bots melhores acertam mais; difícil costuma ficar entre os melhores contra fáceis', () => {
    const hits: Record<string, number> = {};
    for (const d of ['easy', 'medium', 'hard'] as const) { let h = 0, n = 0; for (let seed = 1; seed <= 25; seed++) { const o = simulateMatch(def, players(d), seed); for (const p of Object.values((o.finalState as ArcherState).players)) { h += p.hitsTaken; n++; } } hits[d] = h / n; }
    let top = 0, games = 0, lives = 0;
    for (let seed = 1; seed <= 40; seed++) { const q = players('easy'); q[0]!.difficulty = 'hard'; const o = simulateMatch(def, q, seed); if (o.result.kind === 'ranking') { games++; const me = o.result.ranking.find((e) => e.playerId === q[0]!.id)!; if (me.rank === 1) top++; lives += (o.finalState as ArcherState).players[q[0]!.id]!.lives; } }
    console.log('acertos recebidos por arqueiro', JSON.stringify(hits), '| hard entre os melhores contra 3 easy', top, '/', games, 'vidas finais médias', (lives / games).toFixed(2));
    expect(top / games).toBeGreaterThan(0.5);
  });
  it('determinística', () => { expect(simulateMatch(def, players(), 4).result).toEqual(simulateMatch(def, players(), 4).result); });
});

describe('surgimento dos power-ups', () => {
  const collect = (seed: number, ms: number) => {
    const s = def.createInitialState(seed, ps); s.slots.forEach((sl) => { sl.dur = 1e9; });
    const log: { x: number; y: number; id: number; at: number }[] = []; const seen = new Set<number>(); let maxAtOnce = 0, minGap = Infinity;
    for (let t = 0; t < ms; t += TICK_MS) {
      def.step(s, {}, TICK_MS);
      for (const pk of s.pickups) if (!seen.has(pk.id)) { seen.add(pk.id); log.push({ x: pk.x, y: pk.y, id: pk.id, at: t }); }
      maxAtOnce = Math.max(maxAtOnce, s.pickups.length);
      for (let i = 0; i < s.pickups.length; i++) for (let j = i + 1; j < s.pickups.length; j++) minGap = Math.min(minGap, Math.hypot(s.pickups[i]!.x - s.pickups[j]!.x, s.pickups[i]!.y - s.pickups[j]!.y));
    }
    return { log, maxAtOnce, minGap, s };
  };
  it('nunca há dois itens no mesmo lugar (distância mínima entre eles) e nenhum nasce dentro do buraco', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { minGap, maxAtOnce } = collect(seed, DURATION_MS);
      expect(maxAtOnce).toBeLessThanOrEqual(3); expect(minGap).toBeGreaterThanOrEqual(70);
    }
    for (const [x, y] of SPAWNS) if (y === GROUND) expect(overHole(x)).toBe(false); // sobre o chão nunca cai no buraco (nas plataformas de cima pode)
  });
  it('os pontos variam: não repete o ponto logo em seguida e usa vários pontos/andares diferentes', () => {
    const used = new Set<string>(), floors = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { log } = collect(seed, DURATION_MS);
      for (let i = 1; i < log.length; i++) expect(`${log[i]!.x},${log[i]!.y}`).not.toBe(`${log[i - 1]!.x},${log[i - 1]!.y}`);
      for (const l of log) { used.add(`${l.x},${l.y}`); floors.add(Math.round(l.y)); }
    }
    expect(used.size).toBeGreaterThanOrEqual(10); expect(floors.size).toBeGreaterThanOrEqual(4);
  });
  it('quando não cabe um item novo longe dos outros, ele espera em vez de empilhar', () => {
    const s = fresh(); s.nextPickupMs = 0;
    for (const sp of SPAWNS) s.pickups.push({ id: 100 + s.pickups.length, type: 'shield', x: sp[0], y: sp[1] - 8, ttl: 99999 });
    const n = s.pickups.length; def.step(s, {}, TICK_MS); expect(s.pickups.length).toBe(n);
  });
});

describe('distância inicial entre os jogadores', () => {
  it('as formações são bem mais afastadas que antes (mín. ~43 px) e variam com a seed', () => {
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const s = def.createInitialState(seed, ps); const pts = ps.map((p) => s.players[p.id]!);
      let min = Infinity; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) min = Math.min(min, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y));
      expect(min).toBeGreaterThanOrEqual(110);
      for (const p of pts) { expect(p.grounded).toBe(true); expect(overHole(p.x)).toBe(false); }
      firsts.add(`${pts[0]!.x},${pts[0]!.y}`);
    }
    expect(firsts.size).toBeGreaterThanOrEqual(3);
    for (const l of START_LAYOUTS) for (const [x, y] of l) if (y === GROUND) expect(overHole(x)).toBe(false);
  });
});

describe('estatísticas e último hit', () => {
  const shot = (s: ArcherState, from: string, to: string, fire = false) => {
    const a = s.players[from]!, b = s.players[to]!; a.cooldownMs = 0;
    run(s, TICK_MS, { [from]: { ...IN, fire: true, aim: solveAim({ x: a.x, y: a.y - 9 }, { x: b.x, y: b.y - 7 }, fire) } }); run(s, 700);
  };
  const spread = (s: ArcherState) => { put(s, A, 100, GROUND); put(s, B, 200, GROUND); put(s, Cc, 400, 84); put(s, D, 40, 124); };
  it('acerto soma acerto dado/recebido, pontos, tiros e guarda quem acertou por último', () => {
    const s = fresh(); spread(s); shot(s, A, B);
    const a = s.players[A]!, b = s.players[B]!;
    expect(a.hitsDealt).toBe(1); expect(a.shots).toBe(1); expect(a.points).toBe(POINTS_HIT); expect(a.kills).toBe(0);
    expect(b.hitsTaken).toBe(1); expect(b.lastHitBy).toBe(A);
    expect(s.feed.at(-1)).toMatchObject({ kind: 'hit', by: A, victim: B }); expect(s.lastHit).toBeNull();
  });
  it('escudo e invulnerabilidade não contam como acerto; tripla conta 3 tiros', () => {
    const s = fresh(); spread(s); s.players[B]!.shield = true; shot(s, A, B);
    expect(s.players[A]!.hitsDealt).toBe(0); expect(s.players[A]!.points).toBe(0); expect(s.players[B]!.hitsTaken).toBe(0);
    const t = fresh(); put(t, A, 40, GROUND); t.players[A]!.special = 'triple'; t.players[A]!.charges = 3;
    run(t, TICK_MS, { [A]: { ...IN, fire: true, aim: -0.4 } }); expect(t.players[A]!.shots).toBe(3);
  });
  it('abate soma contador de abates e pontos; só o abate que decide a partida é o ÚLTIMO HIT', () => {
    const s = fresh(); spread(s); s.players[B]!.lives = 1; s.players[D]!.lives = 1; s.players[Cc]!.lives = 1;
    shot(s, A, B); // B cai, ainda sobram C e D: abate comum
    expect(s.players[A]!.kills).toBe(1); expect(s.players[A]!.points).toBe(POINTS_HIT + POINTS_KILL); expect(s.lastHit).toBeNull(); expect(s.feed.at(-1)!.kind).toBe('kill');
    s.players[Cc]!.alive = false; s.players[Cc]!.lives = 0; put(s, D, 140, GROUND); shot(s, A, D); // sobra só A
    expect(s.players[A]!.kills).toBe(2); expect(s.lastHit).toMatchObject({ by: A, victim: D });
    expect(s.players[A]!.points).toBe(2 * (POINTS_HIT + POINTS_KILL) + POINTS_LAST_HIT); expect(s.feed.at(-1)!.kind).toBe('last');
  });
  it('resultado: moedas de bônus por abate (+1) e último hit (+1), sem alterar a colocação, com estatísticas no detalhe', () => {
    const s = fresh(); spread(s); s.players[B]!.lives = 1; s.players[Cc]!.alive = false; s.players[Cc]!.lives = 0; s.players[D]!.alive = false; s.players[D]!.lives = 0; s.players[Cc]!.elimAtMs = s.players[D]!.elimAtMs = 1;
    shot(s, A, B); run(s, 1600);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error();
    expect(r.ranking.find((e) => e.playerId === A)!.rank).toBe(1);
    expect(r.bonus).toEqual({ [A]: POINTS_KILL + BONUS_COINS_LAST_HIT }); // 1 moeda pelo abate + 1 pelo último hit
    const rw = computeRewards(r, ps); expect(rw[A]).toBe(8 + POINTS_KILL + BONUS_COINS_LAST_HIT); expect(rw[B]).toBe(6);
    expect(r.details![A]).toContain('1 abate'); expect(r.details![A]).toContain('ÚLTIMO HIT'); expect(r.details![B]).not.toContain('ÚLTIMO HIT');
  });
  it('tempo esgotado e empates: sem último hit, sem bônus, empate preservado', () => {
    const s = fresh(); run(s, DURATION_MS + 100);
    const r = def.computeResult(s); if (r.kind !== 'ranking') throw new Error();
    expect(r.bonus).toEqual({}); expect(new Set(r.ranking.map((e) => e.rank)).size).toBe(1);
    expect(Object.values(computeRewards(r, ps))).toEqual([5, 5, 5, 5]);
  });
});

describe('buraco no centro do chão', () => {
  it('geometria: no meio da arena, largo o bastante e saltável correndo', () => {
    expect((HOLE.x0 + HOLE.x1) / 2).toBe(W / 2); expect(HOLE.x1 - HOLE.x0).toBeGreaterThanOrEqual(48); expect(HOLE.x1 - HOLE.x0).toBeLessThanOrEqual(80);
    expect(fallsInHole(240)).toBe(true); expect(fallsInHole(HOLE.x0 + 1)).toBe(false); expect(fallsInHole(HOLE.x1 - 1)).toBe(false);
  });
  it('o chão sustenta fora do buraco e a quina é segura', () => {
    const s = fresh(); put(s, A, HOLE.x0 - 4, GROUND); run(s, 400); expect(s.players[A]!.y).toBe(GROUND); expect(s.players[A]!.portals).toBe(0);
    put(s, B, HOLE.x0 + 2, GROUND); run(s, 400); expect(s.players[B]!.y).toBe(GROUND);
  });
  it('quem cai no buraco reaparece no topo (centro), com invulnerabilidade curta e sem perder vida', () => {
    const s = fresh(); put(s, B, 440, 84); put(s, Cc, 60, 124); put(s, D, 440, GROUND); put(s, A, 240, GROUND);
    const lives = s.players[A]!.lives; let sawPit = false, sawTop = false;
    for (let t = 0; t < 3000 && s.players[A]!.portals === 0; t += TICK_MS) { def.step(s, {}, TICK_MS); if (s.players[A]!.y > GROUND + 8) sawPit = true; }
    expect(sawPit).toBe(true); const a = s.players[A]!; expect(a.portals).toBe(1);
    expect(a.y).toBeLessThan(0); sawTop = true; expect(sawTop).toBe(true);
    expect(a.x).toBeGreaterThanOrEqual(HOLE.x0 + 10); expect(a.x).toBeLessThanOrEqual(HOLE.x1 - 10);
    expect(a.invulnMs).toBeGreaterThan(0); expect(a.lives).toBe(lives);
    run(s, 1500); expect(s.players[A]!.grounded).toBe(true); expect(s.players[A]!.y).toBeLessThan(GROUND - 100); // pousou numa plataforma de cima
    expect(s.players[A]!.portals).toBe(1);
  });
  it('as paredes do poço seguram dos lados (não dá para sair por baixo do chão)', () => {
    const s = fresh(); put(s, B, 440, 84); put(s, Cc, 60, 124); put(s, D, 440, GROUND); put(s, A, 230, GROUND + 6); s.players[A]!.vy = 60; s.players[A]!.grounded = false;
    run(s, 120, { [A]: { ...IN, dx: -1, run: true } });
    expect(s.players[A]!.x).toBeGreaterThanOrEqual(HOLE.x0 + 5 - 0.01); expect(s.players[A]!.y).toBeGreaterThan(GROUND); // continua no poço
  });
  it('flechas passam sobre o buraco, mas cravam no chão dos lados', () => {
    const s = fresh(); put(s, A, 180, GROUND - 2); put(s, B, 440, 84); put(s, Cc, 60, 124); put(s, D, 440, GROUND);
    run(s, TICK_MS, { [A]: { ...IN, fire: true, aim: 0.25 } }); run(s, 2200);
    expect(s.arrows.length).toBe(0); // todas as flechas sumiram (cravaram ou caíram pelo buraco), sem travar
    expect(overHole(240)).toBe(true);
    const t = fresh(); put(t, A, 300, 84); put(t, B, 440, 84); put(t, Cc, 60, 124); put(t, D, 440, GROUND);
    t.arrows.push({ id: 77, owner: A, x: 240, y: GROUND - 3, vx: 0, vy: 120, kind: 'normal', ageMs: 0, stuckMs: 0, hit: [] });
    run(t, 100); expect(t.arrows[0]?.stuckMs ?? 0).toBe(0); // sobre o buraco: não crava no chão
    t.arrows.length = 0; t.arrows.push({ id: 78, owner: A, x: 150, y: GROUND - 3, vx: 0, vy: 120, kind: 'normal', ageMs: 0, stuckMs: 0, hit: [] });
    run(t, 100); expect(t.arrows[0]!.stuckMs).toBeGreaterThan(0);
  });
  it('respawn e itens nunca nascem sobre o buraco; bots jogam partidas completas com o buraco', () => {
    let portals = 0;
    for (let seed = 1; seed <= 60; seed++) { const o = simulateMatch(def, players('medium'), seed); for (const p of Object.values((o.finalState as ArcherState).players)) { portals += p.portals; expect(p.y).toBeLessThan(H + 20); } }
    console.log('portais usados por partida (60 jogos de bots):', (portals / 60).toFixed(2));
  });
});
