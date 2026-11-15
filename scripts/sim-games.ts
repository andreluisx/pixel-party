// Simulação em massa só com bots: npm run sim:games -- 200 [--fake]
import { playFullGame } from '../shared/game/sim';
const n = Number(process.argv[2]) || 100; const fake = process.argv.includes('--fake');
const stars: number[] = []; const winners: Record<string, number> = {}; const awardWinners: Record<string, number> = {}; let ties = 0; const t0 = Date.now();
for (let seed = 1; seed <= n; seed++) {
  const { state: s } = playFullGame(seed, { fakeMinigames: fake });
  stars.push(s.players.reduce((a, p) => a + p.stars, 0));
  const w = s.final![0]!; winners[s.players.find((p) => p.id === w.pid)!.personality!] = (winners[s.players.find((p) => p.id === w.pid)!.personality!] ?? 0) + 1;
  for (const a of s.awards!) { if (a.winner) awardWinners[a.id] = (awardWinners[a.id] ?? 0) + 1; if (a.tieNote) ties++; }
  if (s.final!.filter((x) => x.rank === 1).length > 1) console.log('empate total no 1º lugar, seed', seed);
}
console.log(`${n} partidas em ${((Date.now() - t0) / 1000).toFixed(1)}s | estrelas/partida: ${(stars.reduce((a, b) => a + b, 0) / n).toFixed(1)} | vitórias por personalidade:`, winners, '| prêmios entregues:', awardWinners, '| prêmios com empate:', ties);
