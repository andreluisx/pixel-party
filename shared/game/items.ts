export type ItemId = 'cogumelo' | 'ima' | 'pocao' | 'escudo' | 'dado';
export const MAX_ITEMS = 2;
export interface ItemDef { id: ItemId; name: string; price: number; icon: string; /* nome do ícone de pixel (PixelIcon) */ desc: string; /** true = ativado automaticamente (não se usa à mão) */ passive?: boolean }
export const ITEMS: Record<ItemId, ItemDef> = {
  cogumelo: { id: 'cogumelo', name: 'Cogumelo Veloz', price: 8, icon: 'cogumelo', desc: 'Rola dois dados e você escolhe um dos resultados.' },
  ima: { id: 'ima', name: 'Ímã de Moedas', price: 10, icon: 'ima', desc: 'Rouba 5 moedas de um adversário (o Escudo bloqueia).' },
  pocao: { id: 'pocao', name: 'Poção de Teleporte', price: 9, icon: 'pocao', desc: 'Em vez de rolar, escolha um ponto de teleporte do mapa.' },
  escudo: { id: 'escudo', name: 'Escudo', price: 7, icon: 'escudo', desc: 'Bloqueia sozinho um roubo ou uma armadilha.', passive: true },
  dado: { id: 'dado', name: 'Dado Especial', price: 6, icon: 'dado', desc: 'Escolha um resultado de 1 a 3 em vez de rolar.' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
