import type { MinigameBrain, MinigameDefinition } from '../minigame';
import type { BotDifficulty, ParticipantInfo, PlayerId } from '../types';
import { createRng, nextRandom, type Rng } from '../rng';

/**
 * DUELO DE ARQUEIROS — 4 arqueiros, todos contra todos, numa arena de plataforma. Os ARQUEIROS atravessam as laterais
 * (quem sai por um lado reaparece no outro), mas as FLECHAS não: cravam na borda. Um BURACO no centro do chão leva
 * quem cai para o topo da tela. Cada um começa com 3 vidas (máx. 4).
 * Flechas começam quase retas e vão caindo (gravidade). Power-ups: flecha TRIPLA, flecha FLAMEJANTE (atravessa
 * jogadores, quebra escudo e destrói plataformas/blocos), ESCUDO, VIDA EXTRA e BOTAS. Plataformas e pilares aparecem
 * e somem. Vence o último vivo; se o tempo (45 s) acabar, vence quem tiver mais vidas; iguais dividem a vitória.
 * Estatísticas por arqueiro (abates, acertos, precisão). MOEDAS de bônus para o tabuleiro: +1 por abate e +1 extra no
 * ÚLTIMO HIT (o golpe que decide a partida). Não mudam a colocação nem desfazem empates.
 * O servidor simula tudo (30 Hz): movimento, mira, disparos, acertos e vidas. Cliente só envia controles.
 */
export const W = 480;
export const H = 270;
export const GROUND = 246;
export const DURATION_MS = 45000;
export const HW = 5; // meia largura do arqueiro
export const HH = 14; // altura do arqueiro (pés em y)
const GRAV = 900;
const WALK = 72;
const RUN = 112;
const JUMP_V = 305;
export const ARROW_SPEED = 380;
export const FIRE_SPEED = 440;
export const ARROW_GRAV = 300;
const ARROW_LIFE_MS = 2400;
const COOLDOWN_MS = 500;
const INVULN_MS = 1500;
export const START_LIVES = 3;
export const MAX_LIVES = 4;
const SPECIAL_CHARGES = 3;
const BOOTS_MS = 8000;
const PICKUP_EVERY_MS = 4200;
const PICKUP_TTL_MS = 12000;
const MAX_PICKUPS = 3;
const END_DELAY_MS = 1400;
const SPREAD = 0.14; // abertura da flecha tripla (rad)
const PICKUP_MIN_GAP = 70; // distância mínima entre dois itens no chão
const PICKUP_RECENT = 5; // últimos pontos de surgimento que não podem se repetir
const PORTAL_INVULN_MS = 700;
/** Moedas de bônus (a moeda é a pontuação do tabuleiro; somam à recompensa da colocação sem mudar o ranking). */
export const POINTS_HIT = 0;
export const POINTS_KILL = 1; // por abate
export const POINTS_LAST_HIT = 1; // extra para o ÚLTIMO HIT
export const BONUS_COINS_LAST_HIT = POINTS_LAST_HIT;
/** Buraco no chão do centro: quem cai reaparece no topo (passagem entre a parte de baixo e a de cima). */
export const HOLE = { x0: 208, x1: 272 } as const;
/** Sobre o buraco (flechas e desenho). */
export const overHole = (x: number) => x > HOLE.x0 && x < HOLE.x1;
/** O arqueiro cai quando o centro dele passa da borda (3 px de tolerância: dá para ficar na quina). */
export const fallsInHole = (x: number) => x > HOLE.x0 + 3 && x < HOLE.x1 - 3;

export interface Plat { x: number; y: number; w: number } // plataforma de mão única (fina)
export interface Rect { x: number; y: number; w: number; h: number }
export const STATIC_PLATS: ReadonlyArray<Plat> = [
  { x: 28, y: 204, w: 84 }, { x: 368, y: 204, w: 84 }, { x: 150, y: 164, w: 180 },
  { x: 24, y: 124, w: 76 }, { x: 380, y: 124, w: 76 }, { x: 180, y: 84, w: 120 },
];
/** Elementos que aparecem e somem (plataformas finas e pilares de pedra). */
export interface SlotDef { kind: 'plat' | 'block'; x: number; y: number; w: number; h: number }
export const SLOT_DEFS: ReadonlyArray<SlotDef> = [
  { kind: 'plat', x: 130, y: 124, w: 60, h: 6 }, { kind: 'plat', x: 290, y: 124, w: 60, h: 6 }, { kind: 'plat', x: 215, y: 204, w: 50, h: 6 },
  { kind: 'plat', x: 60, y: 164, w: 50, h: 6 }, { kind: 'plat', x: 370, y: 164, w: 50, h: 6 },
  { kind: 'block', x: 100, y: 212, w: 14, h: 34 }, { kind: 'block', x: 366, y: 212, w: 14, h: 34 }, { kind: 'block', x: 233, y: 130, w: 14, h: 34 },
];
/** Onde reaparecer (pés) e onde podem cair os itens: todos sobre piso fixo, nenhum sobre o buraco. */
export const SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [40, GROUND], [135, GROUND], [345, GROUND], [440, GROUND],
  [70, 204], [410, 204],
  [175, 164], [240, 164], [305, 164],
  [60, 124], [420, 124],
  [205, 84], [275, 84],
];
/** Formações iniciais (a seed escolhe uma e embaralha quem fica em cada ponto): nunca ficam perto uns dos outros. */
export const START_LAYOUTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[40, GROUND], [440, GROUND], [60, 124], [420, 124]],
  [[110, GROUND], [370, GROUND], [36, 124], [444, 124]],
];

