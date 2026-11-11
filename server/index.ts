import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol';
import { LabRoom, type Sock } from './labRoom';
import { getMinigame, MINIGAME_LIST } from '../shared/minigames';
import { makeBotProfile } from '../shared/bots';
import { simulateMatch } from '../shared/sim';
import type { ParticipantInfo, Slot } from '../shared/types';

const PORT = Number(process.env.PORT ?? 3001);
const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
  res.writeHead(404); res.end();
});
const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, { cors: { origin: true } });
const rooms = new Map<string, LabRoom>();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  for (;;) {
    const c = Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    if (!rooms.has(c)) return c;
  }
}
const cleanName = (n?: string) => (n ?? '').toString().trim().slice(0, 14);

io.on('connection', (socket: Sock) => {
  const roomOf = () => rooms.get(socket.data.roomCode as string);

  socket.on('lab:create', (cfg, ack) => {
    const code = newCode();
    const room = new LabRoom(io, code, socket, cleanName(cfg?.name), cfg ?? {});
    room.onEmpty = () => rooms.delete(code);
    rooms.set(code, room);
    ack({ ok: true, you: room.hostId, lobby: room.lobby() });
    room.broadcastLobby();
  });

  socket.on('lab:join', (p, ack) => {
    const room = rooms.get((p?.code ?? '').toString().trim().toUpperCase());
    if (!room) return ack({ ok: false, error: 'Código não encontrado. Confira as 5 letras.' });
    const r = room.join(socket, cleanName(p.name));
    if (!r.ok) return ack(r);
    ack({ ok: true, you: r.id, lobby: room.lobby() });
  });

  socket.on('lab:rejoin', (p, ack) => {
    const room = rooms.get((p?.code ?? '').toString().toUpperCase());
    if (!room) return ack({ ok: false, error: 'Sala encerrada.' });
    const r = room.rejoin(socket, p.you);
    if (!r.ok) return ack(r);
    ack({ ok: true, you: p.you, lobby: room.lobby() });
  });

  socket.on('lab:setConfig', (cfg) => roomOf()?.setConfig(socket.data.playerId, cfg ?? {}));
  socket.on('lab:start', () => roomOf()?.start(socket.data.playerId));
  socket.on('lab:restart', () => roomOf()?.start(socket.data.playerId));
  socket.on('mg:input', (p) => { if (p) roomOf()?.handleInput(socket.data.playerId, Number(p.seq), p.input); });
  socket.on('disconnect', () => roomOf()?.leave(socket));

  // Simulação acelerada, só com bots, sem sala nem relógio.
  socket.on('lab:simulate', (cfg, ack) => {
    const def = getMinigame(cfg?.minigameId ?? MINIGAME_LIST[0]!.id);
    if (!def) return ack({ ok: false, error: 'Minigame desconhecido.' });
    const diff = cfg?.difficulty ?? 'medium';
    const players: ParticipantInfo[] = [0, 1, 2, 3].map((i) => {
      const b = makeBotProfile(i as Slot, diff);
      return { id: b.id, slot: i as Slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty: diff, personality: b.personality };
    });
    try {
      const out = simulateMatch(def, players, Number.isFinite(cfg?.seed) ? (cfg!.seed as number) : Date.now() % 1e9, diff);
      ack({ ok: true, result: out.result, rewards: out.rewards, ticks: out.ticks, players });
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  });
});

http.listen(PORT, '0.0.0.0', () => console.log(`[pixel-party] servidor em http://0.0.0.0:${PORT}`));
