import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { DIFFICULTY } from '../bots';
import { createRng, nextRandom, type Rng } from '../rng';
import { rankByScore } from '../rewards';

/**
 * FUTEBOL DE BOTÃO — duas duplas, cada jogador controla UMA peça. Jogadas por turnos (azul, vermelho, azul...):
 * quem tem a vez aponta (mouse, setas/WASD ou toque), segura FORÇA (a barra sobe e desce sem parar) e solta para lançar a peça.
 * Peças e bola colidem com física de círculos; cada gol tem um goleiro que vai e volta sozinho.
 * Partida de até 2 min; quem fizer 2 gols primeiro vence e o jogo acaba.
 * Tudo é simulado no servidor: o cliente só manda direção e se está segurando o botão de força.
 */
export const DURATION_MS = 120000; // 2 minutos, mas...
export const GOALS_TO_WIN = 2; // ...quem fizer 2 gols primeiro vence e a partida acaba
export const AIM_MS = 5500; // tempo para jogar; acabou, a peça sai sozinha
export const ROLL_MAX_MS = 3800;
export const GOAL_MS = 2300;
const OVER_GRACE_MS = 5000; // depois do tempo, ainda deixa a jogada em andamento terminar

// campo (resolução interna 480x270): linhas de fundo em FX0/FX1, gol no meio
export const FX0 = 36, FX1 = 444, FY0 = 46, FY1 = 226;
export const CX = (FX0 + FX1) / 2, CY = (FY0 + FY1) / 2;
export const GOAL_H = 80; // abertura do gol
export const GOAL_DEPTH = 16;
export const PR = 9; // raio da peça
export const BR = 5; // raio da bola
const KEEP_W = 3; // meia largura do goleiro
const KEEP_H = 9; // meia altura do goleiro
export const KEEP_X = 7; // distância da linha de fundo
const KEEP_R = (GOAL_H / 2) - KEEP_H - 1; // amplitude do goleiro
const KEEP_OMEGA = 2.3; // rad/s

// física
const VMIN = 150, VMAX = 620;
export const POWER_PERIOD_MS = 1300; // um ciclo completo (0→1→0) da barra de força
const K_PIECE = 2.4, K_BALL = 1.7; // atrito (1/s)
const STOP_V = 12;
const M_PIECE = 1, M_BALL = 0.28;
const E_BALL = 0.88, E_PIECE = 0.7, E_WALL = 0.8, E_PWALL = 0.55;
const SUB = 4;
const ROT_SPEED = 2.2; // rad/s com as teclas

export type Team = 0 | 1;
export const TEAM_NAMES = ['AZUL', 'VERMELHO'] as const;
export type Phase = 'aim' | 'roll' | 'goal' | 'over';

export interface Piece { id: PlayerId; team: Team; x: number; y: number; vx: number; vy: number }
export interface Ball { x: number; y: number; vx: number; vy: number }
export type EvKind = 'kick' | 'hit' | 'bump' | 'wall' | 'post' | 'save' | 'goal' | 'start';
export interface Ev { n: number; kind: EvKind; x: number; y: number; v: number; team?: Team }

export interface FutebolState {
  seed: number; rng: number;
  elapsedMs: number;
  order: PlayerId[];
  teams: Record<PlayerId, Team>;
  members: [PlayerId[], PlayerId[]];
  pieces: Piece[];
  ball: Ball;
  score: [number, number];
  goalsBy: Record<PlayerId, number>;
  phase: Phase; phaseMs: number; stillMs: number;
  cur: PlayerId; nextTeam: Team; tp: [number, number];
  aim: number; charging: boolean; chargeMs: number; power: number; prevCharge: boolean;
  keepT: number; // relógio dos goleiros
  lastTouch: PlayerId | null;
  turnNo: number;
  lastGoal: { team: Team; scorer: PlayerId | null } | null;
  events: Ev[]; evN: number;
  shotBy: PlayerId | null; // quem fez a jogada em andamento
}

/** Entrada: `turn` gira a mira, `aim` aponta para um ângulo absoluto (mouse/toque), `snap` 1 = para a bola, 2 = para o gol adversário. */
export interface FutebolInput { turn: -1 | 0 | 1; aim: number | null; snap: 0 | 1 | 2; charge: boolean }