export type Special = 'triple' | 'fire';
export type PickupType = 'triple' | 'fire' | 'shield' | 'life' | 'boots';
export interface Archer {
  slot: number; x: number; y: number; vx: number; vy: number; facing: 1 | -1; grounded: boolean; moving: boolean;
  coyote: number; jumpBuf: number; prevJump: boolean; aim: number; cooldownMs: number;
  lives: number; alive: boolean; elimAtMs: number; invulnMs: number; shield: boolean;
  special: Special | null; charges: number; bootsMs: number;
  /** estatísticas */ kills: number; hitsDealt: number; hitsTaken: number; shots: number; points: number; portals: number; lastHitBy: PlayerId | null;
}
export interface Arrow { id: number; owner: PlayerId; x: number; y: number; vx: number; vy: number; kind: 'normal' | 'fire'; ageMs: number; stuckMs: number; hit: PlayerId[] }
export interface Pickup { id: number; type: PickupType; x: number; y: number; ttl: number }
export interface Slot { id: number; kind: 'plat' | 'block'; x: number; y: number; w: number; h: number; phase: 'hidden' | 'warn' | 'solid' | 'fade'; t: number; dur: number }
export interface FeedEvent { id: number; kind: 'hit' | 'kill' | 'last'; by: PlayerId; victim: PlayerId; atMs: number }
export interface ArcherState {
  rng: number; elapsedMs: number; nextId: number; nextPickupMs: number; endAtMs: number | null;
  order: PlayerId[]; players: Record<PlayerId, Archer>;
  arrows: Arrow[]; pickups: Pickup[]; slots: Slot[];
  /** pontos de surgimento usados há pouco (para variar) e o andar do último item */
  recentPts: number[]; lastPickupY: number; lastPickupType: PickupType | null;
  /** últimos acertos (mais novo no fim) e o golpe que decidiu a partida (ÚLTIMO HIT) */
  feed: FeedEvent[]; lastHit: { by: PlayerId; victim: PlayerId; atMs: number } | null;
}
/** aim = ângulo em radianos (0 = direita, y para baixo). */
export interface ArcherInput { dx: -1 | 0 | 1; jump: boolean; run: boolean; fire: boolean; aim: number }

export const wrapX = (x: number) => ((x % W) + W) % W;
/** Menor diferença horizontal considerando a continuidade da tela. */
export const wrapDelta = (a: number, b: number) => ((a - b + W / 2) % W + W) % W - W / 2;
export const slotSolid = (s: Slot) => s.phase === 'solid' || s.phase === 'fade';

/** Trajetória de uma flecha disparada de (x,y) com `angle`: pontos a cada passo (para a pré-visualização e para os bots).
 *  As flechas NÃO atravessam as laterais: a trajetória termina quando chega na borda. */
export function arrowPath(x: number, y: number, angle: number, fire = false, steps = 24, stepMs = 40): { x: number; y: number }[] {
  const sp = fire ? FIRE_SPEED : ARROW_SPEED;
  let vx = Math.cos(angle) * sp, vy = Math.sin(angle) * sp, px = x, py = y;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < steps; i++) {
    vy += ARROW_GRAV * (stepMs / 1000); px += vx * (stepMs / 1000); py += vy * (stepMs / 1000);
    if (px <= 0 || px >= W) break;
    out.push({ x: px, y: py });
  }
  return out;
}

