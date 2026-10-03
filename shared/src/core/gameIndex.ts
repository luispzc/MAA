import type { GameData } from '../types/api';
import type { CombatData } from './combat/battle';

/** Los datos del juego con búsquedas por id, listos para el motor de combate. */
export interface GameIndex extends GameData, CombatData {
  heroById: ReadonlyMap<string, GameData['heroes'][number]>;
}

export function indexGameData(data: GameData): GameIndex {
  return {
    ...data,
    heroById: new Map(data.heroes.map((h) => [h.id, h])),
    abilityById: new Map(data.abilities.map((a) => [a.id, a])),
    statusById: new Map(data.statuses.map((s) => [s.id, s])),
  };
}
