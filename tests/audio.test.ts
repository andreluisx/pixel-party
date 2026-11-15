import { describe, it, expect } from 'vitest';
import { TRACK_IDS, trackInfo, sfx } from '../src/game/audio/sfx';

describe('músicas procedurais', () => {
  it('tem as 5 faixas e cada uma fecha em compassos de 8 colcheias', () => {
    expect(TRACK_IDS.sort()).toEqual(['board', 'menu', 'minigame', 'suspense', 'triumph']);
    for (const id of TRACK_IDS) {
      const { steps, bpm } = trackInfo(id);
      expect(steps % 8, id).toBe(0);
      expect(bpm).toBeGreaterThan(60);
    }
  });
  it('trocar de faixa sem contexto de áudio não quebra (servidor/testes)', () => {
    sfx.setTrack('board');
    expect(sfx.currentTrack).toBe('board');
    sfx.setTrack('menu');
    expect(() => { sfx.drumRoll(500); sfx.fanfare(); sfx.revealHit(); }).not.toThrow();
  });
});