/** Ângulo (baixo arco) para uma flecha sair de `from` e passar por `to`; usa a mesma gravidade das flechas. Distância direta (sem continuidade da tela). */
export function solveAim(from: { x: number; y: number }, to: { x: number; y: number }, fire = false): number {
  const v = fire ? FIRE_SPEED : ARROW_SPEED;
  const dxw = to.x - from.x, dy = to.y - from.y;
  const adx = Math.abs(dxw);
  if (adx < 1) return dy < 0 ? -Math.PI / 2 : Math.PI / 2;
  const k = (ARROW_GRAV * adx * adx) / (2 * v * v);
  const disc = adx * adx - 4 * k * (k - dy);
  let u: number;
  if (disc < 0) u = -1; // fora de alcance: 45°
  else { const r1 = (-adx + Math.sqrt(disc)) / (2 * k), r2 = (-adx - Math.sqrt(disc)) / (2 * k); u = Math.abs(r1) < Math.abs(r2) ? r1 : r2; }
  const th = Math.atan(u);
  return dxw >= 0 ? th : Math.PI - th;
}

function solids(s: ArcherState): { blocks: Rect[]; plats: Plat[] } {
  const blocks: Rect[] = [], plats: Plat[] = [...STATIC_PLATS];
  for (const sl of s.slots) if (slotSolid(sl)) (sl.kind === 'block' ? blocks.push({ x: sl.x, y: sl.y, w: sl.w, h: sl.h }) : plats.push({ x: sl.x, y: sl.y, w: sl.w }));
  return { blocks, plats };
}

// ---------------------------------------------------------------- criação / ciclo de plataformas
function slotCycle(sl: Slot, s: ArcherState) {
  const r = nextRandom(s);
  if (sl.phase === 'hidden') { sl.phase = 'warn'; sl.dur = 900; }
  else if (sl.phase === 'warn') { sl.phase = 'solid'; sl.dur = 5500 + r * 4000; }
  else if (sl.phase === 'solid') { sl.phase = 'fade'; sl.dur = 900; }
  else { sl.phase = 'hidden'; sl.dur = 3000 + r * 4500; }
  sl.t = 0;
}

function farthestSpawn(s: ArcherState, self: PlayerId): readonly [number, number] {
  let best = SPAWNS[0]!, bestD = -1;
  for (const sp of SPAWNS) {
    let d = Infinity;
    for (const id of s.order) { if (id === self) continue; const o = s.players[id]!; if (!o.alive) continue; d = Math.min(d, Math.hypot(sp[0] - o.x, sp[1] - o.y)); }
    if (d > bestD) { bestD = d; best = sp; }
  }
  return best;
}

/** Escolhe um ponto de surgimento: nunca perto de outro item, fora dos últimos pontos usados, preferindo trocar de andar. */
function pickPickupPoint(s: ArcherState): number {
  const cands: { i: number; w: number }[] = [];
  SPAWNS.forEach((pt, i) => {
    if (s.recentPts.includes(i)) return;
    let nearest = Infinity;
    for (const pk of s.pickups) nearest = Math.min(nearest, Math.hypot(pk.x - pt[0], pk.y - (pt[1] - 8)));
    if (nearest < PICKUP_MIN_GAP) return;
    cands.push({ i, w: 1 + (pt[1] !== s.lastPickupY ? 1.2 : 0) + Math.min(nearest, 240) / 240 });
  });
  if (!cands.length) return -1;
  let r = nextRandom(s) * cands.reduce((a, c) => a + c.w, 0);
  for (const c of cands) { if ((r -= c.w) < 0) return c.i; }
  return cands[cands.length - 1]!.i;
}

function dropPickup(s: ArcherState): boolean {
  const idx = pickPickupPoint(s);
  if (idx < 0) return false;
  const types: [PickupType, number][] = [['triple', 3], ['fire', 2], ['shield', 3], ['life', 1.5], ['boots', 2]];
  const tot = types.reduce((a, [t, w]) => a + (t === s.lastPickupType ? w * 0.3 : w), 0);
  let r = nextRandom(s) * tot, type: PickupType = 'shield';
  for (const [t, w] of types) { if ((r -= t === s.lastPickupType ? w * 0.3 : w) < 0) { type = t; break; } }
  const sp = SPAWNS[idx]!;
  s.pickups.push({ id: s.nextId++, type, x: sp[0], y: sp[1] - 8, ttl: PICKUP_TTL_MS });
  s.recentPts.push(idx); if (s.recentPts.length > PICKUP_RECENT) s.recentPts.shift();
  s.lastPickupY = sp[1]; s.lastPickupType = type;
  return true;
}

function shoot(s: ArcherState, id: PlayerId, p: Archer) {
  const fire = p.special === 'fire';
  const angles = p.special === 'triple' ? [p.aim - SPREAD, p.aim, p.aim + SPREAD] : [p.aim];
  const sp = fire ? FIRE_SPEED : ARROW_SPEED;
  p.shots += angles.length;
  for (const a of angles) s.arrows.push({ id: s.nextId++, owner: id, x: Math.max(0, Math.min(W, p.x + Math.cos(a) * 8)), y: p.y - 9 + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, kind: fire ? 'fire' : 'normal', ageMs: 0, stuckMs: 0, hit: [] });
  p.cooldownMs = p.special === 'triple' ? COOLDOWN_MS + 120 : COOLDOWN_MS;
  if (p.special) { p.charges--; if (p.charges <= 0) { p.special = null; p.charges = 0; } }
}

