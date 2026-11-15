import type Phaser from 'phaser';
import { canvasTex } from './textures';
import { CX, CY, FX0, FX1, FY0, FY1, GOAL_DEPTH, GOAL_H, PR, BR } from '@shared/minigames/futebol-botao';

export const TEAM_COLORS = ['#3f8bff', '#ff4d4d'] as const;
export const TEAM_DARK = ['#1b3f8a', '#8a1b24'] as const;
export const TEAM_LIGHT = ['#9ccbff', '#ffb0a8'] as const;

const rect = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
}
function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let a = 0; a < Math.PI * 2; a += 0.5 / r) ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
}

/** Texturas do Futebol de Botão: campo (grama listrada, marcações, gols com rede), peças, bola e goleiros. */
export function buildFutebolArt(scene: Phaser.Scene) {
  // CAMPO inteiro (480x270): arquibancada escura em volta, gramado listrado, linhas brancas, gols com rede
  canvasTex(scene, 'fb-field', 480, 270, (ctx) => {
    rect(ctx, '#1a1240', 0, 0, 480, 270);
    // arquibancada: público discreto nas laterais; faixas de cima e de baixo são painéis lisos para o HUD
    for (let y = 44; y < 232; y += 6) for (let x = 0; x < 480; x += 5) {
      if (x > FX0 - 24 && x < FX1 + 24) continue;
      const c = ['#3b2a78', '#7a3a5a', '#7a6a2a', '#2f5a8a', '#2f6a4a'][(x * 7 + y * 3) % 5]!;
      rect(ctx, c, x + (y % 12 === 0 ? 0 : 2), y, 2, 2);
    }
    rect(ctx, '#120a2e', 0, 0, 480, 44); rect(ctx, '#3a2c78', 0, 43, 480, 1);
    rect(ctx, '#120a2e', 0, 232, 480, 38); rect(ctx, '#3a2c78', 0, 232, 480, 1);
    // moldura do gramado
    rect(ctx, '#1b1030', FX0 - 8, FY0 - 6, FX1 - FX0 + 16, FY1 - FY0 + 12);
    // grama listrada
    for (let i = 0; i < 17; i++) {
      const x = FX0 + i * 24;
      rect(ctx, i % 2 ? '#3f9a45' : '#4fae4c', x, FY0, Math.min(24, FX1 - x), FY1 - FY0);
    }
    // textura de grama (pontinhos)
    for (let y = FY0; y < FY1; y += 6) for (let x = FX0; x < FX1; x += 7) { if (((x * 13 + y * 7) % 5) === 0) rect(ctx, '#58bd55', x + (y % 12 === 0 ? 2 : 0), y, 1, 1); }
    const W = '#f4efe0';
    // linhas de fora, meio e círculo central
    rect(ctx, W, FX0, FY0, FX1 - FX0, 1); rect(ctx, W, FX0, FY1 - 1, FX1 - FX0, 1);
    rect(ctx, W, FX0, FY0, 1, FY1 - FY0); rect(ctx, W, FX1 - 1, FY0, 1, FY1 - FY0);
    rect(ctx, W, CX, FY0, 1, FY1 - FY0);
    ring(ctx, CX, CY, 26, W); disc(ctx, CX, CY, 2, W);
    // áreas (grande e pequena) dos dois lados
    for (const side of [0, 1]) {
      const sx = side === 0 ? FX0 : FX1 - 1;
      const dir = side === 0 ? 1 : -1;
      const big = (x0: number, w: number, h: number) => {
        const x = dir > 0 ? sx : sx - w;
        rect(ctx, W, x, CY - h / 2, w, 1); rect(ctx, W, x, CY + h / 2, w, 1);
        rect(ctx, W, dir > 0 ? sx + w : sx - w, CY - h / 2, 1, h + 1);
        void x0;
      };
      big(0, 54, 120); big(0, 24, GOAL_H + 16);
      disc(ctx, sx + dir * 40, CY, 1, W);
    }
    // gols: rede atrás da linha, traves brancas
    for (const side of [0, 1]) {
      const x0 = side === 0 ? FX0 - GOAL_DEPTH : FX1;
      rect(ctx, '#0e0820', x0, CY - GOAL_H / 2, GOAL_DEPTH, GOAL_H);
      for (let y = CY - GOAL_H / 2; y < CY + GOAL_H / 2; y += 4) rect(ctx, '#9a97ad', x0, y, GOAL_DEPTH, 1);
      for (let x = x0; x < x0 + GOAL_DEPTH; x += 4) rect(ctx, '#9a97ad', x, CY - GOAL_H / 2, 1, GOAL_H);
      rect(ctx, '#f4efe0', x0, CY - GOAL_H / 2 - 1, GOAL_DEPTH, 2); rect(ctx, '#f4efe0', x0, CY + GOAL_H / 2 - 1, GOAL_DEPTH, 2);
      rect(ctx, '#f4efe0', side === 0 ? x0 : x0 + GOAL_DEPTH - 2, CY - GOAL_H / 2, 2, GOAL_H);
      // traves (quadradinhos nos cantos)
      const gx = side === 0 ? FX0 : FX1;
      for (const y of [CY - GOAL_H / 2, CY + GOAL_H / 2]) { disc(ctx, gx, y, 2, '#ffffff'); disc(ctx, gx, y, 1, '#c8c6d8'); }
    }
  });

  // PEÇAS (botões): azul com listra horizontal e anel branco; vermelha com losango e anel branco
  for (const t of [0, 1]) {
    canvasTex(scene, `fb-piece-${t}`, 22, 22, (ctx) => {
      disc(ctx, 11, 11, PR + 1, '#1b1030');
      disc(ctx, 11, 11, PR, '#f4efe0');
      disc(ctx, 11, 11, PR - 2, TEAM_COLORS[t]!);
      disc(ctx, 11, 12, PR - 3, TEAM_DARK[t]!); // sombra embaixo
      disc(ctx, 11, 11, PR - 3, TEAM_COLORS[t]!);
      if (t === 0) { rect(ctx, '#f4efe0', 5, 10, 12, 2); } else { rect(ctx, '#f4efe0', 10, 5, 2, 12); rect(ctx, '#f4efe0', 5, 10, 12, 2); }
      rect(ctx, TEAM_LIGHT[t]!, 6, 6, 3, 1); rect(ctx, TEAM_LIGHT[t]!, 5, 7, 1, 2); // brilho
    });
  }
  canvasTex(scene, 'fb-shadow', 24, 24, (ctx) => { ctx.globalAlpha = 0.35; disc(ctx, 12, 13, PR, '#000000'); ctx.globalAlpha = 1; });
  canvasTex(scene, 'fb-ring', 28, 28, (ctx) => { ring(ctx, 14, 14, 12, '#ffffff'); ring(ctx, 14, 14, 13, '#ffffff'); });

  // BOLA 10x10 (gomos escuros: dá para ver que gira)
  canvasTex(scene, 'fb-ball', 12, 12, (ctx) => {
    disc(ctx, 6, 6, BR + 1, '#1b1030');
    disc(ctx, 6, 6, BR, '#ffffff');
    rect(ctx, '#1b1030', 5, 4, 2, 2); rect(ctx, '#1b1030', 3, 7, 2, 1); rect(ctx, '#1b1030', 8, 7, 1, 1); rect(ctx, '#1b1030', 7, 2, 1, 1);
    rect(ctx, '#c8c6d8', 4, 8, 4, 1);
  });
  canvasTex(scene, 'fb-ballshadow', 12, 12, (ctx) => { ctx.globalAlpha = 0.3; disc(ctx, 6, 7, BR, '#000000'); ctx.globalAlpha = 1; });

  // GOLEIROS (vistos de cima): corpo na cor do time, luvas amarelas, cabeça clara
  for (const t of [0, 1]) {
    canvasTex(scene, `fb-keeper-${t}`, 10, 22, (ctx) => {
      rect(ctx, '#1b1030', 1, 3, 8, 16);
      rect(ctx, TEAM_COLORS[t]!, 2, 4, 6, 14);
      rect(ctx, TEAM_LIGHT[t]!, 2, 4, 6, 2);
      rect(ctx, '#ffd23f', 0, 1, 3, 3); rect(ctx, '#ffd23f', 7, 1, 3, 3); rect(ctx, '#ffd23f', 0, 18, 3, 3); rect(ctx, '#ffd23f', 7, 18, 3, 3); // luvas
      rect(ctx, '#f2c9a0', 3, 9, 4, 4); rect(ctx, '#1b1030', 3, 9, 4, 1);
    });
  }
  // botão FORÇA
  canvasTex(scene, 'fb-spark', 3, 3, (ctx) => { rect(ctx, '#ffffff', 1, 0, 1, 3); rect(ctx, '#ffffff', 0, 1, 3, 1); });
}