// ---------------------------------------------------------------- geometria / goleiros
/** Posição do goleiro (0 = gol da esquerda, 1 = gol da direita) em função do relógio. Previsível: dá para ler o movimento. */
export function keeperY(keepT: number, side: 0 | 1): number { return CY + KEEP_R * Math.sin(keepT * KEEP_OMEGA + (side === 0 ? 0 : 1.9)); }
export function keeperVy(keepT: number, side: 0 | 1): number { return KEEP_R * KEEP_OMEGA * Math.cos(keepT * KEEP_OMEGA + (side === 0 ? 0 : 1.9)); }
export const keeperX = (side: 0 | 1) => (side === 0 ? FX0 + KEEP_X : FX1 - KEEP_X);
/** Azul defende o gol da esquerda (0) e ataca o da direita; vermelho, o contrário. */
export function goalCenter(side: 0 | 1) { return { x: side === 0 ? FX0 : FX1, y: CY }; }

export function powerAt(chargeMs: number): number {
  const ph = (chargeMs / POWER_PERIOD_MS) % 1;
  return ph < 0.5 ? ph * 2 : 2 - ph * 2;
}
export const speedFor = (power: number) => VMIN + (VMAX - VMIN) * power;

// ---------------------------------------------------------------- física (pura, reutilizada pelos bots para "pré-ver" jogadas)
export interface World { pieces: Piece[]; ball: Ball; keepT: number; lastTouch: PlayerId | null; goal: Team | null; events: Ev[] | null }

function pushEv(w: World, kind: EvKind, x: number, y: number, v: number, team?: Team) {
  if (w.events) w.events.push({ n: 0, kind, x, y, v, team });
}

function collideCircles(w: World, ai: number, bi: number /* -1 = bola */) {
  const a = w.pieces[ai]!;
  const bRef = bi < 0 ? w.ball : w.pieces[bi]!;
  const ra = PR, rb = bi < 0 ? BR : PR;
  const ma = M_PIECE, mb = bi < 0 ? M_BALL : M_PIECE;
  let dx = bRef.x - a.x, dy = bRef.y - a.y;
  let d = Math.hypot(dx, dy);
  const min = ra + rb;
  if (d >= min) return;
  if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d, ny = dy / d;
  const over = min - d;
  const wa = (1 / ma) / (1 / ma + 1 / mb), wb = 1 - wa;
  a.x -= nx * over * wa; a.y -= ny * over * wa;
  bRef.x += nx * over * wb; bRef.y += ny * over * wb;
  const rvx = a.vx - bRef.vx, rvy = a.vy - bRef.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) {
    const e = bi < 0 ? E_BALL : E_PIECE;
    const j = ((1 + e) * vn) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
    bRef.vx += (j / mb) * nx; bRef.vy += (j / mb) * ny;
    if (bi < 0) { w.lastTouch = a.id; pushEv(w, 'hit', bRef.x - nx * rb, bRef.y - ny * rb, vn, a.team); }
    else pushEv(w, 'bump', (a.x + bRef.x) / 2, (a.y + bRef.y) / 2, vn);
  }
}

/** Bola contra um ponto fixo (trave). */
function collidePost(w: World, px: number, py: number) {
  const b = w.ball;
  const r = BR + 2;
  let dx = b.x - px, dy = b.y - py;
  const d = Math.hypot(dx, dy);
  if (d >= r || d < 1e-6) return;
  dx /= d; dy /= d;
  b.x = px + dx * r; b.y = py + dy * r;
  const vn = b.vx * dx + b.vy * dy;
  if (vn < 0) { b.vx -= (1 + E_WALL) * vn * dx; b.vy -= (1 + E_WALL) * vn * dy; pushEv(w, 'post', px, py, -vn); }
}

/** Goleiro: retângulo que se move na vertical. */
function collideKeeper(w: World, side: 0 | 1) {
  const b = w.ball;
  const kx = keeperX(side), ky = keeperY(w.keepT, side), kvy = keeperVy(w.keepT, side);
  const nx = Math.max(kx - KEEP_W, Math.min(b.x, kx + KEEP_W));
  const ny = Math.max(ky - KEEP_H, Math.min(b.y, ky + KEEP_H));
  let dx = b.x - nx, dy = b.y - ny;
  const d = Math.hypot(dx, dy);
  if (d >= BR) return;
  if (d < 1e-6) { dx = side === 0 ? 1 : -1; dy = 0; } else { dx /= d; dy /= d; }
  const pen = BR - d;
  b.x += dx * (pen + 0.1); b.y += dy * (pen + 0.1);
  const rvx = b.vx, rvy = b.vy - kvy;
  const vn = rvx * dx + rvy * dy;
  if (vn < 0) {
    b.vx -= (1 + E_BALL) * vn * dx; b.vy -= (1 + E_BALL) * vn * dy;
    pushEv(w, 'save', b.x, b.y, -vn, side === 0 ? 0 : 1);
  }
}

