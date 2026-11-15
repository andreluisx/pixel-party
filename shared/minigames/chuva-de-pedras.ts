import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { DIFFICULTY } from '../bots';
import { createRng, nextRandom, type Rng } from '../rng';

/**
 * CHUVA DE PEDRAS — arena pequena e limpa, vista de cima. Pedras gigantes caem do céu em pontos avisados por uma
 * marcação vermelha pulsante. A pedra que cai esmaga quem estiver embaixo e FICA na arena: encostar nela a empurra
 * (ela desliza para longe do ponto de contato). Pedra deslizando elimina quem toca; contra pedra parada, destrói a
 * parada e segue; contra outra deslizando, as duas se destroem. O servidor simula tudo (30 Hz).
 * Vence o último vivo; se o tempo (60 s) acabar, vencem os vivos — e, entre vivos, quem recebeu menos IMPACTOS
 * (onda de choque das quedas: não mata, mas empurra e conta). Cada abate causado por pedra empurrada rende +1 moeda.
 */
export const W = 480;
export const H = 270;
/** Área jogável (retângulo da arena). */
export const AX0 = 100, AY0 = 44, AX1 = 380, AY1 = 236;
export const DURATION_MS = 60000;
export const HALF = 5; // meia-hitbox do jogador (círculo de raio 5)
export const R = 11; // raio das pedras
export const SPEED = 92;
export const SLIDE_V = 270; // velocidade inicial de uma pedra empurrada
const FRICTION = 140; // desaceleração da pedra deslizando (px/s²)
const STOP_V = 30;
const PUSH_GRACE_MS = 350; // quem empurrou não é atingido logo em seguida
const SHOCK_R = R + 17; // alcance da onda de choque da queda
const KNOCK = 13;
const MAX_ROCKS = 11;
const END_DELAY_MS = 1200;
export const BONUS_COINS_KILL = 1;
const START: ReadonlyArray<readonly [number, number]> = [[130, 74], [350, 74], [130, 206], [350, 206]];

