'use client';
import { PixelIcon } from './PixelIcon';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PublicGame } from '@shared/protocol';
import type { AwardResult, GPlayer, Standing } from '@shared/game/engine';
import type { CharacterId } from '@shared/characters';
import { SLOT_COLORS } from '@shared/types';
import { sfx } from '@/game/audio/sfx';
import { settingsStore } from '@/game/settings';
import { CharacterSprite } from './CharacterSprite';

type Step = { k: 'intro' } | { k: 'announce' | 'suspense' | 'reveal'; i: number } | { k: 'rank' } | { k: 'champion' };
const T = { intro: 3200, announce: 2200, suspense: 2900, revealStep: 650, revealHold: 2200, rankRow: 1500, rankTail: 1500 };


/** Confete e fogos de artifício em canvas (pixels quadrados). Não renderiza nada com "reduzir animações". */
function Particles({ mode, run }: { mode: 'confetti' | 'fireworks' | 'both'; run: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { reduceMotion } = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  useEffect(() => {
    const c = ref.current; if (!c || reduceMotion || run <= 0) return;
    const ctx = c.getContext('2d')!;
    const W = (c.width = 320), H = (c.height = 180);
    ctx.imageSmoothingEnabled = false;
    type P = { x: number; y: number; vx: number; vy: number; life: number; col: string; sz: number; g: number };
    const ps: P[] = [];
    const COL = ['#ffe08a', '#ff5d5d', '#4da3ff', '#4fd36b', '#ffffff', '#c58bff', '#ff9a3a'];
    const burst = (x: number, y: number) => { const col = COL[Math.floor(Math.random() * COL.length)]!; for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, v = 0.6 + Math.random() * 1.4; ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 60 + Math.random() * 30, col, sz: 2, g: 0.02 }); } };
    const confetti = () => { for (let i = 0; i < 6; i++) ps.push({ x: Math.random() * W, y: -4, vx: (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 1.2, life: 160, col: COL[Math.floor(Math.random() * COL.length)]!, sz: Math.random() < 0.5 ? 2 : 3, g: 0 }); };
    let raf = 0, f = 0;
    const end = run === 1 ? 70 : Infinity; // run 1 = rajada curta; 2 = contínuo
    const tick = () => {
      f++;
      ctx.clearRect(0, 0, W, H);
      if ((mode !== 'fireworks') && f < end && f % 2 === 0) confetti();
      if ((mode !== 'confetti') && f % 28 === 1) burst(40 + Math.random() * (W - 80), 20 + Math.random() * 70);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]!; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--;
        if (p.life <= 0 || p.y > H + 4) { ps.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life / 30); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz);
      }
      ctx.globalAlpha = 1;
      if (f < end || ps.length || run === 2) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, run, reduceMotion]);
  return <canvas ref={ref} className="cer-particles" aria-hidden="true" />;
}

/**
 * Grande Final: cerimônia de prêmios. Cada categoria tem anúncio, suspense, revelação (os outros jogadores aparecem
 * discretos, o vencedor por último e em destaque) e a estrela voa para o placar. Depois, o ranking de baixo para cima
 * e o campeão. Tudo é calculado pelo servidor; aqui só se anima o que já foi decidido.
 */