export type DamageResult = 'none' | 'shield' | 'hit' | 'kill';
function pushFeed(s: ArcherState, kind: FeedEvent['kind'], by: PlayerId, victim: PlayerId) {
  s.feed.push({ id: s.nextId++, kind, by, victim, atMs: s.elapsedMs });
  if (s.feed.length > 6) s.feed.shift();
}
function damage(s: ArcherState, victimId: PlayerId, v: Archer, breaksShield: boolean, attackerId: PlayerId): DamageResult {
  if (!v.alive || v.invulnMs > 0) return 'none';
  if (v.shield) { v.shield = false; v.invulnMs = 400; if (!breaksShield) return 'shield'; }
  const att = s.players[attackerId]!;
  v.lives--; v.hitsTaken++; v.lastHitBy = attackerId;
  att.hitsDealt++; att.points += POINTS_HIT;
  if (v.lives <= 0) {
    v.alive = false; v.elimAtMs = s.elapsedMs; v.lives = 0;
    att.kills++; att.points += POINTS_KILL;
    // ÚLTIMO HIT: o abate que deixa no máximo um arqueiro de pé decide a partida
    const decisive = s.lastHit === null && s.order.filter((id) => s.players[id]!.alive).length <= 1;
    if (decisive) { s.lastHit = { by: attackerId, victim: victimId, atMs: s.elapsedMs }; att.points += POINTS_LAST_HIT; }
    pushFeed(s, decisive ? 'last' : 'kill', attackerId, victimId);
    return 'kill';
  }
  pushFeed(s, 'hit', attackerId, victimId);
  v.invulnMs = INVULN_MS;
  const sp = farthestSpawn(s, victimId); // reaparece longe dos inimigos, com invulnerabilidade curta
  v.x = sp[0]; v.y = sp[1]; v.vx = 0; v.vy = 0; v.grounded = true; v.special = null; v.charges = 0;
  return 'hit';
}

// ---------------------------------------------------------------- bot
const BOT: Record<BotDifficulty, { noise: number; react: number; lead: boolean; dodge: number; hunt: number }> = {
  easy: { noise: 0.22, react: 650, lead: false, dodge: 0.25, hunt: 0.5 },
  medium: { noise: 0.09, react: 380, lead: true, dodge: 0.6, hunt: 0.8 },
  hard: { noise: 0.025, react: 170, lead: true, dodge: 0.92, hunt: 1 },
};

