import { describe, expect, it } from 'vitest';
import { buildBoard, validateBoard } from '../shared/board/board';
import { REINO_DO_CASTELO } from '../shared/board/maps/reino-do-castelo';

const b = buildBoard(REINO_DO_CASTELO);
describe('Reino do Castelo', () => {
  it('é válido e conectado', () => expect(validateBoard(b)).toEqual([]));
  it('tem 40 casas e contagem por tipo', () => {
    expect(REINO_DO_CASTELO.tiles).toHaveLength(40);
    const c: Record<string, number> = {};
    for (const t of REINO_DO_CASTELO.tiles) c[t.type] = (c[t.type] ?? 0) + 1;
    expect(c).toEqual({ blue: 12, red: 6, event: 6, minigame: 4, shop: 3, star: 3, treasure: 2, trap: 1, teleport: 2, duel: 1 });
  });
  it('tem bifurcações', () => {
    const forks = Object.keys(b.adj).filter((k) => b.adj[k]!.length > 2);
    expect(forks.sort()).toEqual(['J0', 'R00', 'R05', 'R14', 'R19', 'R22', 'S1']);
    expect(b.adj.J0).toHaveLength(4);
  });
  it('altares ficam afastados entre si', () => {
    for (const a of REINO_DO_CASTELO.starSpots) for (const c of REINO_DO_CASTELO.starSpots) if (a !== c) expect(b.dist(a, c)).toBeGreaterThanOrEqual(4);
  });
});
