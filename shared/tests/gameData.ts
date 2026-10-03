import type { AbilitiesFile, ClassesFile, HeroesFile, StatusesFile } from '../src/types/game';
import { indexGameData } from '../src/core/gameIndex';
// En el juego los datos llegan por la API; en las pruebas del motor se leen directo de /data.
import classesJson from '../../data/classes.json';
import heroesJson from '../../data/heroes.json';
import abilitiesJson from '../../data/abilities.json';
import statusesJson from '../../data/statuses.json';

export const gameData = indexGameData({
  classes: classesJson as ClassesFile,
  heroes: (heroesJson as HeroesFile).heroes,
  abilities: (abilitiesJson as AbilitiesFile).abilities,
  statuses: (statusesJson as StatusesFile).statuses,
});
export const { abilities, abilityById, heroById, statusById } = gameData;
export const classesData = gameData.classes;
