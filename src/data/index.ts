import type { AbilitiesFile, ClassesFile, HeroesFile, StatusesFile } from '../types/game';
// Los JSON viven en /data en la raíz para compartirlos con la versión Unity.
import classesJson from '../../data/classes.json';
import heroesJson from '../../data/heroes.json';
import abilitiesJson from '../../data/abilities.json';
import statusesJson from '../../data/statuses.json';

export const classesData = classesJson as ClassesFile;
export const heroes = (heroesJson as HeroesFile).heroes;
export const abilities = (abilitiesJson as AbilitiesFile).abilities;
export const statuses = (statusesJson as StatusesFile).statuses;

export const heroById = new Map(heroes.map((h) => [h.id, h]));
export const abilityById = new Map(abilities.map((a) => [a.id, a]));
export const statusById = new Map(statuses.map((s) => [s.id, s]));