export interface RPlayer {
  slot: number; x: number; y: number; dx: number; dy: number; alive: boolean; elimAtMs: number;
  impacts: number; kills: number; shockMs: number; cause: 'crush' | 'slide' | null;
}
export interface Rock { id: number; x: number; y: number; vx: number; vy: number; owner: PlayerId | null; graceMs: number }
export interface Incoming { id: number; x: number; y: number; t: number; warnMs: number }
export interface RainState {
  rng: number; elapsedMs: number; nextId: number; nextDropMs: number; endAtMs: number | null;
  order: PlayerId[]; players: Record<PlayerId, RPlayer>; rocks: Rock[]; incoming: Incoming[];
}
export interface RainInput { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const isMoving = (r: Rock) => r.vx !== 0 || r.vy !== 0;
/** Pedra no meio do trajeto de queda: quanto da fase de aviso já passou (0..1). */
export const warnProgress = (i: Incoming) => clamp(i.t / i.warnMs, 0, 1);

// ---------------------------------------------------------------- queda
function chooseDrop(s: RainState): { x: number; y: number } | null {
  const alive = s.order.filter((id) => s.players[id]!.alive);
  for (let attempt = 0; attempt < 14; attempt++) {
    let x: number, y: number;
    if (alive.length && nextRandom(s) < 0.5) { // metade das quedas pressiona alguém (quem fica parado apanha)
      const t = s.players[alive[Math.floor(nextRandom(s) * alive.length)]!]!;
      x = t.x + (nextRandom(s) * 2 - 1) * 38; y = t.y + (nextRandom(s) * 2 - 1) * 38;
    } else { x = AX0 + R + 2 + nextRandom(s) * (AX1 - AX0 - 2 * R - 4); y = AY0 + R + 2 + nextRandom(s) * (AY1 - AY0 - 2 * R - 4); }
    x = clamp(x, AX0 + R + 2, AX1 - R - 2); y = clamp(y, AY0 + R + 2, AY1 - R - 2);
    if (s.incoming.some((i) => Math.hypot(i.x - x, i.y - y) < 2 * R + 8)) continue;
    if (s.rocks.some((r) => Math.hypot(r.x - x, r.y - y) < 2 * R + 4)) continue;
    return { x, y };
  }
  return null;
}

function eliminate(s: RainState, id: PlayerId, cause: 'crush' | 'slide') {
  const p = s.players[id]!;
  p.alive = false; p.elimAtMs = s.elapsedMs; p.cause = cause; p.dx = 0; p.dy = 0;
}

function impact(s: RainState, inc: Incoming) {
  // a queda esmaga qualquer pedra que esteja no lugar
  s.rocks = s.rocks.filter((r) => Math.hypot(r.x - inc.x, r.y - inc.y) >= 2 * R);
  s.rocks.push({ id: inc.id, x: inc.x, y: inc.y, vx: 0, vy: 0, owner: null, graceMs: 0 });
  for (const id of s.order) {
    const p = s.players[id]!;
    if (!p.alive) continue;
    const d = Math.hypot(p.x - inc.x, p.y - inc.y);
    if (d < R + 2) { eliminate(s, id, 'crush'); continue; }
    if (d < SHOCK_R) { // onda de choque: conta um impacto e empurra
      p.impacts++; p.shockMs = 450;
      const ux = d > 0.01 ? (p.x - inc.x) / d : 1, uy = d > 0.01 ? (p.y - inc.y) / d : 0;
      p.x = clamp(p.x + ux * KNOCK, AX0 + HALF, AX1 - HALF); p.y = clamp(p.y + uy * KNOCK, AY0 + HALF, AY1 - HALF);
    }
  }
}

// ---------------------------------------------------------------- bot
const BOT: Record<BotDifficulty, { notice: number; offense: number; look: number }> = {
  easy: { notice: 520, offense: 0.25, look: 0.3 },
  medium: { notice: 280, offense: 0.7, look: 0.5 },
  hard: { notice: 120, offense: 1, look: 0.7 },
};
const DIRS: ReadonlyArray<readonly [-1 | 0 | 1, -1 | 0 | 1]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<RainState, RainInput> {
  const base = DIFFICULTY[difficulty], prm = BOT[difficulty];
  const rng: Rng = createRng(seed ^ 0x5eed);
  let thinkMs = 0;
  let cur: RainInput = { dx: 0, dy: 0 };
  return {
    decide(s, dtMs) {
      const me = s.players[playerId];
      if (!me || !me.alive) return { dx: 0, dy: 0 };
      thinkMs -= dtMs;
      if (thinkMs > 0) return cur;
      thinkMs = base.reactionMs * 0.5 + rng.int(0, base.jitterMs);
      // alvo ofensivo: ficar do lado oposto da pedra em relação ao inimigo e encostar (a pedra vai na direção do inimigo)
      let goal: { x: number; y: number } | null = null, bestD = Infinity;
      if (rng.chance(prm.offense)) {
        const foes = s.order.filter((id) => id !== playerId && s.players[id]!.alive).map((id) => s.players[id]!);
        for (const r of s.rocks) {
          if (isMoving(r)) continue;
          for (const f of foes) {
            const fd = Math.hypot(f.x - r.x, f.y - r.y); if (fd < 20 || fd > 190) continue;
            const ux = (f.x - r.x) / fd, uy = (f.y - r.y) / fd;
            // sem outra pedra no caminho
            if (s.rocks.some((o) => o !== r && Math.abs((o.x - r.x) * uy - (o.y - r.y) * ux) < 2 * R - 2 && (o.x - r.x) * ux + (o.y - r.y) * uy > 0 && (o.x - r.x) * ux + (o.y - r.y) * uy < fd)) continue;
            const sx = r.x - ux * (R + HALF + 1), sy = r.y - uy * (R + HALF + 1);
            if (sx < AX0 + HALF || sx > AX1 - HALF || sy < AY0 + HALF || sy > AY1 - HALF) continue;
            const d = Math.hypot(sx - me.x, sy - me.y) + fd * 0.3;
            if (d < bestD) { bestD = d; goal = Math.hypot(sx - me.x, sy - me.y) < 5 ? { x: r.x, y: r.y } : { x: sx, y: sy }; }
          }
        }
      }
      const cx = (AX0 + AX1) / 2, cy = (AY0 + AY1) / 2;
      let best = -Infinity, pick = DIRS[0]!;
      for (const [dx, dy] of DIRS) {
        const len = Math.hypot(dx, dy) || 1;
        const px = clamp(me.x + (dx / len) * SPEED * 0.4, AX0 + HALF, AX1 - HALF), py = clamp(me.y + (dy / len) * SPEED * 0.4, AY0 + HALF, AY1 - HALF);
        let sc = 0;
        for (const inc of s.incoming) {
          if (inc.t < prm.notice) continue; // ainda "não viu" a marcação
          const d = Math.hypot(px - inc.x, py - inc.y), rad = R + HALF + 9;
          if (d < rad) sc -= 900 + 600 * (1 - d / rad);
          else if (d < SHOCK_R + 6) sc -= 60;
        }
        for (const r of s.rocks) {
          const d = Math.hypot(px - r.x, py - r.y);
          if (isMoving(r)) {
            for (const tau of [0.12, 0.3, 0.5]) { // trajetória prevista da pedra deslizando
              const rx = r.x + r.vx * tau * (1 - tau * 0.3), ry = r.y + r.vy * tau * (1 - tau * 0.3);
              if (Math.hypot(px - rx, py - ry) < R + HALF + 7) sc -= 1000;
            }
          } else if (d < R + HALF + 0.5 && !(goal && Math.hypot(goal.x - r.x, goal.y - r.y) < 1)) sc -= 25; // não encostar à toa
        }
        const edge = Math.min(px - AX0, AX1 - px, py - AY0, AY1 - py);
        sc -= Math.max(0, 22 - edge) * 1.2;
        sc -= Math.hypot(px - cx, py - cy) * 0.04;
        if (goal) sc += 90 * (1 - Math.min(1, Math.hypot(px - goal.x, py - goal.y) / 260));
        sc += rng.next() * 2;
        if (sc > best) { best = sc; pick = [dx, dy]; }
      }
      // erro humano (só nos níveis mais baixos)
      cur = rng.chance(base.errorRate * 0.5) ? { dx: rng.int(-1, 1) as -1 | 0 | 1, dy: rng.int(-1, 1) as -1 | 0 | 1 } : { dx: pick[0], dy: pick[1] };
      return cur;
    },
  };
}

// ---------------------------------------------------------------- definição
export const chuvaDePedras: MinigameDefinition<RainState, RainInput> = {
  id: 'chuva-de-pedras',
  name: 'Chuva de Pedras',
  category: 'survival',
  mode: 'ffa',
  durationMs: DURATION_MS,
  hudUnit: ' abates',
  hideHud: true,
  instructions: {
    title: 'Chuva de Pedras',
    lines: [
      'Pedras gigantes caem do céu. A marcação vermelha mostra onde: saia de lá! Pedra que cai em cima de você elimina.',
      'A pedra fica na arena. Encoste nela para empurrar: ela desliza para longe de você e elimina quem estiver no caminho.',
      'Pedra deslizando destrói a parada; duas deslizando se destroem. Último vivo vence (cada abate rende +1 moeda).',
    ],
    controls: [{ keys: 'WASD / Setas', action: 'mover (encostar empurra a pedra)' }],
    touch: { stick: true },
  },
  neutralInput: () => ({ dx: 0, dy: 0 }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { dx, dy } = raw as Record<string, unknown>;
    const ok = (v: unknown): v is -1 | 0 | 1 => v === -1 || v === 0 || v === 1;
    if (!ok(dx) || !ok(dy)) return null;
    return { dx, dy };
  },
  createInitialState(seed, players: ParticipantInfo[]) {
    const s: RainState = { rng: seed | 0, elapsedMs: 0, nextId: 1, nextDropMs: 1800, endAtMs: null, order: [], players: {}, rocks: [], incoming: [] };
    for (const p of players) {
      const [x, y] = START[p.slot]!;
      s.order.push(p.id);
      s.players[p.id] = { slot: p.slot, x, y, dx: 0, dy: 0, alive: true, elimAtMs: 0, impacts: 0, kills: 0, shockMs: 0, cause: null };
    }
    return s;
  },
  step(s, inputs, dtMs) {
    if (s.endAtMs !== null && s.elapsedMs >= s.endAtMs) { s.elapsedMs += dtMs; return s; }
    const dt = dtMs / 1000;
    s.elapsedMs += dtMs;
    const prog = Math.min(1, s.elapsedMs / DURATION_MS);

    // novas quedas: cada vez mais rápidas e com aviso mais curto
    s.nextDropMs -= dtMs;
    if (s.nextDropMs <= 0) {
      s.nextDropMs = lerp(1250, 480, prog) * (0.8 + nextRandom(s) * 0.4);
      const n = prog > 0.55 && nextRandom(s) < 0.4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        if (s.rocks.length + s.incoming.length >= MAX_ROCKS) break;
        const pos = chooseDrop(s);
        if (pos) s.incoming.push({ id: s.nextId++, x: pos.x, y: pos.y, t: 0, warnMs: lerp(1500, 950, prog) });
      }
    }
    for (const inc of s.incoming) inc.t += dtMs;
    const landing = s.incoming.filter((i) => i.t >= i.warnMs);
    if (landing.length) { s.incoming = s.incoming.filter((i) => i.t < i.warnMs); for (const inc of landing) impact(s, inc); }

    // jogadores: movimento, pedras paradas são sólidas e, ao encostar, começam a deslizar
    for (const id of s.order) {
      const p = s.players[id]!;
      if (!p.alive) continue;
      const inp = inputs[id] ?? { dx: 0, dy: 0 };
      p.dx = inp.dx; p.dy = inp.dy; p.shockMs = Math.max(0, p.shockMs - dtMs);
      const len = Math.hypot(inp.dx, inp.dy) || 1;
      p.x = clamp(p.x + (inp.dx / len) * SPEED * dt, AX0 + HALF, AX1 - HALF);
      p.y = clamp(p.y + (inp.dy / len) * SPEED * dt, AY0 + HALF, AY1 - HALF);
      for (const r of s.rocks) {
        if (isMoving(r)) continue;
        const d = Math.hypot(p.x - r.x, p.y - r.y);
        if (d >= R + HALF) continue;
        const ux = d > 0.01 ? (r.x - p.x) / d : (inp.dx || 1), uy = d > 0.01 ? (r.y - p.y) / d : inp.dy; // para longe do ponto de contato
        const un = Math.hypot(ux, uy) || 1, dirx = ux / un, diry = uy / un;
        const blockX = (dirx < 0 && r.x <= AX0 + R + 0.01) || (dirx > 0 && r.x >= AX1 - R - 0.01);
        const blockY = (diry < 0 && r.y <= AY0 + R + 0.01) || (diry > 0 && r.y >= AY1 - R - 0.01);
        const vx = blockX ? 0 : dirx * SLIDE_V, vy = blockY ? 0 : diry * SLIDE_V;
        if (vx !== 0 || vy !== 0) { r.vx = vx; r.vy = vy; r.owner = id; r.graceMs = PUSH_GRACE_MS; }
        else { // encostada na parede, não sai do lugar: continua sólida
          const n = d > 0.01 ? d : 1; p.x = clamp(r.x + ((p.x - r.x) / n) * (R + HALF), AX0 + HALF, AX1 - HALF); p.y = clamp(r.y + ((p.y - r.y) / n) * (R + HALF), AY0 + HALF, AY1 - HALF);
        }
      }
    }

    // pedras deslizando
    const gone = new Set<number>();
    for (const r of s.rocks) {
      r.graceMs = Math.max(0, r.graceMs - dtMs);
      if (!isMoving(r)) continue;
      const sp = Math.hypot(r.vx, r.vy), nsp = sp - FRICTION * dt;
      if (nsp < STOP_V) { r.vx = 0; r.vy = 0; continue; }
      r.vx *= nsp / sp; r.vy *= nsp / sp;
      r.x += r.vx * dt; r.y += r.vy * dt;
      if (r.x < AX0 + R) { r.x = AX0 + R; r.vx = 0; } else if (r.x > AX1 - R) { r.x = AX1 - R; r.vx = 0; }
      if (r.y < AY0 + R) { r.y = AY0 + R; r.vy = 0; } else if (r.y > AY1 - R) { r.y = AY1 - R; r.vy = 0; }
    }
    for (let i = 0; i < s.rocks.length; i++) {
      const a = s.rocks[i]!;
      for (let j = i + 1; j < s.rocks.length; j++) {
        const b = s.rocks[j]!;
        if (!isMoving(a) && !isMoving(b)) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) >= 2 * R - 3) continue;
        if (isMoving(a) && isMoving(b)) { gone.add(a.id); gone.add(b.id); } // duas deslizando: as duas quebram
        else gone.add(isMoving(a) ? b.id : a.id); // a parada quebra e a outra segue
      }
    }
    // pedra deslizando elimina quem toca (quem acabou de empurrar tem uma folga curta)
    for (const r of s.rocks) {
      if (!isMoving(r) || gone.has(r.id)) continue;
      for (const id of s.order) {
        const p = s.players[id]!;
        if (!p.alive || (r.owner === id && r.graceMs > 0)) continue;
        if (Math.hypot(p.x - r.x, p.y - r.y) < R + HALF - 1) {
          eliminate(s, id, 'slide');
          if (r.owner && r.owner !== id) s.players[r.owner]!.kills++;
        }
      }
    }
    if (gone.size) s.rocks = s.rocks.filter((r) => !gone.has(r.id));

    if (s.endAtMs === null && s.order.filter((id) => s.players[id]!.alive).length <= 1) s.endAtMs = s.elapsedMs + END_DELAY_MS;
    return s;
  },
  isFinished: (s) => s.elapsedMs >= DURATION_MS || (s.endAtMs !== null && s.elapsedMs >= s.endAtMs),
  computeResult(s) {
    // vivos: menos impactos é melhor; eliminados: quem caiu depois é melhor; iguais empatam (dividem a colocação).
    const scored = s.order.map((id) => { const p = s.players[id]!; return { playerId: id, score: p.alive ? 200000 - Math.min(999, p.impacts) * 100 : Math.round(p.elimAtMs / 10) }; }).sort((a, b) => b.score - a.score);
    let rank = 1;
    const bonus: Record<PlayerId, number> = {}, details: Record<PlayerId, string> = {}, kills: Record<PlayerId, number> = {};
    for (const id of s.order) {
      const p = s.players[id]!;
      kills[id] = p.kills;
      if (p.kills > 0) bonus[id] = p.kills * BONUS_COINS_KILL;
      details[id] = `${p.kills} ${p.kills === 1 ? 'abate' : 'abates'} com pedras · ${p.impacts} ${p.impacts === 1 ? 'impacto' : 'impactos'}${p.kills > 0 ? ` · +${p.kills * BONUS_COINS_KILL} ${p.kills === 1 ? 'moeda' : 'moedas'} de bônus` : ''}`;
    }
    return { kind: 'ranking', ranking: scored.map((e, i) => { if (i > 0 && e.score < scored[i - 1]!.score) rank = i + 1; return { playerId: e.playerId, rank, score: e.score }; }), bonus, details, kills };
  },
  formatScore(score) {
    if (score >= 100000) { const n = (200000 - score) / 100; return `sobreviveu · ${n} ${n === 1 ? 'impacto' : 'impactos'}`; }
    return `eliminado aos ${(score / 100).toFixed(1).replace('.', ',')} s`;
  },
  timeLeftMs: (s) => Math.max(0, DURATION_MS - s.elapsedMs),
  liveScores(s) {
    const out: Record<PlayerId, number> = {};
    for (const id of s.order) out[id] = s.players[id]!.kills;
    return out;
  },
  publicState: (s) => ({ ...s, rng: 0 }),
  createBot: createBrain,
};
