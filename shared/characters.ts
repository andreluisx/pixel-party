export const CHARACTER_IDS = ['explorador', 'aventureira', 'mago', 'arqueiro', 'robo', 'gosma'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export interface CharacterInfo { id: CharacterId; name: string; title: string; blurb: string }

export const CHARACTERS: readonly CharacterInfo[] = [
  { id: 'explorador', name: 'Teco', title: 'Pequeno explorador', blurb: 'Chapéu de aventura e curiosidade de sobra. Sempre acha um atalho.' },
  { id: 'aventureira', name: 'Mel', title: 'Aventureira', blurb: 'Laços vermelhos e passo ligeiro. Nunca recusa um desafio.' },
  { id: 'mago', name: 'Barnabé', title: 'Mago de bolso', blurb: 'Barba branca e chapéu pontudo. Diz que tudo foi planejado.' },
  { id: 'arqueiro', name: 'Pip', title: 'Arqueiro do bosque', blurb: 'Capuz verde, olho atento. Aparece quando menos se espera.' },
  { id: 'robo', name: 'Bit', title: 'Robozinho', blurb: 'Feito de sucata e boa vontade. Calcula tudo, menos a sorte.' },
  { id: 'gosma', name: 'Gosmo', title: 'Criaturinha verde', blurb: 'Mole, brilhante e muito simpática. Deixa um rastro de alegria.' },
];

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && (CHARACTER_IDS as readonly string[]).includes(v);
}