export function FinalCeremony({ game, youId, isHost, onAgain, onLeave }: { game: PublicGame; youId: string | null; isHost: boolean; onAgain: () => void; onLeave: () => void }) {
  const { reduceMotion } = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  const awards = game.awards ?? [];
  const final = game.final ?? [];
  const players = game.players;
  const before = game.starsBeforeAwards ?? {};
  const pl = (id: string) => players.find((p) => p.id === id)!;

  const steps = useMemo<Step[]>(() => [{ k: 'intro' }, ...awards.flatMap((_, i) => [{ k: 'announce', i } as Step, { k: 'suspense', i } as Step, { k: 'reveal', i } as Step]), { k: 'rank' }, { k: 'champion' }], [awards.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [si, setSi] = useState(0);
  const [sub, setSub] = useState(0);       // revelações parciais dentro do passo (valores dos outros e depois o vencedor; linhas do ranking)
  const [burst, setBurst] = useState(0);
  const step = steps[si]!;
  const k = reduceMotion ? 0.55 : 1;

  const goto = useCallback((n: number) => { setSi(Math.max(0, Math.min(steps.length - 1, n))); setSub(0); }, [steps.length]);
  const next = useCallback(() => { setSi((v) => Math.min(steps.length - 1, v + 1)); setSub(0); }, [steps.length]);

  // quem aparece na revelação: os outros por ordem crescente de valor, vencedor por último
  const order = (a: AwardResult) => {
    const ids = players.map((p) => p.id);
    const others = ids.filter((id) => id !== a.winner).sort((x, y) => a.values[x]! - a.values[y]!);
    return { others, winner: a.winner };
  };
  const revealN = step.k === 'reveal' ? order(awards[step.i]!).others.length : 0;

  // relógio do passo atual
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ivs: ReturnType<typeof setInterval>[] = [];
    if (step.k === 'intro') { sfx.setTrack('suspense'); sfx.announce(2); timers.push(setTimeout(next, T.intro * k)); }
    else if (step.k === 'announce') { sfx.announce(step.i); timers.push(setTimeout(next, T.announce * k)); }
    else if (step.k === 'suspense') {
      sfx.setTrack('suspense'); sfx.drumRoll(T.suspense * k);
      timers.push(setTimeout(next, T.suspense * k));
    } else if (step.k === 'reveal') {
      const a = awards[step.i]!; const { others } = order(a);
      let n = 0;
      ivs.push(setInterval(() => { n++; setSub(n); if (n <= others.length) sfx.pick(); }, T.revealStep * k));
      timers.push(setTimeout(() => { if (a.winner) { sfx.revealHit(); sfx.starGet(); setBurst((b) => b + 1); } else sfx.miss(); if (a.tieNote) setTimeout(() => sfx.tieSting(), 500); }, T.revealStep * k * (others.length + 1)));
      timers.push(setTimeout(next, T.revealStep * k * (others.length + 1) + T.revealHold * k));
    } else if (step.k === 'rank') {
      let n = 0;
      ivs.push(setInterval(() => { n++; setSub(n); sfx.select(); }, T.rankRow * k));
      timers.push(setTimeout(next, T.rankRow * k * final.length + T.rankTail * k));
    } else if (step.k === 'champion') { sfx.setTrack('triumph'); sfx.fanfare(); setBurst((b) => b + 1); }
    return () => { timers.forEach(clearTimeout); ivs.forEach(clearInterval); };
  }, [si]); // eslint-disable-line react-hooks/exhaustive-deps

  // Espaço/Enter pula o passo atual
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (step.k !== 'champion') next(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, step.k]);

  // estrelas do placar: do tabuleiro + prêmios já revelados
  const revealedAwards = steps.slice(0, si + 1).reduce((acc, s, idx) => {
    if (s.k !== 'reveal') return acc;
    const done = idx < si || (idx === si && sub > order(awards[s.i]!).others.length);
    if (done) { const w = awards[s.i]!.winner; if (w) acc[w] = (acc[w] ?? 0) + 1; }
    return acc;
  }, {} as Record<string, number>);
  const afterAwards = step.k === 'rank' || step.k === 'champion';
  const starsNow = (id: string) => (before[id] ?? 0) + (afterAwards ? players.find((p) => p.id === id)!.stars - (before[id] ?? 0) : (revealedAwards[id] ?? 0));

  const award = step.k === 'announce' || step.k === 'suspense' || step.k === 'reveal' ? awards[step.i]! : null;
  const champion = final[0];
  const tieMsg = (s: Standing) => {
    if (!s.tie) return null;
    const same = final.filter((x) => x.stars === s.stars);
    const names = same.map((x) => `${pl(x.pid).name} (${x.coins})`).join(' x ');
    return s.tie === 'coins' ? `Empate em ${s.stars} estrelas: desempate por moedas do tabuleiro — ${names}` : s.tie === 'wins' ? `Empate em estrelas e moedas: desempate por minigames vencidos` : 'Empate total: dividem a colocação';
  };

  const card = (p: GPlayer, mode: 'hidden' | 'dim' | 'win' | 'idle', value?: number, unit?: string) => (
    <li key={p.id} className={`cer-card cer-${mode}${p.id === youId ? ' me' : ''}`} style={{ ['--c' as string]: SLOT_COLORS[p.slot] }}>
      <CharacterSprite id={p.characterId as CharacterId} anim={mode === 'win' ? 'celebrate' : mode === 'dim' ? 'lose' : 'idle'} scale={mode === 'win' ? 5 : 3} label={p.name} />
      <b className="cer-name">{p.name}</b>
      <span className="cer-val">{mode === 'hidden' ? '?' : mode === 'idle' ? '' : `${value} ${unit}`}</span>
      {mode === 'win' && <span className="cer-starfly" aria-hidden="true">★</span>}
    </li>
  );

  return (
    <div className="overlay cer" data-testid="final" role="dialog" aria-label="Grande Final">
      <div className="cer-bg" aria-hidden="true" />
      <Particles mode={step.k === 'champion' ? 'both' : 'confetti'} run={step.k === 'champion' ? 2 : burst > 0 ? 1 : 0} key={step.k === 'champion' ? 'champ' : `b${burst}`} />

      <header className="cer-head">
        <h2 className="cer-title">GRANDE FINAL</h2>
        <ul className="cer-tally" aria-label="Placar de estrelas">
          {players.map((p) => (
            <li key={p.id} style={{ borderColor: SLOT_COLORS[p.slot] }} className={p.id === youId ? 'me' : ''}>
              <span>{p.name}</span><b key={starsNow(p.id)} className="cer-pop">★ {starsNow(p.id)}</b>
            </li>
          ))}
        </ul>
      </header>

      <main className="cer-main">
        {step.k === 'intro' && (
          <div className="cer-intro"><p className="cer-big">A jornada chegou ao fim!</p><p>Vamos premiar o que cada aventureiro fez ao longo da partida.<br />Cada prêmio vale <b>1 estrela</b>.</p></div>
        )}

        {award && (
          <section className="cer-award" aria-live="polite">
            <p className="cer-kicker">Prêmio {step.k !== 'intro' ? (step as { i: number }).i + 1 : ''} de {awards.length}</p>
            <h3 className="cer-award-title"><PixelIcon name={award.id} size="1.3em" /> {award.title}</h3>
            <p className="cer-desc">{award.desc}</p>
            {step.k === 'suspense' && <p className="cer-drum" aria-hidden="true"><i /><i /><i /><i /><i /></p>}
            {step.k === 'suspense' && <p className="cer-who">E o vencedor é…</p>}
            <ul className={`cer-cards${step.k === 'suspense' ? ' cer-shake' : ''}`}>
              {step.k !== 'reveal' && players.map((p) => card(p, 'hidden'))}
              {step.k === 'reveal' && (() => {
                const { others, winner } = order(award);
                const shownOthers = others.slice(0, sub);
                const showWinner = sub > others.length;
                // posição fixa dos jogadores; quem ainda não foi revelado fica "?"
                return players.map((p) => {
                  if (p.id === winner) return showWinner ? card(p, 'win', award.values[p.id], award.unit) : card(p, 'hidden');
                  return shownOthers.includes(p.id) ? card(p, 'dim', award.values[p.id], award.unit) : card(p, 'hidden');
                });
              })()}
            </ul>
            {step.k === 'reveal' && sub > revealN && (
              <p className="cer-winner cer-pop">{award.winner ? <>{pl(award.winner).name} ganha a estrela! ★</> : 'Ninguém levou esta estrela'}</p>
            )}
            {step.k === 'reveal' && sub > revealN && award.tieNote && <p className="cer-tie" data-testid="tie-note"><PixelIcon name="empate" /> {award.tieNote}</p>}
            {step.k === 'reveal' && sub > revealN && !award.winner && !award.tieNote && <p className="cer-tie">Ninguém pontuou nesta categoria.</p>}
          </section>
        )}

        {(step.k === 'rank' || step.k === 'champion') && (
          <section className="cer-rank">
            {step.k === 'champion' && champion && (
              <div className="cer-champ">
                <CharacterSprite id={pl(champion.pid).characterId as CharacterId} anim="celebrate" scale={6} label={pl(champion.pid).name} />
                <p className="cer-big cer-pop">{pl(champion.pid).name} é o campeão!</p>
                {final.filter((x) => x.rank === 1).length > 1 && <p className="cer-tie">Empate total no 1º lugar: vitória compartilhada!</p>}
              </div>
            )}
            <ol className="cer-list">
              {final.map((s, idx) => {
                const shown = step.k === 'champion' || sub > final.length - 1 - idx; // aparece de baixo para cima (4º primeiro)
                const p = pl(s.pid);
                return (
                  <li key={s.pid} className={`cer-row${shown ? ' on' : ''}${s.rank === 1 ? ' first' : ''}${s.pid === youId ? ' me' : ''}`} style={{ ['--c' as string]: SLOT_COLORS[p.slot] }}>
                    <span className="cer-pos">{s.rank}º</span>
                    <span className="cer-rname">{p.name}</span>
                    <span className="cer-rstars">★ {s.stars}</span>
                    <span className="cer-rcoins">{s.coins} moedas</span>
                    <small className="cer-rdet">{s.boardStars} no tabuleiro + {s.awardStars} em prêmios · {s.wins} minigame(s) vencido(s)</small>
                    {shown && tieMsg(s) && <small className="cer-tie" data-testid="rank-tie"><PixelIcon name="empate" /> {tieMsg(s)}</small>}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </main>

      <footer className="cer-foot">
        {step.k !== 'champion' ? (
          <>
            <button className="btn btn-sm" onClick={() => { sfx.click(); next(); }}>Próximo ▶ <kbd>Espaço</kbd></button>
            <button className="btn btn-sm" data-testid="cer-skip" onClick={() => { sfx.click(); goto(steps.length - 1); }}>Pular para o resultado</button>
          </>
        ) : (
          <>
            {isHost && <button className="btn btn-gold" data-testid="again" onClick={onAgain}>Jogar novamente</button>}
            {!isHost && <span className="hint">O anfitrião escolhe jogar novamente.</span>}
            <button className="btn btn-sm" onClick={() => { sfx.click(); goto(0); }}>Rever cerimônia</button>
            <button className="btn btn-sm" onClick={onLeave}>Sair da sala</button>
          </>
        )}
      </footer>
    </div>
  );
}
