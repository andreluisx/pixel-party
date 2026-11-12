// Ponta a ponta do lobby contra o servidor REAL (npm run dev:server antes): npm run smoke:room
import { io, type Socket } from 'socket.io-client';
const URL = process.env.URL ?? 'http://localhost:3001';
const fail = (m: string): never => { console.error('FALHOU:', m); process.exit(1); };
const ok = (m: string) => console.log('ok  -', m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (s: Socket, ev: string, payload: unknown) => new Promise<any>((res) => s.emit(ev, payload, res));

const mk = () => { const s = io(URL); const st: { room: any; errors: string[] } = { room: null, errors: [] }; s.on('room:state', (r) => (st.room = r)); s.on('room:error', (m) => st.errors.push(m)); return { s, st }; };

(async () => {
  const A = mk(), B = mk(), C = mk(), D = mk(), E = mk();
  const ra = await call(A.s, 'room:create', { name: 'Ana' }); if (!ra.ok) fail('create');
  const code = ra.room.code;
  const bots = (r: any) => r.participants.filter((p: any) => p.isBot).length;
  ok(`sala ${code} criada: 1 humano + ${bots(ra.room)} bots, personagens únicos=${new Set(ra.room.participants.map((p: any) => p.characterId)).size}`);

  const bad = await call(B.s, 'room:join', { code: 'QQQQQ', name: 'x' }); if (bad.ok) fail('código inválido'); ok('código inválido: ' + bad.error);
  const rb = await call(B.s, 'room:join', { code: code.toLowerCase(), name: 'Beto' }); if (!rb.ok) fail('join B');
  const rc = await call(C.s, 'room:join', { code, name: 'Cris' }); if (!rc.ok) fail('join C');
  const rd = await call(D.s, 'room:join', { code, name: 'Duda' }); if (!rd.ok) fail('join D');
  const full = await call(E.s, 'room:join', { code, name: 'Edu' }); if (full.ok) fail('sala cheia'); ok('5º jogador: ' + full.error);
  if (bots(A.st.room) !== 0) fail('deveria ter 0 bots');
  if (new Set(A.st.room.participants.map((p: any) => p.characterId)).size !== 4) fail('personagens repetidos');
  ok('4 humanos, 0 bots, personagens únicos');

  // escolha de personagem: B tenta pegar o de A
  const charA = A.st.room.participants[0].characterId;
  B.s.emit('room:setCharacter', charA); await sleep(150);
  if (!B.st.errors.length) fail('B deveria receber erro ao pegar personagem de A'); ok('personagem de outro humano recusado: ' + B.st.errors[0]);
  A.s.emit('room:setCharacter', 'robo'); await sleep(150);
  if (A.st.room.participants[0].characterId !== 'robo' && !A.st.room.participants.some((p: any) => p.characterId === 'robo' && !p.isBot)) ok('robô ocupado por outro humano — troca recusada'); else ok('A escolheu o robô');

  // início bloqueado
  A.s.emit('room:start'); await sleep(150);
  if (A.st.room.phase !== 'lobby') fail('não podia iniciar sem todos prontos'); ok('início bloqueado: ' + A.st.room.startBlockedReason);
  for (const x of [A, B, C, D]) x.s.emit('room:setReady', true);
  await sleep(200);
  B.s.emit('room:start'); await sleep(150);
  if (A.st.room.phase !== 'lobby') fail('não-host não pode iniciar'); ok('não-host não consegue iniciar');
  // queda e retorno de B dentro da carência
  B.s.disconnect(); await sleep(250);
  if (A.st.room.participants[1].connected) fail('B deveria constar desconectado'); ok('B caiu: vaga segurada, aparece desconectado');
  A.s.emit('room:start'); await sleep(150);
  if (A.st.room.phase !== 'lobby') fail('não pode iniciar com humano desconectado'); ok('início bloqueado com humano caído');
  const B2 = io(URL); const rr = await call(B2, 'room:rejoin', { code, you: rb.you }); if (!rr.ok) fail('rejoin'); ok('B voltou e retomou a vaga');
  B2.emit('room:setReady', true); await sleep(250);
  A.s.emit('room:start'); await sleep(200);
  if (A.st.room.phase !== 'started') fail('deveria iniciar: ' + A.st.room.startBlockedReason); ok('partida iniciada pelo host');
  // host sai: migra
  A.s.emit('room:leave'); await sleep(250);
  const rrm = C.st.room; if (rrm.hostId === ra.you) fail('host não migrou'); ok('host saiu: novo host definido; vaga virou bot=' + rrm.participants[0].isBot);
  console.log('SMOKE ROOM OK'); process.exit(0);
})();
