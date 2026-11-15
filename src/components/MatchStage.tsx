'use client';
import { PixelIcon } from './PixelIcon';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { settingsStore, updateSettings } from '@/game/settings';
import type Phaser from 'phaser';
import type { RoomClient, RoomClientState } from '@/net/roomClient';
import type { RoomState } from '@shared/protocol';
import { SLOT_COLORS } from '@shared/types';
import { MINIGAME_LIST } from '@shared/minigames';
import { createGame } from '@/game/createGame';
import { sfx } from '@/game/audio/sfx';
import { ITEMS, MAX_ITEMS, type ItemId } from '@shared/game/items';
import type { Awaiting, GPlayer } from '@shared/game/engine';
import { itemPrice, teleportDestinations, starCost } from '@shared/game/engine';
import { buildBoard } from '@shared/board/board';
import { REINO_DO_CASTELO } from '@shared/board/maps/reino-do-castelo';
import type { PublicGame } from '@shared/protocol';
import { FinalCeremony } from './FinalCeremony';
import { ActionButton, AimStick, DuckButton, DPad, FireButton, ModeToggle, ResultTable, RobotIcon, TouchPad } from './Lab';

/** Tela da partida: o tabuleiro (Phaser) + avisos, pedidos de ação e os minigames da própria sala. */
export function MatchStage({ client, st, room }: { client: RoomClient; st: RoomClientState; room: RoomState }) {
  const stage = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<{ t: number; text?: string; locked?: boolean; scores: Record<string, number> }>({ t: 0, scores: {} });
  const [toast, setToast] = useState<RoomClientState['toast']>(null);
  const isHost = room.hostId === st.you;
  const game = st.game?.game ?? null;
  const waiting = st.game?.waiting ?? null;
  const phase = st.lobby?.phase ?? 'lobby';
  const meta = st.intro?.meta;
  const players = st.intro?.participants ?? room.participants;
  const mine = !!waiting && waiting.pid === st.you;
  const who = waiting ? game?.players.find((p) => p.id === waiting.pid) : null;

  useEffect(() => {
    let g: Phaser.Game | null = null; let cancelled = false;
    (async () => {
      if ('fonts' in document) { try { await document.fonts.load('700 16px "Pixelify Sans"'); } catch { /* fallback */ } }
      if (cancelled || !stage.current) return;
      g = await createGame(stage.current, client, () => false);
      if (cancelled) g.destroy(true);
    })();
    (window as unknown as { __roomClient?: RoomClient }).__roomClient = client; // testes automatizados
    return () => { cancelled = true; g?.destroy(true); };
  }, [client]);

  useEffect(() => {
    const id = setInterval(() => { const s = client.latest; if (s) setHud({ t: s.timeLeftMs, text: s.hudText, locked: s.locked, scores: s.scores }); }, 100);
    return () => clearInterval(id);
  }, [client]);

  useEffect(() => {
    if (!st.toast) return;
    setToast(st.toast);
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [st.toast]);

  useEffect(() => { if (st.countdown === null) return; if (st.countdown === 0) sfx.go(); else sfx.beep(); }, [st.countdown]);
  useEffect(() => { if (st.result) sfx.win(); }, [st.result]);
  // trilha por contexto: tabuleiro, minigame (a cerimônia final controla a própria)
  const inMinigame = phase === 'intro' || phase === 'countdown' || phase === 'active';
  useEffect(() => { if (game?.phase !== 'final') sfx.setTrack(inMinigame ? 'minigame' : 'board'); }, [inMinigame, game?.phase]);
  useEffect(() => () => { sfx.setTrack('menu'); }, []);

  const showIntro = phase === 'intro' && st.intro;
  const showCount = phase === 'countdown' && st.countdown !== null;
  const onBoard = !st.intro;
  const final = game?.phase === 'final' ? game.final : null;
  const nameOf = (id: string) => game?.players.find((p) => p.id === id);
  const fmt = MINIGAME_LIST.find((m) => m.id === meta?.id)?.formatScore;

  return (
    <section className="match">
      <div className="stage-wrap">
        <div className={`stage${final ? " stage-final" : ""}`} data-testid="match-stage">
          <div ref={stage} className="stage-canvas" />

          {onBoard && !final && toast && <span className="sr-only" role="status" aria-live="polite" key={toast.key}>{toast.text}</span>}

          {onBoard && game && !final && waiting && <Prompt client={client} game={game} waiting={waiting} mine={mine} youId={st.you} />}

          {phase === 'active' && !meta?.hideHud && (
            <div className="hud">
              <div className="hud-time">{hud.text ?? Math.ceil(hud.t / 1000)}</div>
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
                <h2>Resultado do minigame</h2>
                <ResultTable result={st.result.result} rewards={st.result.rewards} players={players} you={st.you} format={fmt} />
                <p className="hint">As moedas já foram para o seu saldo. Voltando ao tabuleiro…</p>
              </div>
            </div>
          )}

          {final && game && <FinalCeremony game={game} youId={st.you} isHost={isHost} onAgain={() => { sfx.click(); client.backToLobby(); }} onLeave={() => { sfx.click(); client.leave(); }} />}

          {phase === 'active' && meta?.instructions.touch?.stick !== false && <TouchPad client={client} />}
          {phase === 'active' && meta?.instructions.touch?.dpad && <DPad client={client} />}
          {phase === 'active' && meta?.instructions.touch?.fire && <FireButton client={client} label={meta.instructions.touch.fire} />}
          {phase === 'active' && meta?.instructions.touch?.aimToggle && <ModeToggle client={client} aim={st.aimMode} locked={!!hud.locked} />}
          {phase === 'active' && meta?.instructions.touch?.twin && <AimStick client={client} />}
          {phase === 'active' && meta?.instructions.touch?.duck && <DuckButton client={client} label={meta.instructions.touch.duck} />}
          {phase === 'active' && meta?.instructions.touch?.action && <ActionButton client={client} label={meta.instructions.touch.action} beside={!!meta.instructions.touch.twin} />}
        </div>
        <p className="hint under">
          {onBoard ? 'Tabuleiro: Espaço rola o dado · setas/WASD ou toque escolhem o caminho · estrela custa 25 moedas (menos para quem está bem atrás).' : meta ? meta.instructions.controls.map((c) => `${c.keys}: ${c.action}`).join(' · ') : ''}
        </p>
        {game && <Strip game={game} youId={st.you} />}
        {game && <History game={game} />}
        {!final && <div className="actions match-actions"><MuteButton /><button className="btn btn-sm" onClick={() => { sfx.click(); client.leave(); }}>Sair da partida</button>{isHost && <button className="btn btn-sm" onClick={() => { sfx.click(); client.backToLobby(); }}>Encerrar e voltar ao lobby</button>}</div>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- pedidos de ação (UI simples)
const BOARD = buildBoard(REINO_DO_CASTELO);
const TYPE_LABEL: Record<string, string> = { blue: 'casa azul', red: 'casa vermelha', event: 'evento', minigame: 'minigame', shop: 'loja', star: 'altar da estrela', duel: 'duelo', teleport: 'teleporte', treasure: 'tesouro', trap: 'armadilha' };
const REGION_LABEL: Record<string, string> = { castelo: 'Castelo', floresta: 'Floresta', vila: 'Vila', lago: 'Lago', ponte: 'Ponte', porto: 'Porto' };
export const tileLabel = (id: string) => { const t = BOARD.byId[id]; return t ? `${REGION_LABEL[t.region]} (${TYPE_LABEL[t.type]})` : id; };
const destLabel = (id: string, game: PublicGame) => (id === game.starTile ? `Altar da estrela (${tileLabel(id)})` : id === 'R00' ? 'Portão do castelo' : tileLabel(id));

function Prompt({ client, game, waiting, mine, youId }: { client: RoomClient; game: PublicGame; waiting: Awaiting; mine: boolean; youId: string | null }) {
  const [sub, setSub] = useState<ItemId | null>(null);
  useEffect(() => { setSub(null); }, [waiting.kind, game.turn, game.round]);
  const p = game.players.find((x) => x.id === waiting.pid)!;
  const me = game.players.find((x) => x.id === youId);
  const act = (i: Parameters<RoomClient['act']>[0]) => { sfx.click(); client.act(i); };

  if (!mine) {
    return (
      <div className="prompt"><p className="prompt-msg" style={{ borderColor: SLOT_COLORS[p.slot] }}>
        {p.isBot ? <>{p.name} <RobotIcon /> está pensando…</> : <>Vez de {p.name}…</>}
        {waiting.kind === 'shop' && ' (na loja)'}{waiting.kind === 'duel' && ' (escolhendo um duelo)'}{waiting.kind === 'teleport' && ' (escolhendo um teleporte)'}
      </p></div>
    );
  }
  if (waiting.kind === 'fork') return <div className="prompt"><p className="prompt-msg">Escolha o caminho: toque numa casa marcada ou use as setas</p></div>;
  if (waiting.kind === 'buy') {
    return (
      <div className="prompt"><div className="prompt-row">
        <span className="prompt-msg">Comprar {waiting.secret ? 'a estrela secreta' : 'a estrela'} por {waiting.cost} moedas?</span>
        <button className="btn btn-gold" data-testid="buy-yes" onClick={() => client.buy(true)}>Comprar</button>
        <button className="btn" data-testid="buy-no" onClick={() => client.buy(false)}>Agora não</button>
      </div></div>
    );
  }
  if (waiting.kind === 'roll') {
    const usable = (me?.items ?? []).filter((i) => !ITEMS[i].passive);
    return (
      <div className="prompt"><div className="prompt-col">
        {sub === 'dado' && <div className="prompt-row"><span>Dado Especial, escolha:</span>{[1, 2, 3].map((v) => <button key={v} className="btn" data-testid={`dado-${v}`} onClick={() => act({ kind: 'item', item: 'dado', value: v })}>{v}</button>)}<button className="btn btn-sm" onClick={() => setSub(null)}>Voltar</button></div>}
        {sub === 'ima' && <div className="prompt-row"><span>Roubar de quem?</span>{game.players.filter((x) => x.id !== youId && x.coins > 0).map((x) => <button key={x.id} className="btn" onClick={() => act({ kind: 'item', item: 'ima', target: x.id })}>{x.name} ({x.coins})</button>)}<button className="btn btn-sm" onClick={() => setSub(null)}>Voltar</button></div>}
        {sub === 'pocao' && <div className="prompt-row"><span>Teleportar para:</span>{(teleportDestinations(game as never, BOARD, me!.tile)).map((d) => <button key={d} className="btn" onClick={() => act({ kind: 'item', item: 'pocao', tile: d })}>{destLabel(d, game)}</button>)}<button className="btn btn-sm" onClick={() => setSub(null)}>Voltar</button></div>}
        {!sub && (
          <div className="prompt-row">
            <button className="btn btn-gold prompt-btn" data-testid="roll" onClick={() => { sfx.click(); client.roll(); }}>Rolar o dado <kbd>Espaço</kbd></button>
            {!game.itemUsed && usable.map((i) => (
              <button key={i} className="btn btn-sm" data-testid={`use-${i}`} title={ITEMS[i].desc} onClick={() => (i === 'cogumelo' ? act({ kind: 'item', item: 'cogumelo' }) : setSub(i))}><PixelIcon name={i} /> {ITEMS[i].name}</button>
            ))}
          </div>
        )}
      </div></div>
    );
  }
  if (waiting.kind === 'pick_die') {
    return <div className="prompt"><div className="prompt-row"><span>Escolha o resultado:</span>{waiting.options.map((v, i) => <button key={i} className="btn btn-gold" data-testid={`die-${i}`} onClick={() => act({ kind: 'pickDie', value: v })}>{v}</button>)}</div></div>;
  }
  if (waiting.kind === 'teleport') {
    return <div className="prompt"><div className="prompt-row"><span>Teleporte, vá para:</span>{waiting.choices.map((c) => <button key={c} className="btn" data-testid="tp" onClick={() => act({ kind: 'teleport', tile: c })}>{c === me?.tile ? 'Ficar aqui' : destLabel(c, game)}</button>)}</div></div>;
  }
  if (waiting.kind === 'duel') {
    return <div className="prompt"><div className="prompt-row"><span>Duelo de dados (5 moedas)! Contra quem?</span>{waiting.targets.map((id) => { const x = game.players.find((q) => q.id === id)!; return <button key={id} className="btn" data-testid="duel-target" onClick={() => act({ kind: 'duel', target: id })}>{x.name} ({x.coins})</button>; })}<button className="btn btn-sm" onClick={() => act({ kind: 'duel', target: null })}>Recusar</button></div></div>;
  }
  // loja
  const full = (me?.items.length ?? 0) >= MAX_ITEMS;
  return (
    <div className="overlay center"><div className="card shop" data-testid="shop">
      <h2>Loja {waiting.discount ? `(desconto de ${waiting.discount})` : ''}</h2>
      <p className="hint">Você tem {me?.coins} moedas e {me?.items.length}/{MAX_ITEMS} itens.</p>
      <ul className="shop-list">
        {(Object.keys(ITEMS) as ItemId[]).map((i) => {
          const price = itemPrice(game as never, i);
          const can = !!me && me.coins >= price && !full;
          return <li key={i}><span className="shop-ico"><PixelIcon name={i} size="1.6em" /></span><span className="shop-txt"><b>{ITEMS[i].name}</b> <small>{ITEMS[i].desc}</small></span><button className="btn btn-sm" disabled={!can} data-testid={`shop-${i}`} onClick={() => act({ kind: 'shopBuy', item: i })}>{price} moedas</button></li>;
        })}
      </ul>
      <button className="btn btn-gold" data-testid="shop-leave" onClick={() => act({ kind: 'shopLeave' })}>Sair da loja</button>
    </div></div>
  );
}

/** Faixa com todos os jogadores: estrelas, moedas e itens. */
function Strip({ game, youId }: { game: PublicGame; youId: string | null }) {
  return (
    <ul className="strip" aria-label="Jogadores">
      {game.players.map((p: GPlayer) => (
        <li key={p.id} className={p.id === youId ? 'me' : ''} style={{ borderColor: SLOT_COLORS[p.slot] }}>
          <b>{p.name}</b> ★{p.stars} · {p.coins} moedas · {p.items.length ? p.items.map((i, k) => <span key={k} title={`${ITEMS[i].name}: ${ITEMS[i].desc}`}><PixelIcon name={i} title={ITEMS[i].name} /></span>) : <span className="dim">sem itens</span>}
        </li>
      ))}
      <li className="strip-star">Estrela: {tileLabel(game.starTile)} · custo para você: {starCost(game as never, youId ?? game.players[0]!.id)}{game.starDiscount && game.starDiscount.round === game.round ? ' (promoção!)' : ''}{game.secretStar ? ` · estrela secreta em ${tileLabel(game.secretStar.tile)}` : ''}</li>
    </ul>
  );
}

function History({ game }: { game: PublicGame }) {
  const items = [...game.log].reverse().slice(0, 14);
  return (
    <details className="history"><summary>Histórico da partida</summary>
      <ul>{items.length ? items.map((l, i) => <li key={i}><small>R{l.round}</small> {l.text}</li>) : <li>Nada ainda.</li>}</ul>
      <ul className="coinlog">{[...game.coinLog].reverse().slice(0, 10).map((c, i) => <li key={i}><small>R{c.round}</small> {game.players.find((p) => p.id === c.pid)?.name}: {c.delta > 0 ? '+' : ''}{c.delta} ({c.reason}) → {c.balance}</li>)}</ul>
    </details>
  );
}

function MuteButton() {
  const s = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  return (
    <button className="btn btn-sm" data-testid="mute" aria-pressed={s.muted} title={s.muted ? 'Ligar o som' : 'Silenciar'} onClick={() => updateSettings({ muted: !s.muted })}>
      <PixelIcon name={s.muted ? 'mudo' : 'som'} /> {s.muted ? 'Som desligado' : 'Som ligado'}
    </button>
  );
}
