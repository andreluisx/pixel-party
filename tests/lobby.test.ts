import { describe, expect, it } from 'vitest';
import { canStart, emptyLobby, firstFreeCharacter, pickCharacter, releaseSlot, seatHuman, setBotDifficulty } from '../shared/lobby';
import { CHARACTER_IDS } from '../shared/characters';

const withHumans = (n: number) => {
  let ps = emptyLobby();
  for (let i = 0; i < n; i++) ps = seatHuman(ps, i as 0 | 1 | 2 | 3, `h${i}`, `J${i}`);
  return ps;
};

describe('lobby', () => {
  it('sala nova tem 4 bots com personagens diferentes', () => {
    const ps = emptyLobby();
    expect(ps).toHaveLength(4);
    expect(ps.every((p) => p.isBot && p.ready)).toBe(true);
    expect(new Set(ps.map((p) => p.characterId)).size).toBe(4);
  });
  it('humano toma o lugar do bot e mantém personagens únicos', () => {
    const ps = withHumans(3);
    expect(ps.filter((p) => !p.isBot)).toHaveLength(3);
    expect(new Set(ps.map((p) => p.characterId)).size).toBe(4);
  });
  it('não deixa dois humanos com o mesmo personagem', () => {
    const ps = withHumans(2);
    const other = ps[1]!.characterId;
    expect(pickCharacter(ps, 'h0', other)).toBeNull();
  });
  it('trocar por personagem de bot faz o bot ficar com o largado', () => {
    const ps = withHumans(1);
    const botChar = ps[1]!.characterId;
    const mine = ps[0]!.characterId;
    const next = pickCharacter(ps, 'h0', botChar)!;
    expect(next[0]!.characterId).toBe(botChar);
    expect(next[1]!.characterId).toBe(mine);
    expect(new Set(next.map((p) => p.characterId)).size).toBe(4);
  });
  it('personagem livre (dos 6) pode ser escolhido', () => {
    const ps = withHumans(1);
    const free = firstFreeCharacter(ps);
    expect(CHARACTER_IDS).toContain(free);
    expect(pickCharacter(ps, 'h0', free)![0]!.characterId).toBe(free);
  });
  it('rejeita personagem inválido', () => {
    expect(pickCharacter(withHumans(1), 'h0', 'dragao')).toBeNull();
    expect(pickCharacter(withHumans(1), 'h0', 42)).toBeNull();
  });
  it('início exige todos os humanos prontos e conectados', () => {
    let ps = withHumans(2);
    expect(canStart(ps).ok).toBe(false);
    ps = ps.map((p) => (p.isBot ? p : { ...p, ready: true }));
    expect(canStart(ps).ok).toBe(true);
    ps = ps.map((p) => (p.id === 'h1' ? { ...p, connected: false } : p));
    expect(canStart(ps).ok).toBe(false);
  });
  it('sem humanos não inicia', () => { expect(canStart(emptyLobby()).ok).toBe(false); });
  it('vaga liberada volta a ser bot', () => {
    const ps = releaseSlot(withHumans(2), 1, 'hard');
    expect(ps[1]!.isBot).toBe(true);
    expect(ps[1]!.difficulty).toBe('hard');
  });
  it('dificuldade só muda em bots', () => {
    const ps = withHumans(1);
    expect(setBotDifficulty(ps, 0, 'hard')).toBeNull();
    expect(setBotDifficulty(ps, 2, 'hard')![2]!.difficulty).toBe('hard');
  });
});
