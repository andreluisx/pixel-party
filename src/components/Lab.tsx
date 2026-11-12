'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type Phaser from 'phaser';
import { LabClient, type LabState } from '@/net/labClient';
import { createGame } from '@/game/createGame';
import { sfx } from '@/game/audio/sfx';
import type { BotDifficulty, ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import type { MinigameResult } from '@shared/minigame';
import { MINIGAME_LIST } from '@shared/minigames';

const EMPTY: LabState = { connected: false, you: null, lobby: null, intro: null, countdown: null, result: null, error: null, snapsPerSec: 0 };
const DIFFS: { id: BotDifficulty; label: string }[] = [{ id: 'easy', label: 'Fácil' }, { id: 'medium', label: 'Médio' }, { id: 'hard', label: 'Difícil' }];

function RobotIcon() {
  return (
    <svg className="bot-icon" viewBox="0 0 12 12" aria-label="bot" shapeRendering="crispEdges">
      <rect x="5" y="0" width="2" height="2" fill="#f5b83d" /><rect x="2" y="2" width="8" height="6" fill="#9a97ad" />
      <rect x="3" y="4" width="2" height="2" fill="#1b1030" /><rect x="7" y="4" width="2" height="2" fill="#1b1030" />
      <rect x="3" y="9" width="6" height="3" fill="#7a7791" />
    </svg>
  );
}

function PlayerChip({ p, you, host }: { p: ParticipantInfo; you: boolean; host: boolean }) {
  return (
    <li className={`chip${p.connected ? '' : ' chip-off'}`}>
      <span className="dot" style={{ background: SLOT_COLORS[p.slot] }} />
      <span className="chip-name">{p.name}</span>
      {p.isBot && <RobotIcon />}
      {p.isBot && <span className="tag">{p.difficulty === 'easy' ? 'fácil' : p.difficulty === 'hard' ? 'difícil' : 'médio'}</span>}
      {you && <span className="tag tag-you">você</span>}
      {host && <span className="tag">host</span>}
      {!p.isBot && !p.connected && <span className="tag tag-warn">bot assumiu</span>}
    </li>
  );
}

function ResultTable({ result, rewards, players, you, format }: { result: MinigameResult; rewards: Record<string, number>; players: ParticipantInfo[]; you: string | null; format?: (n: number) => string }) {
  const name = (id: string) => players.find((p) => p.id === id);
  if (result.kind !== 'ranking') return <p>Resultado cooperativo: {result.success ? 'missão cumprida' : 'missão falhou'}</p>;
  return (
    <ol className="rank">
      {result.ranking.map((r) => {
        const p = name(r.playerId);
        return (
          <li key={r.playerId} className={r.playerId === you ? 'rank-you' : ''}>
            <span className="rank-pos">{r.rank}º</span>
            <span className="dot" style={{ background: SLOT_COLORS[p?.slot ?? 0] }} />
            <span className="rank-name">{p?.name ?? r.playerId}{p?.isBot && <RobotIcon />}</span>
            <span className="rank-score">{format ? format(r.score) : `${r.score} pts`}</span>
            <span className="rank-coins">+{rewards[r.playerId] ?? 0}</span>
          </li>
        );
      })}
    </ol>
  );
}

function TouchPad({ client }: { client: LabClient }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const vx = (e.clientX - cx) / (r.width / 2), vy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(vx, vy) || 1;
    const k = Math.min(1, len);
    setKnob({ x: (vx / len) * k * 32, y: (vy / len) * k * 32 });
    client.touch = { ...client.touch, dx: Math.abs(vx) > 0.3 ? (vx > 0 ? 1 : -1) : 0, dy: Math.abs(vy) > 0.3 ? (vy > 0 ? 1 : -1) : 0 };
  };
  const end = () => { setKnob({ x: 0, y: 0 }); client.touch = { ...client.touch, dx: 0, dy: 0 }; };
  return (
    <div ref={ref} className="touchpad" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={(e) => { if (e.buttons) update(e); }} onPointerUp={end} onPointerCancel={end} aria-label="Joystick virtual">
      <div className="touchpad-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function ActionButton({ client, label }: { client: LabClient; label: string }) {
  const set = (v: boolean) => { client.touch = { ...client.touch, action: v }; };
  return (
    <button className="actionbtn" aria-label={label} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(true); }}
      onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onContextMenu={(e) => e.preventDefault()}>{label}</button>
  );
}

