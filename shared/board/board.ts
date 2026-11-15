import type { Board, BoardDef } from './types';

/** Constrói o grafo (espelhando as conexões) e uma tabela de distâncias por BFS. */
export function buildBoard(def: BoardDef): Board {
  const byId: Board['byId'] = {};
  const adj: Board['adj'] = {};
  for (const t of def.tiles) { byId[t.id] = t; adj[t.id] = []; }
  for (const t of def.tiles) for (const n of t.next) {
    if (!byId[n]) throw new Error(`Casa ${t.id} liga em ${n}, que não existe`);
    if (!adj[t.id]!.includes(n)) adj[t.id]!.push(n);
    if (!adj[n]!.includes(t.id)) adj[n]!.push(t.id);
  }
  const cache = new Map<string, Record<string, number>>();
  const from = (a: string) => {
    let d = cache.get(a);
    if (d) return d;
    d = { [a]: 0 };
    const q = [a];
    for (let i = 0; i < q.length; i++) for (const n of adj[q[i]!]!) if (d[n] === undefined) { d[n] = d[q[i]!]! + 1; q.push(n); }
    cache.set(a, d);
    return d;
  };
  return { def, byId, adj, dist: (a, b) => from(a)[b] ?? Infinity };
}

/** Validações do mapa (usadas nos testes): ids únicos, conectado, tamanho, tipos, altares. */
export function validateBoard(b: Board): string[] {
  const errs: string[] = [];
  const ids = b.def.tiles.map((t) => t.id);
  if (new Set(ids).size !== ids.length) errs.push('ids repetidos');
  const start = b.def.tiles.filter((t) => t.start);
  if (start.length !== 1) errs.push('precisa de exatamente uma casa inicial');
  if (start[0]) for (const t of b.def.tiles) if (b.dist(start[0].id, t.id) === Infinity) errs.push(`${t.id} inalcançável`);
  for (const s of b.def.starSpots) if (b.byId[s]?.type !== 'star') errs.push(`altar ${s} não é casa de estrela`);
  for (const [x, y] of b.def.bridges) if (!b.adj[x]?.includes(y)) errs.push(`ponte ${x}-${y} sem conexão`);
  for (const t of b.def.tiles) if ((b.adj[t.id]?.length ?? 0) < 2) errs.push(`${t.id} é beco sem saída`);
  return errs;
}
