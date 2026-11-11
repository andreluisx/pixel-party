'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { RoomClient, type RoomClientState } from '@/net/roomClient';
import { CHARACTERS } from '@shared/characters';
import type { CharacterId } from '@shared/characters';
import type { RoomState } from '@shared/protocol';
import type { BotDifficulty, ParticipantInfo } from '@shared/types';
import { SLOT_COLORS } from '@shared/types';
import { ANIMS, ANIM_ORDER, type CharAnim } from '@/game/art/characters';
import { loadSettings, settingsStore, updateSettings } from '@/game/settings';
import { sfx } from '@/game/audio/sfx';
import { CharacterSprite } from './CharacterSprite';
import { MenuBackdrop } from './MenuBackdrop';

type Screen = 'menu' | 'create' | 'join' | 'characters' | 'settings';
const EMPTY: RoomClientState = { connected: false, you: null, room: null, error: null };
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

function Die() {
  return (
    <svg className="die" viewBox="0 0 14 14" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="1" width="12" height="12" fill="#1b1030" /><rect x="2" y="2" width="10" height="10" fill="#f4efe0" /><rect x="2" y="10" width="10" height="2" fill="#cdbf95" />
      {[[3, 3], [9, 3], [6, 6], [3, 8], [9, 8]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="2" height="2" fill="#1b1030" />)}
    </svg>
  );
}

function Logo() {
  return (
    <div className="logo-wrap">
      <h1 className="logo-big" aria-label="Pixel Party"><span>PIXEL</span><span>PARTY</span></h1>
      <Die />
      <p className="ribbon">Jogue, explore, divirta-se</p>
    </div>
  );
}