function DPad({ client }: { client: LabClient }) {
  const btn = (k: 'L' | 'U' | 'D' | 'R', label: string, cls: string) => (
    <button className={`dpad-btn ${cls}`} aria-label={label} onPointerDown={(e) => { e.preventDefault(); client.touchPresses.push(k); }} onContextMenu={(e) => e.preventDefault()}>{label}</button>
  );
  return (
    <div className="dpad" aria-label="Direções">
      {btn('U', '↑', 'u')}{btn('L', '←', 'l')}{btn('R', '→', 'r')}{btn('D', '↓', 'd')}
    </div>
  );
}

export function Lab() {
  const [client, setClient] = useState<LabClient | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const debugRef = useRef(false);
  const [debug, setDebug] = useState(false);
  const [name, setName] = useState('Jogador');
  const [code, setCode] = useState('');
  const [minigameId, setMinigameId] = useState(MINIGAME_LIST[0]!.id);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('medium');
  const [seed, setSeed] = useState('');
  const [sim, setSim] = useState<{ result: MinigameResult; rewards: Record<string, number>; ticks: number; players: ParticipantInfo[] } | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [hud, setHud] = useState<{ t: number; scores: Record<string, number> }>({ t: 0, scores: {} });

  useEffect(() => { debugRef.current = debug; }, [debug]);

  // cria o cliente de rede e o Phaser uma única vez
  useEffect(() => {
    const c = new LabClient();
    setClient(c);
    (window as unknown as { __labClient?: LabClient }).__labClient = c; // depuração e testes automatizados do laboratório
    let game: Phaser.Game | null = null;
    let cancelled = false;
    (async () => {
      if ('fonts' in document) { try { await document.fonts.load('700 16px "Pixelify Sans"'); } catch { /* segue com fallback */ } }
      if (cancelled || !stage.current) return;
      game = await createGame(stage.current, c, () => debugRef.current);
      if (cancelled) game.destroy(true);
    })();
    return () => { cancelled = true; game?.destroy(true); c.dispose(); };
  }, []);

  const store = useMemo(() => ({ sub: client ? client.subscribe : () => () => {}, get: client ? client.getState : () => EMPTY }), [client]);
  const st = useSyncExternalStore(store.sub, store.get, () => EMPTY);

  // HUD lê o snapshot ~10x/s (o jogo em si roda no Phaser, fora do React)
  useEffect(() => {
    if (!client) return;
    const id = setInterval(() => {
      const s = client.latest;
      if (s) setHud({ t: s.timeLeftMs, scores: s.scores });
    }, 100);
    return () => clearInterval(id);
  }, [client]);

  // sons de contagem
  useEffect(() => {
    if (st.countdown === null) return;
    if (st.countdown === 0) sfx.go(); else sfx.beep();
  }, [st.countdown]);
  useEffect(() => { if (st.result) sfx.win(); }, [st.result]);
  useEffect(() => { if (st.error) sfx.error(); }, [st.error]);

  const lobby = st.lobby;
  const isHost = !!lobby && lobby.hostId === st.you;
  const phase = lobby?.phase ?? 'lobby';
  const meta = lobby?.minigames.find((m) => m.id === lobby.config.minigameId);
  const cfg = () => ({ minigameId, difficulty, ...(seed.trim() !== '' && Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}) });
  const players = st.intro?.participants ?? lobby?.participants ?? [];
  const showIntro = phase === 'intro' && st.intro;
  const showCount = phase === 'countdown' && st.countdown !== null;

  const runSim = async () => {
    if (!client) return;
    setSimError(null);
    const r = await client.simulate(cfg());
    if (r.ok) setSim(r); else { setSim(null); setSimError(r.error); }
  };

  return (
    <div className="lab">
      <header className="lab-head">
        <h1>Laboratório de minigames</h1>
        <span className={`conn ${st.connected ? 'conn-on' : 'conn-off'}`}>{st.connected ? 'servidor conectado' : 'sem servidor'}</span>
      </header>

      {st.error && (
        <div className="alert" role="alert">
          <span>{st.error}</span>
          <button className="btn btn-sm" onClick={() => client?.dismissError()}>Fechar</button>
        </div>
      )}

      <div className="lab-grid">
        <aside className="panel side">
          {!lobby ? (
            <>
              <h2>Sala de teste</h2>
              <label className="field">Seu nome
                <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">Minigame
                <select value={minigameId} onChange={(e) => setMinigameId(e.target.value)}>
                  {MINIGAME_LIST.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === 'pipeline-test' ? ' (provisório)' : ''}</option>)}
                </select>
              </label>
              <div className="field">Dificuldade dos bots
                <div className="seg" role="radiogroup">
                  {DIFFS.map((d) => (
                    <button key={d.id} role="radio" aria-checked={difficulty === d.id} className={difficulty === d.id ? 'on' : ''} onClick={() => { sfx.click(); setDifficulty(d.id); }}>{d.label}</button>
                  ))}
                </div>
              </div>
              <label className="field">Seed (opcional)
                <input value={seed} inputMode="numeric" placeholder="aleatória" onChange={(e) => setSeed(e.target.value.replace(/[^0-9-]/g, ''))} />
              </label>
              <button className="btn btn-gold" disabled={!st.connected} onClick={() => { sfx.click(); client?.create(name, cfg()); }}>Criar sala de teste</button>
              <div className="join">
                <input value={code} maxLength={5} placeholder="CÓDIGO" onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Código da sala" />
                <button className="btn" disabled={!st.connected || code.length < 5} onClick={() => { sfx.click(); client?.join(code, name); }}>Entrar</button>
              </div>
              <hr />
              <button className="btn" disabled={!st.connected} onClick={() => { sfx.click(); void runSim(); }}>Simular só com bots</button>
              <p className="hint">Roda a partida inteira no servidor, sem esperar o relógio. Os 4 participantes são bots.</p>
            </>
          ) : (
            <>
              <h2>Sala {lobby.code}</h2>
              <div className="code-row">
                <button className="code" onClick={() => { navigator.clipboard?.writeText(lobby.code); sfx.click(); }} title="Copiar código">{lobby.code}</button>
                <span className="hint">Toque para copiar. Abra outra aba e entre com este código.</span>
              </div>
              <ul className="chips">
                {lobby.participants.map((p) => <PlayerChip key={p.id} p={p} you={p.id === st.you} host={p.id === lobby.hostId} />)}
              </ul>
              {(phase === 'lobby' || phase === 'result') && isHost && (
                <>
                  <label className="field">Minigame
                    <select value={lobby.config.minigameId} onChange={(e) => client?.setConfig({ minigameId: e.target.value })}>
                      {lobby.minigames.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                  <div className="field">Bots
                    <div className="seg">
                      {DIFFS.map((d) => <button key={d.id} className={lobby.config.difficulty === d.id ? 'on' : ''} onClick={() => { sfx.click(); client?.setConfig({ difficulty: d.id }); }}>{d.label}</button>)}
                    </div>
                  </div>
                  <button className="btn btn-gold" onClick={() => { sfx.click(); client?.start(); }}>{phase === 'result' ? 'Jogar de novo' : 'Iniciar minigame'}</button>
                </>
              )}
              {(phase === 'lobby' || phase === 'result') && !isHost && <p className="hint">Aguardando o host iniciar.</p>}
              {phase !== 'lobby' && phase !== 'result' && <p className="hint">Minigame em andamento…</p>}
              <hr />
              <label className="check"><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> Mostrar hitboxes</label>
              <p className="hint">Snapshots/s: {st.snapsPerSec} (esperado ~30 durante a partida). Seed: {lobby.config.seed}</p>
              <button className="btn btn-sm" onClick={() => client?.leave()}>Sair da sala</button>
            </>
          )}
          {sim && !lobby && (
            <div className="sim">
              <h3>Resultado da simulação ({(sim.ticks / 30).toFixed(1)} s)</h3>
              <ResultTable result={sim.result} rewards={sim.rewards} players={sim.players} you={null} format={MINIGAME_LIST.find((m) => m.id === minigameId)?.formatScore} />
            </div>
          )}
          {simError && <p className="hint">Erro: {simError}</p>}
        </aside>

        <section className="stage-wrap">
          <div className="stage">
            <div ref={stage} className="stage-canvas" />
            {!lobby && <div className="overlay center"><p className="overlay-msg">Crie uma sala para ver a arena.<br />Vagas sem jogador viram bots automaticamente.</p></div>}
            {lobby && phase === 'lobby' && <div className="overlay center"><p className="overlay-msg">{meta?.name}<br /><span className="dim">Aguardando início</span></p></div>}

            {phase === 'active' && (
              <div className="hud">
                <div className="hud-time">{Math.ceil(hud.t / 1000)}</div>
                <ul className="hud-scores">
                  {players.map((p) => (
                    <li key={p.id} style={{ borderColor: SLOT_COLORS[p.slot] }} className={p.id === st.you ? 'me' : ''}>
                      <span className="dot" style={{ background: SLOT_COLORS[p.slot] }} />{p.name}{p.isBot && <RobotIcon />}<b>{hud.scores[p.id] ?? 0}{meta?.hudUnit ?? ''}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showIntro && st.intro && (
              <div className="overlay center">
                <div className="card intro">
                  <h2>{st.intro.meta.instructions.title}</h2>
                  <ul>{st.intro.meta.instructions.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                  <div className="controls">{st.intro.meta.instructions.controls.map((c) => <span key={c.keys}><kbd>{c.keys}</kbd> {c.action}</span>)}</div>
                  <div className="bar"><div className="bar-fill" /></div>
                </div>
              </div>
            )}
            {showCount && <div className="overlay center"><div className="count" key={st.countdown}>{st.countdown === 0 ? 'VAI!' : st.countdown}</div></div>}

            {phase === 'result' && st.result && (
              <div className="overlay center">
                <div className="card result">
                  <h2>Resultado</h2>
                  <ResultTable result={st.result.result} rewards={st.result.rewards} players={players} you={st.you} format={MINIGAME_LIST.find((m) => m.id === lobby?.config.minigameId)?.formatScore} />
                  <p className="hint">Moedas de recompensa (aplicadas uma única vez · id {st.result.rewardEventId})</p>
                  {isHost ? <button className="btn btn-gold" onClick={() => { sfx.click(); client?.restart(); }}>Jogar de novo</button> : <p className="hint">Aguardando o host.</p>}
                </div>
              </div>
            )}
            {client && phase === 'active' && meta?.instructions.touch?.stick !== false && <TouchPad client={client} />}
            {client && phase === 'active' && meta?.instructions.touch?.dpad && <DPad client={client} />}
            {client && phase === 'active' && meta?.instructions.touch?.action && <ActionButton client={client} label={meta.instructions.touch.action} />}
          </div>
          <p className="hint under">{meta ? meta.instructions.controls.map((c) => `${c.keys}: ${c.action}`).join(' · ') : 'Controles: WASD ou setas.'} · No celular: joystick e botão na tela.</p>
        </section>
      </div>
    </div>
  );
}
