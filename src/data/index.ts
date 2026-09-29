import type { AbilitiesFile, ClassesFile, HeroesFile } from '../types/game';
// Los JSON viven en /data en la raíz para compartirlos con la versión Unity.
import classesJson from '../../data/classes.json';
import heroesJson from '../../data/heroes.json';
import abilitiesJson from '../../data/abilities.json';

export const classesData = classesJson as ClassesFile;
export const heroes = (heroesJson as HeroesFile).heroes;
export const abilities = (abilitiesJson as AbilitiesFile).abilities;

export const heroById = new Map(heroes.map((h) => [h.id, h]));
export const abilityById = new Map(abilities.map((a) => [a.id, a]));
