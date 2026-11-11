// Teste de fumaça de ponta a ponta contra o servidor REAL (npm run dev:server antes).
import { io } from 'socket.io-client';
const URL = process.env.URL ?? 'http://localhost:3001';
const fail = (m: string): never => { console.error('FALHOU:', m); process.exit(1); };
const ok = (m: string) => console.log('ok  -', m);

const a = io(URL), b = io(URL), c = io(URL);
const emit = <T>(s: typeof a, ev: string, payload: unknown) => new Promise<T>((res) => (s as any).emit(ev, payload, res));

(async () => {
  const r1: any = await emit(a, 'lab:create', { name: 'Ana', minigameId: 'pipeline-test', difficulty: 'hard' });
  if (!r1.ok) fail('create');
  const code = r1.lobby.code;
  ok(`sala criada ${code}, 4 slots, ${r1.lobby.participants.filter((p: any) => p.isBot).length} bots`);
  const bad: any = await emit(b, 'lab:join', { code: 'ZZZZZ', name: 'X' });
  if (bad.ok) fail('código inválido deveria falhar'); ok('código inválido rejeitado: ' + bad.error);
  const r2: any = await emit(b, 'lab:join', { code, name: 'Beto' });
  if (!r2.ok) fail('join');
  ok(`segundo humano entrou no slot ${r2.lobby.participants.find((p: any) => p.id === r2.you).slot}; bots restantes: ${r2.lobby.participants.filter((p: any) => p.isBot).length}`);

  let snaps = 0, rewardsMsgs = 0, countdown: number[] = [];
  let result: any = null, lastScores: any = null;
  a.on('mg:snapshot', (s) => { snaps++; lastScores = s.scores; });
  a.on('mg:countdown', (n) => countdown.push(n));
  a.on('mg:result', (r) => { rewardsMsgs++; result = r; });
  // jogador b manda inputs válidos e inválidos
  let seq = 0;
  b.emit('mg:input', { seq: seq++, input: { dx: 9, dy: 0 } }); // inválido: ignorado
  a.emit('lab:start'); // host
  b.emit('lab:start'); // não-host: ignorado
  await new Promise((r) => setTimeout(r, 5200));
  const late: any = await emit(c, 'lab:join', { code, name: 'Tarde' });
  if (late.ok) fail('entrada no meio da partida deveria falhar'); ok('entrada durante partida rejeitada: ' + late.error);
  const iv = setInterval(() => b.emit('mg:input', { seq: seq++, input: { dx: 1, dy: 0 } }), 100);
  await new Promise((r) => setTimeout(r, 3000));
  b.disconnect(); // queda no meio: bot assume
  ok('humano desconectou durante a partida (bot assume)');
  clearInterval(iv);
  await new Promise<void>((res) => { const t = setInterval(() => { if (result) { clearInterval(t); res(); } }, 200); setTimeout(() => res(), 30000); });
  if (!result) fail('sem resultado');
  if (countdown.join() !== '3,2,1,0') fail('contagem: ' + countdown.join());
  ok(`contagem ${countdown.join('-')}; ${snaps} snapshots; resultado único (${rewardsMsgs}x)`);
  if (rewardsMsgs !== 1) fail('recompensa duplicada');
  console.log('ranking:', JSON.stringify(result.result.ranking), 'recompensas:', JSON.stringify(result.rewards), 'id:', result.rewardEventId);
  const total = Object.keys(result.rewards).length; if (total !== 4) fail('recompensas != 4');
  console.log('placar final:', JSON.stringify(lastScores));
  console.log('SMOKE TEST OK');
  process.exit(0);
})();