export function stepWorld(w: World, dtMs: number) {
  const dt = dtMs / 1000 / SUB;
  for (let s = 0; s < SUB; s++) {
    w.keepT += dt;
    const fp = Math.exp(-K_PIECE * dt), fb = Math.exp(-K_BALL * dt);
    for (const p of w.pieces) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= fp; p.vy *= fp;
      if (Math.hypot(p.vx, p.vy) < STOP_V) { p.vx = 0; p.vy = 0; }
    }
    const b = w.ball;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vx *= fb; b.vy *= fb;
    if (Math.hypot(b.vx, b.vy) < STOP_V * 0.7) { b.vx = 0; b.vy = 0; }

    // peças x peças e peças x bola
    for (let i = 0; i < w.pieces.length; i++) {
      for (let j = i + 1; j < w.pieces.length; j++) collideCircles(w, i, j);
      collideCircles(w, i, -1);
    }
    // peças x bordas (peças não entram no gol)
    for (const p of w.pieces) {
      if (p.x < FX0 + PR) { p.x = FX0 + PR; if (p.vx < 0) p.vx *= -E_PWALL; }
      if (p.x > FX1 - PR) { p.x = FX1 - PR; if (p.vx > 0) p.vx *= -E_PWALL; }
      if (p.y < FY0 + PR) { p.y = FY0 + PR; if (p.vy < 0) p.vy *= -E_PWALL; }
      if (p.y > FY1 - PR) { p.y = FY1 - PR; if (p.vy > 0) p.vy *= -E_PWALL; }
    }
    // bola x traves e goleiros
    for (const side of [0, 1] as const) {
      const gx = side === 0 ? FX0 : FX1;
      collidePost(w, gx, CY - GOAL_H / 2);
      collidePost(w, gx, CY + GOAL_H / 2);
      collideKeeper(w, side);
    }
    // bola x bordas
    const inMouth = (y: number) => Math.abs(y - CY) < GOAL_H / 2;
    if (b.x < FX0) {
      // dentro do gol (esquerda): só o fundo e as laterais do gol
      if (inMouth(b.y)) {
        if (w.goal === null) { w.goal = 1; pushEv(w, 'goal', b.x, b.y, Math.hypot(b.vx, b.vy), 1); } // marca para o time 1 (vermelho): bola no gol azul
        if (b.x < FX0 - GOAL_DEPTH + BR) { b.x = FX0 - GOAL_DEPTH + BR; if (b.vx < 0) b.vx *= -0.3; }
        if (b.y < CY - GOAL_H / 2 + BR) { b.y = CY - GOAL_H / 2 + BR; if (b.vy < 0) b.vy *= -0.4; }
        if (b.y > CY + GOAL_H / 2 - BR) { b.y = CY + GOAL_H / 2 - BR; if (b.vy > 0) b.vy *= -0.4; }
      }
    } else if (b.x > FX1) {
      if (inMouth(b.y)) {
        if (w.goal === null) { w.goal = 0; pushEv(w, 'goal', b.x, b.y, Math.hypot(b.vx, b.vy), 0); }
        if (b.x > FX1 + GOAL_DEPTH - BR) { b.x = FX1 + GOAL_DEPTH - BR; if (b.vx > 0) b.vx *= -0.3; }
        if (b.y < CY - GOAL_H / 2 + BR) { b.y = CY - GOAL_H / 2 + BR; if (b.vy < 0) b.vy *= -0.4; }
        if (b.y > CY + GOAL_H / 2 - BR) { b.y = CY + GOAL_H / 2 - BR; if (b.vy > 0) b.vy *= -0.4; }
      }
    }
    if (w.goal === null || (b.x >= FX0 && b.x <= FX1)) {
      if (b.y < FY0 + BR) { b.y = FY0 + BR; if (b.vy < 0) { pushEv(w, 'wall', b.x, b.y, -b.vy); b.vy *= -E_WALL; } }
      if (b.y > FY1 - BR) { b.y = FY1 - BR; if (b.vy > 0) { pushEv(w, 'wall', b.x, b.y, b.vy); b.vy *= -E_WALL; } }
      if (b.x < FX0 + BR && !inMouth(b.y)) { b.x = FX0 + BR; if (b.vx < 0) { pushEv(w, 'wall', b.x, b.y, -b.vx); b.vx *= -E_WALL; } }
      if (b.x > FX1 - BR && !inMouth(b.y)) { b.x = FX1 - BR; if (b.vx > 0) { pushEv(w, 'wall', b.x, b.y, b.vx); b.vx *= -E_WALL; } }
    }
  }
}

