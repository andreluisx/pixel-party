import type { BoardDef, Region, TileDef, TileType } from '../types';

type Row = [id: string, x: number, y: number, type: TileType, region: Region];

const RING: Row[] = [
  ['R00', 400, 80, 'blue', 'castelo'], ['R01', 450, 80, 'blue', 'castelo'], ['R02', 500, 90, 'event', 'castelo'],
  ['R03', 550, 110, 'star', 'castelo'], ['R04', 600, 140, 'blue', 'floresta'], ['R05', 650, 180, 'minigame', 'floresta'],
  ['R06', 690, 230, 'red', 'floresta'], ['R07', 700, 290, 'shop', 'vila'], ['R08', 690, 350, 'blue', 'ponte'],
  ['R09', 660, 410, 'treasure', 'porto'], ['R10', 610, 450, 'red', 'porto'], ['R11', 550, 480, 'teleport', 'lago'],
  ['R12', 490, 495, 'blue', 'lago'], ['R13', 430, 500, 'minigame', 'lago'], ['R14', 370, 500, 'event', 'lago'],
  ['R15', 310, 495, 'blue', 'vila'], ['R16', 250, 480, 'star', 'vila'], ['R17', 190, 450, 'red', 'vila'],
  ['R18', 140, 410, 'blue', 'floresta'], ['R19', 110, 350, 'shop', 'floresta'], ['R20', 100, 290, 'event', 'floresta'],
  ['R21', 110, 230, 'blue', 'floresta'], ['R22', 150, 180, 'minigame', 'castelo'], ['R23', 200, 140, 'red', 'castelo'],
  ['R24', 250, 110, 'trap', 'castelo'], ['R25', 300, 90, 'event', 'castelo'], ['R26', 350, 80, 'event', 'castelo'],
];
const INNER: Row[] = [
  ['A1', 205, 215, 'blue', 'floresta'], ['A2', 260, 250, 'red', 'ponte'], ['A3', 320, 280, 'treasure', 'vila'],
  ['J0', 400, 290, 'duel', 'castelo'],
  ['B1', 480, 280, 'blue', 'lago'], ['B2', 540, 250, 'event', 'lago'], ['B3', 600, 215, 'blue', 'floresta'],
  ['N1', 400, 200, 'star', 'castelo'], ['N2', 400, 140, 'blue', 'castelo'],
  ['S1', 400, 360, 'minigame', 'vila'], ['S2', 400, 430, 'red', 'vila'],
  ['L1', 200, 360, 'teleport', 'floresta'], ['L2', 300, 370, 'shop', 'vila'],
];

const edges: Array<[string, string]> = [];
for (let i = 0; i < RING.length; i++) edges.push([RING[i]![0], RING[(i + 1) % RING.length]![0]]);
const chain = (...ids: string[]) => { for (let i = 0; i < ids.length - 1; i++) edges.push([ids[i]!, ids[i + 1]!]); };
chain('R22', 'A1', 'A2', 'A3', 'J0');
chain('R05', 'B3', 'B2', 'B1', 'J0');
chain('J0', 'N1', 'N2', 'R00');
chain('J0', 'S1', 'S2', 'R14');
chain('R19', 'L1', 'L2', 'S1');

const tiles: TileDef[] = [...RING, ...INNER].map(([id, x, y, type, region]) => ({
  id, x, y, type, region, next: edges.filter((e) => e[0] === id).map((e) => e[1]), ...(id === 'R00' ? { start: true } : {}),
}));

export const REINO_DO_CASTELO: BoardDef = {
  id: 'reino-do-castelo',
  name: 'Reino do Castelo',
  world: { w: 800, h: 560 },
  tiles,
  bridges: [['R08', 'R09'], ['A2', 'A3']],
  starSpots: ['R03', 'R16', 'N1'],
};
