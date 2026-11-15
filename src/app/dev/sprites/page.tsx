'use client';
import { CHARACTER_IDS } from '@shared/characters';
import { ANIM_ORDER, ANIMS } from '@/game/art/characters';
import { CharacterSprite } from '@/components/CharacterSprite';

/** Ferramenta de desenvolvimento: todos os personagens × todas as animações, em escala grande. */
export default function SpritesPage() {
  return (
    <main style={{ padding: 16, background: '#2a1f5c', minHeight: '100vh', color: '#f6ecd2', fontFamily: 'monospace' }}>
      <h1>Sprites (dev)</h1>
      <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${ANIM_ORDER.length}, 1fr)`, gap: 8, alignItems: 'end' }}>
        <span />
        {ANIM_ORDER.map((a) => <b key={a}>{ANIMS[a].label}</b>)}
        {CHARACTER_IDS.map((id) => (
          <div key={id} style={{ display: 'contents' }} data-testid={`row-${id}`}>
            <b>{id}</b>
            {ANIM_ORDER.map((a) => <CharacterSprite key={a} id={id} anim={a} scale={6} />)}
          </div>
        ))}
      </div>
    </main>
  );
}
