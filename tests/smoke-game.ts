// Partida completa contra o servidor REAL em modo rápido: PIXEL_PARTY_FAST=1 PORT=3011 npm run dev:server  →  URL=http://localhost:3011 npm run smoke:game
import { io, type Socket } from 'socket.io-client';
const URL = process.env.URL ?? 'http://localhost:3011';
const fail = (m: string): never => { console.error('FALHOU:', m); process.exit(1); };
const ok = (m: string) => console.log('ok  -', m);
const call = (s: Socket, ev: string, payload: unknown) => new Promise<any>((res) => s.emit(ev, payload, res));

async function run(humans: number) {
  const socks: Socket[] = [];
  const st = { final: null as any, round: 0, results: 0, updates: 0, errors: [] as string[], ids: [] as string[], coins: {} as Record<string, number>, order: [] as string[] };
  const code = await (async () => {
    const hs = Array.from({ length: humans }, () => io(URL)); socks.push(...hs);
    const r = await call(hs[0]!, 'room:create', { name: 'H0' }); if (!r.ok) fail('create');
    st.ids.push(r.you);
    for (let i = 1; i < humans; i++) { const j = await call(hs[i]!, 'room:join', { code: r.room.code, name: 'H' + i }); if (!j.ok) fail('join'); st.ids.push(j.you); }
    hs.forEach((s, i) => {
      s.on('game:error', (m) => st.errors.push(m));
      s.on('mg:result', () => { if (i === 0) st.results++; });
      s.on('game:update', (u: any) => {
        if (i === 0) { st.updates++; st.round = u.game.round; if (u.game.final) st.final = u.game.final; for (const p of u.game.players) st.coins[p.id] = p.coins; }
        const me = st.ids[i]!;
        if (u.waiting && u.waiting.pid === me) {
          if (u.waiting.kind === 'roll') { const me3 = u.game.players.find((p: any) => p.id === me); if (me3.items.includes('ima') && !u.game.itemUsed) { const t = u.game.players.find((p: any) => p.id !== me && p.coins > 0); if (t) { s.emit('game:act', { kind: 'item', item: 'ima', target: t.id }); return; } } s.emit('game:roll'); }
          else if (u.waiting.kind === 'fork') s.emit('game:choose', u.waiting.choices[0]);
          else if (u.waiting.kind === 'buy') s.emit('game:buy', true);
          else if (u.waiting.kind === 'shop') { const me2 = u.game.players.find((p: any) => p.id === me); if (me2.items.length < 2 && me2.coins >= 12) s.emit('game:act', { kind: 'shopBuy', item: 'ima' }); else s.emit('game:act', { kind: 'shopLeave' }); }
          else if (u.waiting.kind === 'teleport') s.emit('game:act', { kind: 'teleport', tile: u.waiting.choices[Math.min(1, u.waiting.choices.length - 1)] });
          else if (u.waiting.kind === 'duel') s.emit('game:act', { kind: 'duel', target: u.waiting.targets[0] });
          else if (u.waiting.kind === 'pick_die') s.emit('game:act', { kind: 'pickDie', value: u.waiting.options[0] });
        }
      });
    });
    hs.forEach((s) => s.emit('room:setReady', true));
    await new Promise((r) => setTimeout(r, 250));
    hs[0]!.emit('room:start');
    return r.room.code;
  })();
  const t0 = Date.now();
  while (!st.final) { if (Date.now() - t0 > 120_000) fail(`timeout; rodada ${st.round}`); await new Promise((r) => setTimeout(r, 200)); }
  if (st.round !== 12) fail('rodada final ' + st.round);
  if (st.results < 12) fail('minigames: ' + st.results);
  if (Object.values(st.coins).some((c) => c < 0)) fail('moeda negativa');
  if (st.final.length !== 4) fail('ranking');
  ok(`${humans} humano(s)+${4 - humans} bots: 12 rodadas, ${st.results} minigames, ${st.updates} updates, vencedor ${st.final[0].pid} (${st.final[0].stars}★ ${st.final[0].coins}$) [${((Date.now() - t0) / 1000).toFixed(1)}s] ${code}`);
  if (st.errors.length) console.log('   erros recebidos:', st.errors.slice(0, 3));
  socks.forEach((s) => s.disconnect());
}
(async () => { await run(1); await run(2); await run(4); console.log('SMOKE GAME OK'); process.exit(0); })();