function moving(w: World): boolean {
  if (Math.hypot(w.ball.vx, w.ball.vy) > 0) return true;
  return w.pieces.some((p) => p.vx !== 0 || p.vy !== 0);
}

export function cloneWorld(w: World): World {
  return { pieces: w.pieces.map((p) => ({ ...p })), ball: { ...w.ball }, keepT: w.keepT, lastTouch: w.lastTouch, goal: w.goal, events: null };
}

/** Lança uma peça: velocidade na direção do ângulo, proporcional à força (0..1). */
export function launch(w: World, id: PlayerId, angle: number, power: number) {
  const p = w.pieces.find((q) => q.id === id);
  if (!p) return;
  const v = speedFor(Math.max(0, Math.min(1, power)));
  p.vx = Math.cos(angle) * v; p.vy = Math.sin(angle) * v;
}

// ---------------------------------------------------------------- estado
function formation(s: FutebolState) {
  for (const t of [0, 1] as const) {
    s.members[t].forEach((id, i, arr) => {
      const p = s.pieces.find((q) => q.id === id)!;
      const k = arr.length === 1 ? 0 : i === 0 ? -1 : 1;
      p.x = t === 0 ? CX - 112 : CX + 112;
      p.y = CY + k * 44; p.vx = 0; p.vy = 0;
    });
  }
  s.ball.x = CX; s.ball.y = CY; s.ball.vx = 0; s.ball.vy = 0;
  s.lastTouch = null;
}

function emit(s: FutebolState, kind: EvKind, x: number, y: number, v: number, team?: Team) {
  s.events.push({ n: ++s.evN, kind, x, y, v, team });
  if (s.events.length > 10) s.events.splice(0, s.events.length - 10);
}

function startTurn(s: FutebolState) {
  if (s.elapsedMs >= DURATION_MS) { s.phase = 'over'; return; }
  let team = s.nextTeam;
  if (s.members[team].length === 0) team = (1 - team) as Team;
  const m = s.members[team];
  s.cur = m[s.tp[team]++ % m.length]!;
  s.nextTeam = (1 - team) as Team;
  s.phase = 'aim'; s.phaseMs = 0; s.stillMs = 0;
  s.charging = false; s.chargeMs = 0; s.power = 0; s.prevCharge = true; // segurar o botão desde antes não conta
  s.shotBy = null;
  s.turnNo++;
  // mira inicial: para a bola
  const p = s.pieces.find((q) => q.id === s.cur)!;
  s.aim = Math.atan2(s.ball.y - p.y, s.ball.x - p.x);
  emit(s, 'start', p.x, p.y, 0, team);
}

function fire(s: FutebolState, power: number) {
  launch(asWorld(s), s.cur, s.aim, power);
  const p = s.pieces.find((q) => q.id === s.cur)!;
  emit(s, 'kick', p.x, p.y, power, s.teams[s.cur]);
  s.shotBy = s.cur; s.charging = false; s.power = power;
  s.phase = 'roll'; s.phaseMs = 0; s.stillMs = 0;
}

// O estado guarda pieces/ball diretamente; esta "visão" evita copiar objetos todo quadro.
function asWorld(s: FutebolState): World & { _s: FutebolState } {
  const w = { pieces: s.pieces, ball: s.ball, keepT: s.keepT, lastTouch: s.lastTouch, goal: (s.phase === 'goal' && s.lastGoal ? s.lastGoal.team : null) as Team | null, events: [] as Ev[], _s: s };
  return w;
}

