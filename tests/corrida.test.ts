import { describe, expect, it } from 'vitest';
import { RESPAWN_BACK, safeRespawnX, AIR_TIME, BASE_SPEED, BIRD_WINDOW, corridaMaluca as def, generateTrack, JUMP_VY, TRACK_LENGTH, getTrack, type CorridaInput, type CorridaState } from '../shared/minigames/corrida-maluca';
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
        ...t.beams.map((b) => ({ a: b.x - b.w / 2, b: b.x + b.w / 2 })),
        ...t.muds.map((m) => ({ a: m.x, b: m.x + m.w })),
        ...t.birds.map((g) => ({ a: g.x, b: g.x + 1 })),
      ].sort((p, q) => p.a - q.a);
      for (const h of t.holes) expect(h.w).toBeLessThanOrEqual(54);
      expect(hazards.length).toBeGreaterThanOrEqual(7);
      expect(hazards[hazards.length - 1]!.b).toBeLessThan(TRACK_LENGTH - 100);
      expect(hazards[0]!.a).toBeGreaterThan(150);
    }
  });
});

describe('mecânicas novas', () => {
  const ps = players();
  it('as primeiras mecânicas aparecem na ordem de ensino: caixa, barra, seta, lama, caixa "?"', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = generateTrack(seed);
      const xs = [t.crates[0]!.x, t.beams[0]!.x, t.pads[0]!.x, t.muds[0]!.x, t.boxes[0]!.x];
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
      expect(t.boxes.length).toBeGreaterThanOrEqual(2);
      expect(t.beams.length).toBeGreaterThanOrEqual(1);
    }
  });
  const beamSeed = 4;
  const atBeam = () => {
    const s = def.createInitialState(beamSeed, ps);
    const b = getTrack(beamSeed).beams[0]!;
    const r = s.players[ps[0]!.id]!;
    r.x = b.x - 60; r.speed = BASE_SPEED;
    return { s, b, r };
  };
  it('em pé, o túnel baixo derruba o corredor, mas ele NUNCA fica preso: depois da batida atravessa; abaixado, passa direto', () => {
    const a = atBeam();
    let stunned = false;
    for (let t = 0; t < 4000; t += TICK_MS) { def.step(a.s, { [ps[0]!.id]: { run: 0, jump: false, duck: false } }, TICK_MS); if (a.r.stunMs > 0) stunned = true; }
    expect(stunned).toBe(true);
    expect(a.r.x).toBeGreaterThan(a.b.x + 10);
    const c = atBeam();
    stunned = false;
    for (let t = 0; t < 1500; t += TICK_MS) { def.step(c.s, { [ps[0]!.id]: { run: 0, jump: false, duck: true } }, TICK_MS); if (c.r.stunMs > 0) stunned = true; }
    expect(stunned).toBe(false);
    expect(c.r.x).toBeGreaterThan(c.b.x + 20);
  });
  it('pular não adianta contra o túnel (o muro vai até o céu)', () => {
    const a = atBeam();
    let stunned = false;
    for (let t = 0; t < 1500; t += TICK_MS) { def.step(a.s, { [ps[0]!.id]: { run: 0, jump: a.b.x - a.r.x < 30 && a.b.x - a.r.x > 20, duck: false } }, TICK_MS); if (a.r.stunMs > 0) stunned = true; }
    expect(stunned).toBe(true);
  });
  it('a lama deixa o corredor mais lento e a seta dá impulso', () => {
    const t = getTrack(beamSeed);
    const m = t.muds[0]!;
    const s = def.createInitialState(beamSeed, ps);
    const r = s.players[ps[0]!.id]!;
    r.x = m.x + 8; r.speed = BASE_SPEED;
    for (let k = 0; k < 10; k++) def.step(s, { [ps[0]!.id]: { run: 0, jump: false } }, TICK_MS);
    expect(r.inMud).toBe(true);
    expect(r.speed).toBeLessThan(BASE_SPEED * 0.7);
    const s2 = def.createInitialState(beamSeed, ps);
    const r2 = s2.players[ps[0]!.id]!;
    r2.x = t.pads[0]!.x - 4; r2.speed = BASE_SPEED;
    for (let k = 0; k < 20; k++) def.step(s2, { [ps[0]!.id]: { run: 0, jump: false } }, TICK_MS);
    expect(r2.turboMs).toBeGreaterThan(500);
    expect(r2.speed).toBeGreaterThan(BASE_SPEED + 5);
  });
  it('caixa "?" dá item: ataque cria barril só na pista do alvo; escudo absorve uma batida', () => {
    const t = getTrack(beamSeed);
    const box = t.boxes[0]!;
    let sawAttack = false, sawShield = false, sawTurbo = false;
    for (let seed = 1; seed <= 40 && !(sawAttack && sawShield && sawTurbo); seed++) {
      const s = def.createInitialState(seed, ps);
      const bx = getTrack(seed).boxes[0]!;
      s.players[ps[1]!.id]!.x = bx.x + 80; // um rival à frente
      const me = s.players[ps[0]!.id]!;
      me.x = bx.x - 10; me.speed = BASE_SPEED;
      for (let k = 0; k < 15; k++) def.step(s, {}, TICK_MS);
      if (s.hazards.length) { sawAttack = true; expect(s.hazards[0]!.to).toBe(ps[1]!.id); expect(s.hazards[0]!.x).toBeGreaterThan(s.players[ps[1]!.id]!.x); }
      if (me.shield) sawShield = true;
      if (me.turboMs > 1000) sawTurbo = true;
    }
    expect(box.id).toBeGreaterThan(0);
    expect(sawAttack && sawShield && sawTurbo).toBe(true);
    // escudo
    const s = def.createInitialState(beamSeed, ps);
    const b = getTrack(beamSeed).beams[0]!;
    const r = s.players[ps[0]!.id]!;
    r.x = b.x - 40; r.speed = BASE_SPEED; r.shield = true;
    for (let k = 0; k < 40; k++) def.step(s, {}, TICK_MS);
    expect(r.shield).toBe(false);
    expect(r.stunMs).toBe(0);
  });
  describe('pássaro', () => {
    const birdSeed = 4;
    const setup = () => {
      const s = def.createInitialState(birdSeed, ps);
      const tg = getTrack(birdSeed).birds[0]!;
      const r = s.players[ps[0]!.id]!;
      r.x = tg.x - 10; r.speed = BASE_SPEED;
      return { s, r, tg };
    };
    const play = (inp: (t: number, y: number) => CorridaInput) => {
      const { s, r } = setup();
      let stunned = false;
      for (let t = 0; t < 3500; t += TICK_MS) { def.step(s, { [ps[0]!.id]: inp(t, r.y) }, TICK_MS); if (r.stunMs > 0) stunned = true; }
      return { stunned, r, s };
    };
    it('o pássaro nasce ao passar do gatilho e voa contra o corredor', () => {
      const { s, r } = setup();
      for (let k = 0; k < 10; k++) def.step(s, {}, TICK_MS);
      expect(r.birds.length).toBe(1);
      const x0 = r.birds[0]!.x;
      def.step(s, {}, TICK_MS);
      expect(r.birds[0]!.x).toBeLessThan(x0);
    });
    it('em pé leva a batida; abaixado passa; pulando na hora certa passa', () => {
      expect(play(() => ({ run: 0, jump: false, duck: false })).stunned).toBe(true);
      expect(play(() => ({ run: 0, jump: false, duck: true })).stunned).toBe(false);
      // pula quando o pássaro está perto
      const { s, r } = setup();
      let stunned = false;
      for (let t = 0; t < 3500; t += TICK_MS) {
        const b = r.birds[0];
        const jump = !!b && b.x - r.x < 44 && b.x - r.x > 10;
        def.step(s, { [ps[0]!.id]: { run: 0, jump, duck: false } }, TICK_MS);
        if (r.stunMs > 0) stunned = true;
      }
      expect(stunned).toBe(false);
    });
    it('pular cedo demais ou tarde demais não salva', () => {
      const { s, r } = setup();
      let stunned = false, jumped = false;
      for (let t = 0; t < 3500; t += TICK_MS) {
        const b = r.birds[0];
        const jump = !jumped && !!b && b.x - r.x < 230;
        if (jump) jumped = true;
        def.step(s, { [ps[0]!.id]: { run: 0, jump, duck: false } }, TICK_MS);
        if (r.stunMs > 0) stunned = true;
      }
      expect(stunned).toBe(true);
    });
  });
  it('a geração segue as regras: sem perigos colados, sem duas estruturas difíceis nem duas de abaixar seguidas, pássaro com trecho livre', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = generateTrack(seed);
      const items = [
        ...t.holes.map((h) => ({ a: h.x, b: h.x + h.w, k: 'h' })),
        ...t.crates.map((c) => ({ a: c.x - 6, b: c.x + 6, k: 'c' })),
        ...t.beams.map((b) => ({ a: b.x - b.w / 2, b: b.x + b.w / 2, k: 'b' })),
        ...t.muds.map((m) => ({ a: m.x, b: m.x + m.w, k: 'm' })),
        ...t.springs.map((sp) => ({ a: sp.x, b: sp.x, k: 's' })),
      ];
      for (const g of t.birds) {
        // nada num trecho livre depois do gatilho do pássaro
        for (const it of items) expect(it.a >= g.x + BIRD_WINDOW - 10 || it.b <= g.x - 1).toBe(true);
      }
      // dois perigos de pista nunca se sobrepõem
      const sorted = items.filter((i) => i.k !== 's').sort((p, q) => p.a - q.a);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.a).toBeGreaterThanOrEqual(sorted[i - 1]!.b);
      for (const g of t.birds) expect(g.x + BIRD_WINDOW).toBeLessThan(TRACK_LENGTH - 40);
      expect(t.birds.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('sanitizeInput aceita duck opcional e rejeita lixo', () => {
    expect(def.sanitizeInput({ run: 1, jump: false })).toEqual({ run: 1, jump: false, duck: false });
    expect(def.sanitizeInput({ run: 0, jump: true, duck: true })).toEqual({ run: 0, jump: true, duck: true });
    expect(def.sanitizeInput({ run: 2, jump: true })).toBeNull();
  });
  it('é determinística com ataques e escudos', () => {
    const a = def.createInitialState(9, ps), b = def.createInitialState(9, ps);
    const brains = (st: CorridaState) => ps.map((p) => def.createBot!(p.id, 'medium', 9)).map((br, i) => ({ id: ps[i]!.id, br, st }));
    const ba = brains(a), bb = brains(b);
    for (let t = 0; t < 20000; t += TICK_MS) {
      const ia: Record<string, CorridaInput> = {}, ib: Record<string, CorridaInput> = {};
      for (const x of ba) ia[x.id] = x.br.decide(a, TICK_MS);
      for (const x of bb) ib[x.id] = x.br.decide(b, TICK_MS);
      def.step(a, ia, TICK_MS); def.step(b, ib, TICK_MS);
    }
    expect(a).toEqual(b);
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

describe('renascer depois de cair', () => {
  it('nasce bem antes do buraco, em chão firme e longe de obstáculos (várias pistas)', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const tr = getTrack(seed);
      for (const h of tr.holes) {
        const x = safeRespawnX(tr, h.x);
        expect(x).toBeGreaterThanOrEqual(24);
        expect(x).toBeLessThanOrEqual(h.x - 10);
        expect(tr.holes.some((o) => x > o.x + 3 && x < o.x + o.w - 3)).toBe(false);
        expect(tr.crates.some((c) => Math.abs(c.x - x) < 26)).toBe(false);
        if (h.x - RESPAWN_BACK >= 24 + 14 * 12) expect(h.x - x).toBeGreaterThanOrEqual(RESPAWN_BACK - 1);
      }
    }
  });

  it('quem cai no buraco renasce atrás dele com tempo de tomar impulso', () => {
    const tr = getTrack(7);
    const h = tr.holes[0]!;
    const ps = players();
    const st = def.createInitialState(7, ps) as CorridaState;
    const me = st.players[ps[0]!.id]!;
    me.x = h.x + h.w / 2; me.y = -3; me.grounded = false; me.vy = -50; me.stunMs = 0; me.invulnMs = 0;
    def.step(st, { [ps[0]!.id]: { run: 1, jump: false, duck: false } } as never, TICK_MS);
    expect(me.falling).toBe(true);
    expect(me.respawnX).toBeLessThan(h.x - 40);
  });
});