export function GameApp() {
  const [client, setClient] = useState<RoomClient | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    loadSettings();
    try { setName(localStorage.getItem('pixel-party:name') ?? ''); } catch { /* ok */ }
    const c = new RoomClient();
    setClient(c);
    const startMusic = () => sfx.startMusic();
    window.addEventListener('pointerdown', startMusic, { once: true });
    window.addEventListener('keydown', startMusic, { once: true });
    return () => { window.removeEventListener('pointerdown', startMusic); window.removeEventListener('keydown', startMusic); c.dispose(); };
  }, []);

  const store = useMemo(() => ({ sub: client ? client.subscribe : () => () => {}, get: client ? client.getState : () => EMPTY }), [client]);
  const st = useSyncExternalStore(store.sub, store.get, () => EMPTY);
  const room = st.room;

  useEffect(() => { if (st.error) sfx.error(); }, [st.error]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !room) { sfx.click(); setScreen('menu'); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [room]);

  const saveName = (n: string) => { setName(n); try { localStorage.setItem('pixel-party:name', n); } catch { /* ok */ } };
  const go = (s: Screen) => { sfx.click(); setScreen(s); client?.clearError(); };

  return (
    <div className="app">
      <MenuBackdrop />
      <div className="app-veil" />
      {st.error && <div className="toast" role="alert">{st.error}</div>}
      <span className={`net-dot ${st.connected ? 'on' : 'off'}`} title={st.connected ? 'Servidor conectado' : 'Sem servidor'}>{st.connected ? 'online' : 'sem servidor'}</span>

      <main className="shell">
        {room && client ? (
          room.phase === 'lobby' ? <Lobby client={client} st={st} room={room} /> : <Started client={client} st={st} room={room} />
        ) : screen === 'menu' ? (
          <div className="menu">
            <Logo />
            <nav className="menu-btns" aria-label="Menu principal">
              <button className="btn btn-menu btn-gold" onClick={() => go('create')}>Criar partida</button>
              <button className="btn btn-menu" onClick={() => go('join')}>Entrar na partida</button>
              <button className="btn btn-menu" onClick={() => go('characters')}>Personagens</button>
              <button className="btn btn-menu" onClick={() => go('settings')}>Configurações</button>
            </nav>
            <p className="menu-foot">Até 4 jogadores. Vagas vazias são preenchidas por bots.</p>
          </div>
        ) : screen === 'create' ? (
          <section className="panel narrow">
            <h2>Criar partida</h2>
            <p className="hint">Você recebe um código para convidar seus amigos. Quem não entrar vira bot.</p>
            <form className="stack-form" onSubmit={(e) => { e.preventDefault(); sfx.click(); client?.create(name.trim()); }}>
              <label className="field">Seu nome<input value={name} maxLength={14} placeholder="Jogador" onChange={(e) => saveName(e.target.value)} autoFocus /></label>
              <button className="btn btn-gold" type="submit">Criar sala</button>
              <button className="btn" type="button" onClick={() => go('menu')}>Voltar</button>
            </form>
          </section>
        ) : screen === 'join' ? (
          <section className="panel narrow">
            <h2>Entrar na partida</h2>
            <form className="stack-form" onSubmit={(e) => { e.preventDefault(); sfx.click(); client?.join(code, name.trim()); }}>
              <label className="field">Seu nome<input value={name} maxLength={14} placeholder="Jogador" onChange={(e) => saveName(e.target.value)} /></label>
              <label className="field">Código da sala
                <input className="code-input" value={code} maxLength={5} placeholder="•••••" autoFocus autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              </label>
              <button className="btn btn-gold" type="submit" disabled={code.length < 5}>Entrar</button>
              <button className="btn" type="button" onClick={() => go('menu')}>Voltar</button>
            </form>
          </section>
        ) : screen === 'characters' ? (
          <Characters onBack={() => go('menu')} />
        ) : (
          <SettingsScreen onBack={() => go('menu')} />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- Personagens
function Characters({ onBack }: { onBack: () => void }) {
  const [sel, setSel] = useState<CharacterId>('explorador');
  const [anim, setAnim] = useState<CharAnim>('idle');
  const info = CHARACTERS.find((c) => c.id === sel)!;
  return (
    <section className="panel wide">
      <h2>Personagens</h2>
      <div className="char-grid">
        <ul className="char-list" role="listbox" aria-label="Personagens">
          {CHARACTERS.map((c) => (
            <li key={c.id}>
              <button role="option" aria-selected={sel === c.id} className={`char-pick${sel === c.id ? ' on' : ''}`} onClick={() => { sfx.select(); setSel(c.id); }}>
                <CharacterSprite id={c.id} scale={3} /><span>{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="char-show">
          <div className="char-stage"><CharacterSprite id={sel} anim={anim} scale={11} label={info.name} /></div>
          <h3>{info.name} <span className="dim">· {info.title}</span></h3>
          <p>{info.blurb}</p>
          <div className="seg seg-5" role="radiogroup" aria-label="Animação">
            {ANIM_ORDER.map((a) => <button key={a} role="radio" aria-checked={anim === a} className={anim === a ? 'on' : ''} onClick={() => { sfx.click(); setAnim(a); }}>{ANIMS[a].label}</button>)}
          </div>
        </div>
      </div>
      <button className="btn" onClick={onBack}>Voltar</button>
    </section>
  );
}

// ---------------------------------------------------------------- Configurações
function SettingsScreen({ onBack }: { onBack: () => void }) {
  const s = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  return (
    <section className="panel narrow">
      <h2>Configurações</h2>
      <div className="stack-form">
        <label className="field">Música: {Math.round(s.musicVolume * 100)}%
          <input type="range" min={0} max={100} value={Math.round(s.musicVolume * 100)} onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) / 100 })} />
        </label>
        <label className="field">Efeitos sonoros: {Math.round(s.sfxVolume * 100)}%
          <input type="range" min={0} max={100} value={Math.round(s.sfxVolume * 100)} onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value) / 100 })} onPointerUp={() => sfx.coin()} onKeyUp={() => sfx.coin()} />
        </label>
        <label className="check"><input type="checkbox" checked={s.muted} onChange={(e) => updateSettings({ muted: e.target.checked })} /> Silenciar tudo</label>
        <label className="check"><input type="checkbox" checked={s.reduceMotion} onChange={(e) => updateSettings({ reduceMotion: e.target.checked })} /> Reduzir animações</label>
        <div className="keys">
          <h3>Controles</h3>
          <p><kbd>WASD</kbd> ou <kbd>Setas</kbd> mover · <kbd>Espaço</kbd> ação · <kbd>Enter</kbd> confirmar · <kbd>Esc</kbd> voltar</p>
          <p>No celular: joystick virtual e botões grandes.</p>
        </div>
        <button className="btn btn-gold" onClick={() => { sfx.click(); onBack(); }}>Voltar</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Lobby
function slotStatus(p: ParticipantInfo): { text: string; tone: 'ok' | 'wait' | 'bad' | 'bot' } {
  if (p.isBot) return { text: 'Pronto', tone: 'bot' };
  if (!p.connected) return { text: 'Sem conexão. A vaga está guardada.', tone: 'bad' };
  return p.ready ? { text: 'Pronto!', tone: 'ok' } : { text: 'Escolhendo…', tone: 'wait' };
}

function Lobby({ client, st, room }: { client: RoomClient; st: RoomClientState; room: RoomState }) {
  const [copied, setCopied] = useState(false);
  const me = room.participants.find((p) => p.id === st.you);
  const isHost = room.hostId === st.you;
  const humansN = room.participants.filter((p) => !p.isBot).length;

  const copy = async () => {
    sfx.click();
    try { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { client.flashError('Não consegui copiar. Anote o código.'); }
  };

  return (
    <div className="lobby">
      <header className="panel lobby-head">
        <div>
          <p className="hint">Código da sala</p>
          <button className="code" onClick={copy} title="Copiar código" aria-label={`Código ${room.code}. Toque para copiar`}>{room.code}</button>
          <p className="hint">{copied ? 'Código copiado!' : 'Toque para copiar e envie aos amigos.'}</p>
        </div>
        <div className="board-card">
          <p className="hint">Tabuleiro</p>
          <strong>{room.board.name}</strong>
          <p className="hint">{humansN} {humansN === 1 ? 'jogador' : 'jogadores'} · {4 - humansN} {4 - humansN === 1 ? 'bot' : 'bots'}</p>
        </div>
      </header>

      <ul className="slots">
        {room.participants.map((p) => {
          const status = slotStatus(p);
          const anim: CharAnim = p.isBot ? 'idle' : !p.connected ? 'lose' : p.ready ? 'celebrate' : 'idle';
          const info = CHARACTERS.find((c) => c.id === p.characterId);
          return (
            <li key={p.slot} className={`slot${p.id === st.you ? ' slot-me' : ''}${!p.connected && !p.isBot ? ' slot-off' : ''}`} style={{ ['--c' as string]: SLOT_COLORS[p.slot] }}>
              <div className="slot-head">
                <span>Jogador {p.slot + 1}</span>
                {p.id === room.hostId && <span className="tag">host</span>}
                {p.id === st.you && <span className="tag tag-you">você</span>}
              </div>
              <div className="slot-stage"><CharacterSprite id={p.characterId as CharacterId} anim={anim} scale={6} label={info?.name} /></div>
              <div className="slot-name">{p.name}{p.isBot && <RobotIcon />}</div>
              <div className="slot-char">{info?.name} · {info?.title}</div>
              <div className={`slot-status st-${status.tone}`}>{p.isBot ? `Bot · ${DIFFS.find((d) => d.id === p.difficulty)?.label ?? ''}` : status.text}</div>
              {isHost && p.isBot && (
                <div className="seg" role="radiogroup" aria-label={`Dificuldade do ${p.name}`}>
                  {DIFFS.map((d) => <button key={d.id} role="radio" aria-checked={p.difficulty === d.id} className={p.difficulty === d.id ? 'on' : ''} onClick={() => { sfx.click(); client.setBot(p.slot, d.id); }}>{d.label}</button>)}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {me && (
        <section className="panel picker">
          <h3>Escolha seu personagem</h3>
          <ul className="pick-row">
            {CHARACTERS.map((c) => {
              const holder = room.participants.find((p) => p.characterId === c.id);
              const taken = !!holder && !holder.isBot && holder.id !== me.id;
              const mine = me.characterId === c.id;
              return (
                <li key={c.id}>
                  <button className={`char-pick${mine ? ' on' : ''}`} disabled={taken} aria-pressed={mine} title={taken ? `${c.name} está com ${holder?.name}` : c.title}
                    onClick={() => { sfx.select(); client.setCharacter(c.id); }}>
                    <CharacterSprite id={c.id} anim={mine ? 'celebrate' : 'idle'} scale={3} />
                    <span>{c.name}</span>
                    {taken && <small>em uso</small>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="actions">
            <button className={`btn ${me.ready ? '' : 'btn-gold'}`} onClick={() => { me.ready ? sfx.click() : sfx.ready(); client.setReady(!me.ready); }}>{me.ready ? 'Cancelar pronto' : 'Estou pronto'}</button>
            {isHost ? (
              <button className="btn btn-gold" disabled={!!room.startBlockedReason} onClick={() => { sfx.go(); client.start(); }}>Iniciar partida</button>
            ) : <span className="hint">Aguardando o host iniciar.</span>}
            <button className="btn" onClick={() => { sfx.click(); client.leave(); }}>Sair da sala</button>
          </div>
          {isHost && room.startBlockedReason && <p className="hint">{room.startBlockedReason}</p>}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Partida iniciada (provisório até o tabuleiro)
function Started({ client, st, room }: { client: RoomClient; st: RoomClientState; room: RoomState }) {
  const isHost = room.hostId === st.you;
  return (
    <section className="panel wide started">
      <h2>Partida iniciada!</h2>
      <ul className="started-row">
        {room.participants.map((p) => (
          <li key={p.slot} style={{ ['--c' as string]: SLOT_COLORS[p.slot] }}>
            <CharacterSprite id={p.characterId as CharacterId} anim="celebrate" scale={5} />
            <span>{p.name}{p.isBot && <RobotIcon />}</span>
          </li>
        ))}
      </ul>
      <p>O tabuleiro jogável chega nas próximas entregas. Por enquanto, a sala já está pronta com 4 participantes. Teste os minigames no laboratório.</p>
      <div className="actions">
        <Link className="btn btn-gold" href="/dev/minigames">Abrir laboratório de minigames</Link>
        {isHost && <button className="btn" onClick={() => { sfx.click(); client.backToLobby(); }}>Voltar ao lobby</button>}
        <button className="btn" onClick={() => { sfx.click(); client.leave(); }}>Sair da sala</button>
      </div>
    </section>
  );
}