function sanitizeAngle(a: unknown): number | null {
  if (typeof a !== 'number' || !Number.isFinite(a)) return null;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// ---------------------------------------------------------------- bot
interface Plan { angle: number; power: number; thinkMs: number; holdMs: number }

function evaluate(base: World, id: PlayerId, team: Team, angle: number, power: number): number {
  const w = cloneWorld(base);
  w.goal = null;
  launch(w, id, angle, power);
  let t = 0;
  while (t < 2800 && w.goal === null) { stepWorld(w, 33.3); t += 33.3; if (!moving(w)) break; }
  const b = w.ball;
  const attackRight = team === 0; // azul ataca o gol da direita
  if (w.goal !== null) return w.goal === team ? 1000 - t * 0.05 : -1000;
  // sem gol: valoriza avançar a bola, chegar perto do gol certo e não deixá-la perto do próprio gol
  const adv = attackRight ? (b.x - CX) / (FX1 - CX) : (CX - b.x) / (CX - FX0);
  const gx = attackRight ? FX1 : FX0;
  const dist = Math.hypot(b.x - gx, b.y - CY);
  const ownGx = attackRight ? FX0 : FX1;
  const ownDist = Math.hypot(b.x - ownGx, b.y - CY);
  const me = w.pieces.find((p) => p.id === id)!;
  const centered = -Math.abs(me.y - CY) * 0.05;
  return adv * 40 - dist * 0.08 + (ownDist < 90 ? -30 : 0) + centered + (w.lastTouch === id ? 6 : 0);
}

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<FutebolState, FutebolInput> {
  const params = DIFFICULTY[difficulty];
  const rng: Rng = createRng(seed ^ 0xf007);
  let plan: Plan | null = null;
  let planTurn = -1;
  let t = 0;
  const NEUTRAL: FutebolInput = { turn: 0, aim: null, snap: 0, charge: false };
  const ANGLE_ERR: Record<BotDifficulty, number> = { easy: 0.14, medium: 0.05, hard: 0.02 };
  const SAMPLES: Record<BotDifficulty, number> = { easy: 14, medium: 28, hard: 48 };

  return {
    decide(s, dtMs) {
      if (s.phase !== 'aim' || s.cur !== playerId) { plan = null; planTurn = -1; return NEUTRAL; }
      if (planTurn !== s.turnNo) {
        planTurn = s.turnNo; t = 0;
        const base: World = { pieces: s.pieces, ball: s.ball, keepT: s.keepT, lastTouch: s.lastTouch, goal: null, events: null };
        const me = s.pieces.find((p) => p.id === playerId)!;
        const team = s.teams[playerId]!;
        // candidatos: ângulos ao redor do que leva à bola, em 3 forças
        const toBall = Math.atan2(s.ball.y - me.y, s.ball.x - me.x);
        const n = SAMPLES[difficulty];
        let best: { a: number; p: number; v: number } | null = null;
        const all: { a: number; p: number; v: number }[] = [];
        // tiros "de geometria": atinge a bola por trás, na linha de um ponto do gol adversário
        const gx = team === 0 ? FX1 : FX0;
        const geo = difficulty === 'easy' ? [-13, 0, 13] : [-26, -13, 0, 13, 26];
        for (const gy of geo) {
          const dx = gx - s.ball.x, dy = CY + gy - s.ball.y;
          const dl = Math.hypot(dx, dy) || 1;
          const cx = s.ball.x - (dx / dl) * (PR + BR - 1), cy = s.ball.y - (dy / dl) * (PR + BR - 1);
          const a = Math.atan2(cy - me.y, cx - me.x);
          for (const p of [0.6, 0.85, 1]) {
            const v = evaluate(base, playerId, team, a, p);
            all.push({ a, p, v });
            if (!best || v > best.v) best = { a, p, v };
          }
        }
        for (let i = 0; i < n; i++) {
          const spread = i < n * 0.6 ? 0.9 : Math.PI; // 60% perto da bola, o resto varre o campo
          const a = toBall + (rng.next() * 2 - 1) * spread;
          const p = [0.45, 0.7, 0.95][i % 3]!;
          const v = evaluate(base, playerId, team, a, p);
          all.push({ a, p, v });
          if (!best || v > best.v) best = { a, p, v };
        }
        all.sort((x, y) => y.v - x.v);
        let pick = best!;
        if (rng.chance(params.errorRate * 1.5)) pick = all[Math.min(all.length - 1, rng.int(2, 6))]!; // às vezes escolhe uma jogada pior
        const err = (rng.next() * 2 - 1) * ANGLE_ERR[difficulty];
        const power = Math.max(0.2, Math.min(1, pick.p + (rng.next() * 2 - 1) * (difficulty === 'easy' ? 0.15 : 0.05)));
        plan = { angle: pick.a + err, power, thinkMs: params.reactionMs * 3 + rng.next() * params.jitterMs * 4 + 500, holdMs: (power * POWER_PERIOD_MS) / 2 };
      }
      t += dtMs;
      if (!plan) return NEUTRAL;
      const aimIn = { turn: 0 as const, aim: plan.angle, snap: 0 as const };
      // espera "pensar", depois segura FORÇA pelo tempo certo e solta
      if (t < plan.thinkMs) return { ...aimIn, charge: false };
      if (t < plan.thinkMs + plan.holdMs) return { ...aimIn, charge: true };
      return { ...aimIn, charge: false };
    },
  };
}

// ---------------------------------------------------------------- definição
export const futebolBotao: MinigameDefinition<FutebolState, FutebolInput> = {
  id: 'futebol-botao',
  name: 'Futebol de Botão',
  category: 'coop',
  mode: 'ffa',
  durationMs: DURATION_MS,
  hideHud: true,
  hudUnit: 'gols',
  formatScore(score) { return `${score} ${score === 1 ? 'gol' : 'gols'} da dupla`; },
  hudText(s) { return `${s.score[0]} × ${s.score[1]}`; },
  instructions: {
    title: 'Futebol de Botão',
    lines: [
      'Duas duplas: AZUL contra VERMELHO. Cada um controla uma peça e a vez alterna entre as equipes.',
      'Na sua vez: aponte, segure FORÇA (a barra sobe e desce) e solte para lançar a peça. Ela empurra a bola!',
      'Faça gol no adversário (o goleiro se mexe sozinho). Quem fizer 2 gols primeiro vence na hora! Em 2 minutos, mais gols vence; empate fica empatado.',
    ],
    controls: [
      { keys: 'Mouse', action: 'arraste a partir da sua peça: a seta aponta para o mouse' },
      { keys: '← → / A D', action: 'girar a mira' },
      { keys: '↑ / W · ↓ / S', action: 'apontar para a bola · para o gol' },
      { keys: 'Espaço (segurar)', action: 'carregar a força; soltar lança a peça' },
    ],
    touch: { stick: false },
  },
  neutralInput: () => ({ turn: 0, aim: null, snap: 0, charge: false }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { turn, aim, snap, charge } = raw as Record<string, unknown>;
    if (!(turn === -1 || turn === 0 || turn === 1) || typeof charge !== 'boolean') return null;
    const sn = snap === 1 || snap === 2 ? snap : 0;
    const a = aim === null || aim === undefined ? null : sanitizeAngle(aim);
    return { turn, aim: a, snap: sn, charge };
  },
  createInitialState(seed, players: ParticipantInfo[]) {
    const rng = createRng(seed ^ 0xf00d);
    const order = players.map((p) => p.id);
    // duplas sorteadas pela seed
    const shuffled = [...order];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = rng.int(0, i); [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]; }
    const half = Math.ceil(shuffled.length / 2);
    const members: [PlayerId[], PlayerId[]] = [shuffled.slice(0, half), shuffled.slice(half)];
    const teams: Record<PlayerId, Team> = {};
    members[0].forEach((id) => { teams[id] = 0; });
    members[1].forEach((id) => { teams[id] = 1; });
    const s: FutebolState = {
      seed, rng: seed | 0, elapsedMs: 0, order, teams, members,
      pieces: shuffled.map((id) => ({ id, team: teams[id]!, x: 0, y: 0, vx: 0, vy: 0 })),
      ball: { x: CX, y: CY, vx: 0, vy: 0 },
      score: [0, 0], goalsBy: Object.fromEntries(order.map((id) => [id, 0])),
      phase: 'aim', phaseMs: 0, stillMs: 0, cur: order[0]!, nextTeam: (nextRandom({ rng: seed ^ 0x77 }) < 0.5 ? 0 : 1) as Team, tp: [0, 0],
      aim: 0, charging: false, chargeMs: 0, power: 0, prevCharge: true, keepT: 0, lastTouch: null, turnNo: 0, lastGoal: null,
      events: [], evN: 0, shotBy: null,
    };
    formation(s);
    startTurn(s);
    return s;
  },
  step(s, inputs, dtMs) {
    s.elapsedMs += dtMs;
    s.phaseMs += dtMs;
    if (s.phase === 'over') return s;

    if (s.phase === 'aim') {
      s.keepT += dtMs / 1000;
      const inp = inputs[s.cur] ?? { turn: 0, aim: null, snap: 0, charge: false };
      const me = s.pieces.find((p) => p.id === s.cur)!;
      // direção
      if (inp.aim !== null) s.aim = inp.aim;
      else if (inp.snap === 1) s.aim = Math.atan2(s.ball.y - me.y, s.ball.x - me.x);
      else if (inp.snap === 2) { const g = goalCenter(s.teams[s.cur] === 0 ? 1 : 0); s.aim = Math.atan2(g.y - me.y, g.x - me.x); }
      if (inp.turn !== 0) s.aim = sanitizeAngle(s.aim + inp.turn * ROT_SPEED * (dtMs / 1000))!;
      // força: segurar sobe e desce sem parar; soltar lança
      if (inp.charge) {
        if (!s.charging && !s.prevCharge) { s.charging = true; s.chargeMs = 0; }
        if (s.charging) { s.chargeMs += dtMs; s.power = powerAt(s.chargeMs); }
      }
      const released = s.charging && !inp.charge;
      s.prevCharge = inp.charge;
      if (released) { fire(s, Math.max(0.08, s.power)); return s; }
      if (s.phaseMs >= AIM_MS) { fire(s, s.charging ? Math.max(0.08, s.power) : 0.5); return s; }
      return s;
    }

    // 'roll' e 'goal': física
    const w = asWorld(s);
    w.events = [];
    stepWorld(w, dtMs);
    s.keepT = w.keepT;
    if (w.lastTouch !== s.lastTouch) s.lastTouch = w.lastTouch;
    for (const e of w.events!) emit(s, e.kind, e.x, e.y, e.v, e.team);

    if (s.phase === 'roll') {
      if (w.goal !== null) {
        const team = w.goal;
        s.score[team]++;
        const scorer = s.lastTouch && s.teams[s.lastTouch] === team ? s.lastTouch : null;
        if (scorer) s.goalsBy[scorer] = (s.goalsBy[scorer] ?? 0) + 1;
        s.lastGoal = { team, scorer };
        s.phase = 'goal'; s.phaseMs = 0;
        s.nextTeam = (1 - team) as Team; // quem levou o gol joga primeiro
        return s;
      }
      s.stillMs = moving(w) ? 0 : s.stillMs + dtMs;
      if (s.stillMs >= 350 || s.phaseMs >= ROLL_MAX_MS) {
        for (const p of s.pieces) { p.vx = 0; p.vy = 0; }
        s.ball.vx = 0; s.ball.vy = 0;
        startTurn(s);
      } else if (s.elapsedMs >= DURATION_MS + OVER_GRACE_MS) s.phase = 'over';
      return s;
    }
    if (s.phase === 'goal') {
      if (s.phaseMs >= GOAL_MS) {
        if (s.score[0] >= GOALS_TO_WIN || s.score[1] >= GOALS_TO_WIN) { s.phase = 'over'; return s; }
        formation(s); startTurn(s);
      }
      return s;
    }
    return s;
  },
  isFinished(s) { return s.phase === 'over'; },
  computeResult(s) {
    const scored = s.order.map((id) => ({ playerId: id, score: s.score[s.teams[id]!] }));
    const bonus: Record<PlayerId, number> = {}, details: Record<PlayerId, string> = {};
    for (const id of s.order) {
      const t = s.teams[id]!;
      const mine = s.goalsBy[id] ?? 0;
      bonus[id] = mine;
      const partner = s.members[t].find((o) => o !== id);
      details[id] = `${TEAM_NAMES[t]} ${s.score[t]} × ${s.score[1 - t]} · ${mine} ${mine === 1 ? 'gol seu' : 'gols seus'}${mine > 0 ? ` · +${mine} ${mine === 1 ? 'moeda' : 'moedas'} de bônus` : ''}${partner ? '' : ''}`;
    }
    return { kind: 'ranking', ranking: rankByScore(scored), bonus, details };
  },
  timeLeftMs(s) { return Math.max(0, DURATION_MS - s.elapsedMs); },
  liveScores(s) { return Object.fromEntries(s.order.map((id) => [id, s.score[s.teams[id]!]])); },
  createBot: createBrain,
};
