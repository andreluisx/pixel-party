// PRNG determinístico (mulberry32). O estado é um número, então cabe no estado do minigame.
export function nextRandom(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
}

export function createRng(seed: number): Rng {
  const s = { rng: seed | 0 };
  return {
    next: () => nextRandom(s),
    int: (min, max) => Math.floor(nextRandom(s) * (max - min + 1)) + min,
    chance: (p) => nextRandom(s) < p,
  };
}
