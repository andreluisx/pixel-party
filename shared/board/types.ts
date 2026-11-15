/** Tipos de casa (cada um tem ícone, forma e cor próprios: nunca só cor). */
export type TileType = 'blue' | 'red' | 'minigame' | 'event' | 'shop' | 'star' | 'duel' | 'teleport' | 'treasure' | 'trap';
export type Region = 'castelo' | 'floresta' | 'vila' | 'lago' | 'ponte' | 'porto';

export interface TileDef {
  id: string;
  x: number; y: number; // coordenadas no mundo (px)
  type: TileType;
  region: Region;
  next: string[]; // casas conectadas (o grafo é não-direcionado: o carregador espelha as duas pontas)
  start?: boolean;
  /** Efeito de dados: o motor lê daqui em vez de ifs espalhados. */
  effect?: { coins?: number };
}

export interface BoardDef {
  id: string;
  name: string;
  world: { w: number; h: number };
  tiles: TileDef[];
  /** Arestas desenhadas como ponte (par de ids). */
  bridges: ReadonlyArray<readonly [string, string]>;
  /** Altares onde a estrela pode ficar. */
  starSpots: string[];
}

export interface Board {
  def: BoardDef;
  byId: Record<string, TileDef>;
  adj: Record<string, string[]>;
  /** menor número de passos entre duas casas */
  dist(a: string, b: string): number;
}
