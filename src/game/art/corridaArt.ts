import type Phaser from 'phaser';
import { canvasTex } from './textures';

type Map = Record<string, string>;
function px(ctx: CanvasRenderingContext2D, rows: string[], colors: Map) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = colors[row[x]!];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
}
const rect = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

/** Texturas das mecânicas novas da Corrida Maluca (barra, lama, seta, caixa "?", barril, placa, escudo). */
export function buildCorridaArt(scene: Phaser.Scene) {
  // TÚNEL BAIXO: muro de pedra do céu até 9 px do chão. Só passa abaixado; tem seta amarela e borda listrada.
  canvasTex(scene, 'cm-wall', 16, 16, (ctx) => {
    rect(ctx, '#6d6a86', 0, 0, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      rect(ctx, '#4a4766', 0, y + 3, 16, 1);
      const off = (y / 4) % 2 ? 4 : 0;
      for (let x = off; x < 16 + 8; x += 8) rect(ctx, '#4a4766', x % 16, y, 1, 3);
      rect(ctx, '#8f8cab', 1, y, 6, 1);
    }
  });
  canvasTex(scene, 'cm-lip', 20, 4, (ctx) => {
    rect(ctx, '#1b1030', 0, 0, 20, 4);
    for (let x = 0; x < 20; x += 5) { rect(ctx, '#ffd23f', x + 1, 1, 3, 2); }
  });
  canvasTex(scene, 'cm-tunnel', 20, 9, (ctx) => {
    rect(ctx, '#120a26', 0, 0, 20, 9);
    rect(ctx, '#1d1240', 0, 6, 20, 3);
    rect(ctx, '#2b1d57', 2, 0, 16, 1);
  });
  canvasTex(scene, 'cm-wallarrow', 11, 13, (ctx) => {
    px(ctx, [
      '.ooooooooo.',
      'oYYYYYYYYYo',
      'oYYYddYYYYo'.replace('ddY', 'ddY'),
      'oYYYddYYYYo',
      'oYYYddYYYYo',
      'oYYYddYYYYo',
      'oYddddddYYo',
      'oYYddddYYYo',
      'oYYYddYYYYo',
      'oYYYYYYYYYo',
      '.ooooooooo.',
    ].map((r) => r.padEnd(11, '.')), { o: '#1b1030', Y: '#ffd23f', d: '#1b1030' });
  });
  const board = (key: string, fill: string, up: boolean) => canvasTex(scene, key, 18, 24, (ctx) => {
    rect(ctx, '#1b1030', 1, 0, 16, 18); rect(ctx, '#1b1030', 0, 1, 18, 16);
    rect(ctx, fill, 2, 1, 14, 16); rect(ctx, '#ffffff', 2, 1, 14, 1); rect(ctx, '#ffffff', 2, 16, 14, 1);
    rect(ctx, '#6a5a8a', 8, 18, 2, 6);
    // seta grande
    const rows = ['....ww....', '...wwww...', '..wwwwww..', '.wwwwwwww.', '....ww....', '....ww....', '....ww....', '....ww....'];
    const arrow = up ? rows : [...rows].reverse();
    arrow.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === 'w') { ctx.fillStyle = '#ffffff'; ctx.fillRect(4 + x, 4 + y, 1, 1); } });
  });
  board('cm-signduck', '#ff7a2e', false);
  board('cm-signjump', '#2f7bff', true);

  // pássaro (2 quadros, voa para a esquerda): corpo vermelho, olho bravo, bico amarelo
  canvasTex(scene, 'cm-bird', 32, 10, (ctx) => {
    const wingUp = [
      '..rr..........',
      '.rrrr.........',
      '..rrrrrrrr....',
      'yyrrrrrrrrrrr.',
      'yywrrrrrrrrr..',
      '...rrrrrrrr...',
      '....rrr.rr....',
    ];
    const wingDown = [
      '..............',
      '..............',
      '..rrrrrrrr....',
      'yyrrrrrrrrrrr.',
      'yywrrrrrrrrr..',
      '..rrrrrrrrrr..',
      '.rrrr.rrrrr...',
      '.rr....rr.....',
    ];
    const cols = { r: '#e8433a', y: '#ffd23f', w: '#ffffff' };
    const draw = (rows: string[], ox: number) => rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = cols[row[x] as 'r']; if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x, y + 1, 1, 1); } } });
    draw(wingUp, 1); draw(wingDown, 17);
    ctx.fillStyle = '#1b1030'; ctx.fillRect(3, 5, 1, 1); ctx.fillRect(19, 5, 1, 1);
  }, { w: 16, count: 2 });

  // lama
  canvasTex(scene, 'cm-mud', 16, 10, (ctx) => {
    rect(ctx, '#6b4423', 0, 0, 16, 10);
    rect(ctx, '#8a5a30', 0, 0, 16, 2);
    rect(ctx, '#4a2e17', 0, 7, 16, 3);
    px(ctx, ['..b.....b....b..', '.......b........'], { b: '#a8743f' });
    px(ctx, ['................', '................', '....b.......b...', '...bBb.....bBb..'], { b: '#3a2410', B: '#a8743f' });
  });

  // seta de impulso (no chão)
  canvasTex(scene, 'cm-pad', 20, 4, (ctx) => {
    rect(ctx, '#1b1030', 0, 0, 20, 4);
    rect(ctx, '#ffe08a', 1, 1, 18, 2);
    for (let i = 0; i < 3; i++) { const x = 3 + i * 5; rect(ctx, '#d1481a', x, 1, 1, 2); rect(ctx, '#d1481a', x + 1, 0, 1, 1); rect(ctx, '#d1481a', x + 1, 3, 1, 1); rect(ctx, '#d1481a', x + 2, 1, 1, 2); }
  });
  canvasTex(scene, 'cm-padglow', 20, 10, (ctx) => { for (let i = 0; i < 4; i++) { ctx.globalAlpha = 0.18 + i * 0.07; rect(ctx, '#ffe08a', 3 + i, 9 - i * 2 - 1, 14 - i * 2, 2); } ctx.globalAlpha = 1; });

  // caixa "?"
  canvasTex(scene, 'cm-box', 11, 11, (ctx) => {
    px(ctx, [
      'ooooooooooo',
      'oYYYYYYYYYo',
      'oYwwwwwwwYo',
      'oYwpppppwYo',
      'oYwwwwppwYo',
      'oYwwwpppwYo',
      'oYwwwpwwwYo',
      'oYwwwwwwwYo',
      'oYwwwpwwwYo',
      'oYYYYYYYYYo',
      'ooooooooooo',
    ], { o: '#1b1030', Y: '#ffb02e', w: '#ffe9a0', p: '#7a2fd1' });
  });

  // barril (ataque de um rival)
  canvasTex(scene, 'cm-barrel', 12, 13, (ctx) => {
    px(ctx, [
      '..oooooooo..',
      '.oddddddddo.',
      'oBBBBBBBBBBo',
      'oddddddddddo',
      'oddddddddddo',
      'oRRRRRRRRRRo',
      'oddddddddddo',
      'oddddddddddo',
      'oRRRRRRRRRRo',
      'oddddddddddo',
      'oddddddddddo',
      'oBBBBBBBBBBo',
      '.oooooooooo.',
    ], { o: '#1b1030', d: '#9a5a2b', B: '#c98a4a', R: '#d1481a' });
    rect(ctx, '#ff4a4a', 4, 4, 4, 1);
  });

  // placa de aviso vermelha (barril / pássaro vindo)
  canvasTex(scene, 'cm-signwarn', 14, 15, (ctx) => {
    px(ctx, [
      '......oo......',
      '.....oRRo.....',
      '....oRRRRo....',
      '...oRRwwRRo...',
      '..oRRRwwRRRo..',
      '..oRRRwwRRRo..',
      '.oRRRRwwRRRRo.',
      '.oRRRRwwRRRRo.',
      'oRRRRRwwRRRRRo',
      'oRRRRRRRRRRRRo',
      'oRRRRRwwRRRRRo',
      'oooooooooooooo',
      '......pp......',
      '......pp......',
      '......pp......',
    ], { o: '#1b1030', R: '#ff4a4a', w: '#ffffff', p: '#6a5a8a' });
  });

  // escudo (bolha) e linha de velocidade
  canvasTex(scene, 'cm-shield', 20, 24, (ctx) => {
    ctx.strokeStyle = '#8fe8ff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.ellipse(10, 12, 9, 11, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#8fe8ff'; ctx.fill();
    ctx.globalAlpha = 0.9; rect(ctx, '#ffffff', 4, 5, 2, 1); rect(ctx, '#ffffff', 3, 6, 1, 2);
    ctx.globalAlpha = 1;
  });
  canvasTex(scene, 'cm-streak', 10, 1, (ctx) => { ctx.globalAlpha = 0.9; rect(ctx, '#ffffff', 2, 0, 8, 1); ctx.globalAlpha = 0.4; rect(ctx, '#ffffff', 0, 0, 2, 1); ctx.globalAlpha = 1; });
}
