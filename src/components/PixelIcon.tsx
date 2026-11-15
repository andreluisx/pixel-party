// Ícones em pixel art (mapas de pixels → SVG). Substituem emojis, que dependem da fonte do aparelho.
const COL: Record<string, string> = {
  o: '#1b1030', Y: '#ffd84a', y: '#c9902a', w: '#fff6d8', r: '#e0453a', R: '#d63a3a', B: '#4a8fe0', b: '#2d5fa8',
  G: '#c8a070', g: '#c9c9d6', P: '#f2a0c0', p: '#c76a95', k: '#1b1030', W: '#f5e6c8', V: '#9a6fe0', L: '#7be0a0',
};

const MAPS = {
  moedas: ['..oooo..', '.oYYwYo.', 'oYYwYYyo', 'oYwYYYyo', 'oYwYYYyo', 'oYYYYyyo', '.oYyyyo.', '..oooo..'],
  cacador: ['..oooo..', '.orrrro.', 'orwwwwro', 'orwrrwro', 'orwrrwro', 'orwwwwro', '.orrrro.', '..oooo..'],
  campeao: ['.oooooo.', 'oYYwYYYo', 'oYYwYYYo', '.oYYYYo.', '..oYYo..', '...oYo..', '..oYYyo.', '.oooooo.'],
  explorador: ['.ooo....', 'oGGGo...', 'oGGGo...', 'oGGGo...', '.ooo.ooo', '...oGGGo', '...oGGGo', '....ooo.'],
  estrategista: ['..oooo..', '.oPPpPo.', 'oPpPPpPo', 'oPPpPPPo', 'oPpPPpPo', '.oPPpPo.', '..oPPo..', '...oo...'],
  empate: ['...oo...', 'oooggooo', 'og.gg.go', 'og.gg.go', 'oyyoogyo', 'oyyo.oyo', '..oggo..', '.oooooo.'],
  cogumelo: ['..oooo..', '.orrwro.', 'orrwrrro', 'orwwrrwo', 'oooWWooo', '..oWWo..', '..oWWo..', '...oo...'],
  ima: ['.oooooo.', 'orRRRRro', 'oRRooRRo', 'oRRooRRo', 'oBBooBBo', 'owwoowwo', 'owwoowwo', '.oo..oo.'],
  pocao: ['..oooo..', '...ww...', '...oo...', '..oVVo..', '.oVVVVo.', 'oVwVVVVo', 'oVVVVVVo', '.oooooo.'],
  escudo: ['oooooooo', 'oBBBwBBo', 'oBBBwBBo', 'oBwwwwBo', '.oBBwBo.', '.oBBBbo.', '..oBbo..', '...oo...'],
  dado: ['oooooooo', 'owwwwwwo', 'owkwwwko', 'owwwwwwo', 'owwwkwwo', 'owwwwwwo', 'owkwwwko', 'oooooooo'],
  som: ['....o...', '...oo.o.', 'oooo.o.o', 'owoo.o.o', 'owoo.o.o', 'oooo.o.o', '...oo.o.', '....o...'],
  mudo: ['....o...', '...oo...', 'oooo.r.r', 'owoo..r.', 'owoo..r.', 'oooo.r.r', '...oo...', '....o...'],
  estrela: ['...oo...', '...yy...', 'ooyYYyoo', 'oyYYYYyo', '.oyYYyo.', '.oyYYyo.', '.oyo.yo.', '..o..o..'],
} as const;

export const ICON_MAPS = MAPS;
export const ICON_COL = COL;
export type IconName = keyof typeof MAPS;
export const isIcon = (n: string): n is IconName => n in MAPS;

export function PixelIcon({ name, size = '1.15em', title }: { name: IconName; size?: string; title?: string }) {
  const rows = MAPS[name];
  const rects: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const c = row[x];
      if (!c || c === '.') continue;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COL[c] ?? '#fff'} />);
    }
  });
  return (
    <svg className="pxicon" viewBox="0 0 8 8" width={size} height={size} shapeRendering="crispEdges" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {rects}
    </svg>
  );
}
