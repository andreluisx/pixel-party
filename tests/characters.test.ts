import { describe, expect, it } from 'vitest';
import { silhouetteSignature, validateCharacterMaps } from '../src/game/art/characters';
import { CHARACTER_IDS, CHARACTERS } from '../shared/characters';

describe('personagens', () => {
  it('mapas têm as dimensões e cores corretas', () => { expect(validateCharacterMaps()).toEqual([]); });
  it('são 6, com silhuetas todas diferentes', () => {
    expect(CHARACTER_IDS).toHaveLength(6);
    expect(CHARACTERS).toHaveLength(6);
    expect(new Set(CHARACTER_IDS.map(silhouetteSignature)).size).toBe(6);
  });
});