function createBrain(playerId: PlayerId, difficulty: BotDifficulty, seed: number): MinigameBrain<ArcherState, ArcherInput> {
  const prm = BOT[difficulty];
  const rng: Rng = createRng(seed ^ 0xa4c3);
  let fireAt = 800, strafeUntil = 0, strafeDir: -1 | 1 = 1, jumpHold = 0, lastJumpTry = -9999, holeUntil = 0;
  return {
    decide(s, dtMs) {
      const me = s.players[playerId];
      if (!me || !me.alive) return { dx: 0, jump: false, run: false, fire: false, aim: 0 };
      const t = s.elapsedMs;
      const foes = s.order.filter((id) => id !== playerId && s.players[id]!.alive).map((id) => ({ id, p: s.players[id]! }));
      let target = foes[0];
      let bestD = Infinity;
      for (const f of foes) { const d = Math.hypot(f.p.x - me.x, (f.p.y - me.y) * 1.5) - (f.p.lives === 1 ? 30 : 0); if (d < bestD) { bestD = d; target = f; } }

      let dx: -1 | 0 | 1 = 0, jump = false, run = false, fire = false, aim = me.facing > 0 ? 0 : Math.PI;
      // 1) itens: bots bons vão buscar o que está perto
      let goal: { x: number; y: number } | null = null;
      for (const pk of s.pickups) {
        const d = Math.hypot(pk.x - me.x, pk.y - me.y);
        const want = pk.type === 'life' ? me.lives < MAX_LIVES : pk.type === 'shield' ? !me.shield : true;
        if (want && d < (difficulty === 'easy' ? 40 : 110) && (!goal || d < Math.hypot(goal.x - me.x, goal.y - me.y))) goal = pk;
      }
      // 2) fugir/desviar de flechas que se aproximam
      let danger = false;
      for (const a of s.arrows) {
        if (a.owner === playerId || a.stuckMs > 0) continue;
        const rel = a.x - me.x, ry = a.y - (me.y - 7);
        const closing = (rel > 0 && a.vx < 0) || (rel < 0 && a.vx > 0);
        if (closing && Math.abs(rel) < 110 && Math.abs(ry) < 34) { danger = true; break; }
      }
      if (danger && rng.chance(prm.dodge * 0.35) && t - lastJumpTry > 350 && me.grounded) { jump = true; lastJumpTry = t; jumpHold = 200; }

      if (target) {
        const tp = target.p;
        const dxw = tp.x - me.x, dyw = tp.y - me.y;
        const dist = Math.hypot(dxw, dyw);
        // movimento: manter uma boa distância, mudar de altura e variar o lado
        const wantDist = difficulty === 'easy' ? 90 : 150;
        if (t > strafeUntil) { strafeUntil = t + 600 + rng.int(0, 900); strafeDir = rng.chance(0.5) ? 1 : -1; }
        const toward = Math.sign(dxw) as -1 | 0 | 1;
        if (dist > wantDist + 40) dx = toward; else if (dist < wantDist - 40) dx = (-toward) as -1 | 0 | 1; else dx = rng.chance(prm.hunt) ? strafeDir : 0;
        run = dist > 200;
        if (goal) { dx = Math.sign(goal.x - me.x) as -1 | 0 | 1; if (goal.y < me.y - 20 && me.grounded) jump = true; }
        else if (dyw < -28 && me.grounded && t - lastJumpTry > 600 && rng.chance(0.08 * (prm.hunt + 0.2))) { jump = true; lastJumpTry = t; jumpHold = 280; }
        // buraco: bots machucados e pressionados às vezes mergulham nele para fugir (reaparecem no topo); os demais pulam por cima
        const onFloor = me.grounded && me.y >= GROUND - 1;
        if (onFloor && t > holeUntil && me.lives === 1 && dist < 90 && Math.abs(me.x - (HOLE.x0 + HOLE.x1) / 2) < 150 && rng.chance(prm.dodge * 0.03)) holeUntil = t + 1800;
        if (onFloor && t <= holeUntil) { dx = Math.sign((HOLE.x0 + HOLE.x1) / 2 - me.x) as -1 | 0 | 1; run = true; }
        else if (onFloor && dx !== 0) {
          const edge = dx > 0 ? HOLE.x0 - me.x : me.x - HOLE.x1; // distância até a beirada do buraco, no sentido do movimento
          if (edge > 0 && edge <= 9) { run = true; if (me.coyote > 0) { jump = true; jumpHold = 420; } }
          else if (edge > 9 && edge < 30) run = true;
        }
        // mira com compensação de gravidade (e antecipação do movimento nos níveis maiores)
        const flight = Math.min(0.9, Math.abs(dxw) / (me.special === 'fire' ? FIRE_SPEED : ARROW_SPEED));
        const lx = prm.lead ? tp.x + tp.vx * flight * 0.8 : tp.x, ly = tp.y - 7 + (prm.lead ? tp.vy * flight * 0.5 : 0);
        aim = solveAim({ x: me.x, y: me.y - 9 }, { x: lx, y: ly }, me.special === 'fire') + (rng.next() * 2 - 1) * prm.noise;
        // só atira se a linha estiver razoavelmente livre e depois de "reagir"
        if (me.cooldownMs <= 0 && t >= fireAt && dist < 330) {
          let clear = true;
          let reached = false;
          const path = arrowPath(me.x, me.y - 9, aim, me.special === 'fire', 14);
          for (const pt of path) {
            if (STATIC_PLATS.some((pl) => pt.x > pl.x && pt.x < pl.x + pl.w && pt.y > pl.y && pt.y < pl.y + 6) || (pt.y > GROUND && !overHole(pt.x))) { clear = false; break; }
            if (Math.abs(pt.x - tp.x) < 12 && Math.abs(pt.y - (tp.y - 7)) < 14) { reached = true; break; }
          }
          if (clear && !reached && path.length < 14) clear = false; // a flecha morre na borda antes de chegar
          if (clear) { fire = true; fireAt = t + prm.react + rng.int(0, prm.react); }
          else fireAt = t + 120;
        }
      } else dx = 0;
      if (jumpHold > 0) { jumpHold -= dtMs; jump = true; }
      return { dx, jump, run, fire, aim };
    },
  };
}

