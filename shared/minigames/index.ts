import type { MinigameDefinition } from '../minigame';
import { cacaMoedas } from './caca-moedas';
import { pisoLed } from './piso-led';
import { ultimoDisparo } from './ultimo-disparo';
import { quebraCabeca } from './quebra-cabeca';
import { dueloArqueiros } from './duelo-arqueiros';
import { corridaMaluca } from './corrida-maluca';
import { chuvaDePedras } from './chuva-de-pedras';
import { futebolBotao } from './futebol-botao';

// Novos minigames entram aqui (um arquivo por minigame, um registro por linha).
const ALL: MinigameDefinition<any, any>[] = [corridaMaluca, cacaMoedas, pisoLed, ultimoDisparo, quebraCabeca, dueloArqueiros, chuvaDePedras, futebolBotao];

export const MINIGAMES: Record<string, MinigameDefinition<any, any>> = Object.fromEntries(ALL.map((m) => [m.id, m]));
export const MINIGAME_LIST = ALL;
export function getMinigame(id: string): MinigameDefinition<any, any> | undefined {
  return MINIGAMES[id];
}