// ---------------------------------------------------------------- definição
export const dueloArqueiros: MinigameDefinition<ArcherState, ArcherInput> = {
  id: 'duelo-arqueiros',
  name: 'Duelo de Arqueiros',
  category: 'combat',
  mode: 'ffa',
  durationMs: DURATION_MS,
  hudUnit: ' ♥',
  hideHud: true,
  instructions: {
    title: 'Duelo de Arqueiros',
    lines: [
      'Cada um tem 3 vidas. Acerte os outros com flechas, desvie e sobreviva. Você atravessa as laterais da tela, mas as flechas cravam na borda.',
      'Mire com o MOUSE e clique para atirar (ou use F / botão ATIRAR para mira automática). A flecha começa reta e vai caindo.',
      'Pegue power-ups: flecha TRIPLA, FLAMEJANTE, ESCUDO, VIDA e BOTAS. Pule o buraco do centro — ou caia nele para reaparecer lá em cima. Cada abate rende 1 moeda para o tabuleiro, e o ÚLTIMO HIT rende +1 extra!',
    ],
    controls: [
      { keys: 'WASD / Setas', action: 'andar (Shift corre)' },
      { keys: 'Espaço / W', action: 'pular' },
      { keys: 'Mouse / F', action: 'mirar e atirar (F = mira assistida)' },
    ],
    touch: { stick: true, action: 'PULAR', twin: true },
  },
  neutralInput: () => ({ dx: 0, jump: false, run: false, fire: false, aim: 0 }),
  sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { dx, jump, run, fire, aim } = raw as Record<string, unknown>;
    if (!(dx === -1 || dx === 0 || dx === 1) || typeof jump !== 'boolean' || typeof run !== 'boolean' || typeof fire !== 'boolean') return null;
    if (typeof aim !== 'number' || !Number.isFinite(aim)) return null;
    return { dx, jump, run, fire, aim: Math.max(-7, Math.min(7, aim)) };
  },
  createInitialState(seed, players: ParticipantInfo[]) {
    const s: ArcherState = { rng: seed | 0, elapsedMs: 0, nextId: 1, nextPickupMs: 3000, endAtMs: null, order: [], players: {}, arrows: [], pickups: [], slots: [], recentPts: [], lastPickupY: 0, lastPickupType: null, feed: [], lastHit: null };
    // formação inicial: pontos bem afastados, sorteados pela seed (e embaralhados entre os jogadores)
    const starts = [...START_LAYOUTS[Math.floor(nextRandom(s) * START_LAYOUTS.length)]!];
    for (let i = starts.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(s) * (i + 1)); [starts[i], starts[j]] = [starts[j]!, starts[i]!]; }
    for (const p of players) {
      const [x, y] = starts[p.slot]!;
      s.order.push(p.id);
      s.players[p.id] = { slot: p.slot, x, y, vx: 0, vy: 0, facing: x < W / 2 ? 1 : -1, grounded: true, moving: false, coyote: 0, jumpBuf: 0, prevJump: false, aim: x < W / 2 ? 0 : Math.PI, cooldownMs: 600, lives: START_LIVES, alive: true, elimAtMs: 0, invulnMs: 0, shield: false, special: null, charges: 0, bootsMs: 0, kills: 0, hitsDealt: 0, hitsTaken: 0, shots: 0, points: 0, portals: 0, lastHitBy: null };
    }
    SLOT_DEFS.forEach((d, i) => {
      const startHidden = nextRandom(s) < 0.5;
      s.slots.push({ id: i, ...d, phase: startHidden ? 'hidden' : 'solid', t: 0, dur: startHidden ? 1500 + nextRandom(s) * 3500 : 2500 + nextRandom(s) * 3500 });
    });
    return s;
  },
  step(s, inputs, dtMs) {
    if (s.endAtMs !== null && s.elapsedMs >= s.endAtMs) { s.elapsedMs += dtMs; return s; }
    const dt = dtMs / 1000;
    s.elapsedMs += dtMs;
    for (const sl of s.slots) { sl.t += dtMs; if (sl.t >= sl.dur) slotCycle(sl, s); }
    s.nextPickupMs -= dtMs;
    if (s.nextPickupMs <= 0) { s.nextPickupMs = PICKUP_EVERY_MS; if (s.pickups.length < MAX_PICKUPS && !dropPickup(s)) s.nextPickupMs = 800; }
    for (const pk of s.pickups) pk.ttl -= dtMs;
    s.pickups = s.pickups.filter((pk) => pk.ttl > 0);
    const { blocks, plats } = solids(s);

    for (const id of s.order) {
      const p = s.players[id]!;
      if (!p.alive) continue;
      const inp = inputs[id] ?? { dx: 0, jump: false, run: false, fire: false, aim: p.aim };
      p.cooldownMs = Math.max(0, p.cooldownMs - dtMs); p.invulnMs = Math.max(0, p.invulnMs - dtMs); p.bootsMs = Math.max(0, p.bootsMs - dtMs);
      p.aim = inp.aim;
      const boots = p.bootsMs > 0;
      const target = inp.dx * (inp.run ? RUN : WALK) * (boots ? 1.3 : 1);
      const acc = (p.grounded ? 1500 : 800) * dt;
      p.vx += Math.max(-acc, Math.min(acc, target - p.vx));
      p.moving = inp.dx !== 0;
      if (inp.dx !== 0) p.facing = inp.dx;
      // pulo: apertar de novo, com tolerância (coyote + buffer) e altura variável
      const edge = inp.jump && !p.prevJump; p.prevJump = inp.jump;
      p.jumpBuf = edge ? 130 : Math.max(0, p.jumpBuf - dtMs);
      p.coyote = p.grounded ? 90 : Math.max(0, p.coyote - dtMs);
      if (p.jumpBuf > 0 && p.coyote > 0) { p.vy = -JUMP_V * (boots ? 1.1 : 1); p.grounded = false; p.coyote = 0; p.jumpBuf = 0; }
      if (!inp.jump && p.vy < -110) p.vy = -110;
      p.vy += GRAV * dt;

      // horizontal (pilares são sólidos dos lados)
      p.x = wrapX(p.x + p.vx * dt);
      for (const b of blocks) {
        if (p.y > b.y && p.y - HH < b.y + b.h && p.x + HW > b.x && p.x - HW < b.x + b.w) {
          p.x = p.x < b.x + b.w / 2 ? b.x - HW : b.x + b.w + HW; p.vx = 0;
        }
      }
      // dentro do poço do buraco: as paredes seguram dos lados
      if (p.y > GROUND + 1) { const cx = Math.max(HOLE.x0 + HW, Math.min(HOLE.x1 - HW, p.x)); if (cx !== p.x) { p.x = cx; p.vx = 0; } }
      // vertical
      const prevY = p.y;
      p.y += p.vy * dt;
      let landed = false;
      if (p.vy >= 0) {
        if (p.y >= GROUND && prevY <= GROUND + 0.01 && !fallsInHole(p.x)) { p.y = GROUND; landed = true; }
        for (const pl of plats) if (prevY <= pl.y + 0.01 && p.y >= pl.y && p.x + HW > pl.x && p.x - HW < pl.x + pl.w) { p.y = pl.y; landed = true; }
        for (const b of blocks) if (prevY <= b.y + 0.01 && p.y >= b.y && p.x + HW > b.x && p.x - HW < b.x + b.w) { p.y = b.y; landed = true; }
      } else {
        for (const b of blocks) if (p.x + HW > b.x && p.x - HW < b.x + b.w && p.y - HH < b.y + b.h && prevY - HH >= b.y + b.h - 0.01) { p.y = b.y + b.h + HH; p.vy = 0; }
      }
      if (landed) { p.vy = 0; p.grounded = true; } else p.grounded = false;
      // um pilar que aparece em cima de alguém empurra para o lado (nunca esmaga)
      for (const b of blocks) if (p.y > b.y + 1 && p.y - HH < b.y + b.h && p.x + HW > b.x && p.x - HW < b.x + b.w) p.x = p.x < b.x + b.w / 2 ? b.x - HW : b.x + b.w + HW;
      // caiu no buraco: reaparece no topo da tela, caindo no centro (passagem de baixo para cima)
      if (p.y > H + HH + 2) {
        p.x = Math.max(HOLE.x0 + 10, Math.min(HOLE.x1 - 10, p.x)); p.y = -HH - 6; p.vy = 40; p.vx = 0; p.grounded = false; p.coyote = 0; p.jumpBuf = 0;
        p.invulnMs = Math.max(p.invulnMs, PORTAL_INVULN_MS); p.portals++;
      }

      if (inp.fire && p.cooldownMs <= 0) shoot(s, id, p);
    }

    // flechas (4 sub-passos por tick: nada atravessa um arqueiro)
    for (const a of s.arrows) {
      a.ageMs += dtMs;
      if (a.stuckMs > 0) { a.stuckMs -= dtMs; continue; }
      const sub = 4;
      for (let k = 0; k < sub && a.stuckMs <= 0; k++) {
        const h = dt / sub;
        a.vy += ARROW_GRAV * h; a.x += a.vx * h; a.y += a.vy * h;
        // sólidos: chão, plataformas e pilares (flecha flamejante destrói os que não são fixos)
        let stuck = a.y >= GROUND && !overHole(a.x); // sobre o buraco a flecha segue caindo
        if (a.x <= 0 || a.x >= W) { a.x = Math.max(0, Math.min(W, a.x)); stuck = true; } // as flechas não atravessam as laterais
        for (const pl of STATIC_PLATS) if (a.x > pl.x && a.x < pl.x + pl.w && a.y > pl.y && a.y < pl.y + 6) stuck = true;
        for (const sl of s.slots) {
          if (!slotSolid(sl)) continue;
          if (a.x > sl.x && a.x < sl.x + sl.w && a.y > sl.y && a.y < sl.y + sl.h) { stuck = true; if (a.kind === 'fire') { sl.phase = 'hidden'; sl.t = 0; sl.dur = 4000 + nextRandom(s) * 3000; } }
        }
        if (stuck) { a.stuckMs = 450; a.vx = 0; a.vy = 0; break; }
        for (const id of s.order) {
          const v = s.players[id]!;
          if (id === a.owner || !v.alive || a.hit.includes(id)) continue;
          if (Math.abs(a.x - v.x) < HW + 1.5 && a.y > v.y - HH - 1.5 && a.y < v.y + 1.5) {
            a.hit.push(id);
            const res = damage(s, id, v, a.kind === 'fire', a.owner);
            if (res === 'none') { a.hit.pop(); continue; } // invulnerável: a flecha segue em frente
            if (a.kind !== 'fire') { a.stuckMs = 1; a.vx = 0; a.vy = 0; }
            break;
          }
        }
      }
    }
    s.arrows = s.arrows.filter((a) => a.ageMs < ARROW_LIFE_MS && a.y < H + 30 && !(a.stuckMs <= 0 && a.vx === 0 && a.vy === 0));

    // itens
    for (const id of s.order) {
      const p = s.players[id]!;
      if (!p.alive) continue;
      for (const pk of s.pickups) {
        if (pk.ttl <= 0 || Math.abs(pk.x - p.x) > 11 || Math.abs(pk.y - (p.y - 7)) > 13) continue;
        pk.ttl = 0;
        if (pk.type === 'triple' || pk.type === 'fire') { p.special = pk.type; p.charges = SPECIAL_CHARGES; }
        else if (pk.type === 'shield') p.shield = true;
        else if (pk.type === 'life') p.lives = Math.min(MAX_LIVES, p.lives + 1);
        else p.bootsMs = BOOTS_MS;
      }
    }
    s.pickups = s.pickups.filter((pk) => pk.ttl > 0);

    // fim: sobrou um (ou ninguém)
    if (s.endAtMs === null && s.order.filter((id) => s.players[id]!.alive).length <= 1) s.endAtMs = s.elapsedMs + END_DELAY_MS;
    return s;
  },
  isFinished: (s) => s.elapsedMs >= DURATION_MS || (s.endAtMs !== null && s.elapsedMs >= s.endAtMs),
  computeResult(s) {
    // vivos: mais vidas é melhor; eliminados: quem caiu mais tarde é melhor; iguais empatam (dividem a colocação).
    // Abates, acertos e o ÚLTIMO HIT NÃO mudam a colocação (nem desfazem empates): só rendem o bônus de moeda do último hit.
    const scored = s.order.map((id) => { const p = s.players[id]!; return { playerId: id, score: p.alive ? 100000 + p.lives * 100 : Math.round(p.elimAtMs / 10) }; }).sort((a, b) => b.score - a.score);
    let rank = 1;
    const bonus: Record<PlayerId, number> = {};
    for (const id of s.order) if (s.players[id]!.points > 0) bonus[id] = s.players[id]!.points; // moedas: abates + último hit
    const details: Record<PlayerId, string> = {}, kills: Record<PlayerId, number> = {};
    for (const id of s.order) {
      const p = s.players[id]!;
      kills[id] = p.kills;
      const acc = p.shots > 0 ? Math.round((100 * p.hitsDealt) / p.shots) : 0;
      details[id] = `${p.kills} ${p.kills === 1 ? 'abate' : 'abates'} · ${p.hitsDealt} ${p.hitsDealt === 1 ? 'acerto' : 'acertos'} (${acc}%) · ${p.points > 0 ? `+${p.points} ${p.points === 1 ? 'moeda' : 'moedas'} de bônus` : 'sem bônus'}${s.lastHit?.by === id ? ' · ÚLTIMO HIT' : ''}`;
    }
    return { kind: 'ranking', ranking: scored.map((e, i) => { if (i > 0 && e.score < scored[i - 1]!.score) rank = i + 1; return { playerId: e.playerId, rank, score: e.score }; }), bonus, details, kills };
  },
  formatScore(score) {
    if (score >= 100000) { const v = Math.round((score - 100000) / 100); return `${v} ${v === 1 ? 'vida' : 'vidas'}`; }
    return `eliminado aos ${(score / 100).toFixed(1).replace('.', ',')} s`;
  },
  timeLeftMs: (s) => Math.max(0, DURATION_MS - s.elapsedMs),
  liveScores(s) {
    const out: Record<PlayerId, number> = {};
    for (const id of s.order) out[id] = s.players[id]!.lives;
    return out;
  },
  publicState: (s) => ({ ...s, rng: 0 }),
  createBot: createBrain,
};
