import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AbilitiesFile, ClassesFile, GameData, HeroesFile, StatusesFile } from '@maa/shared';
import { validateGameData } from './validate';

const FILES = ['classes.json', 'heroes.json', 'abilities.json', 'statuses.json'] as const;

function readJson<T>(dir: string, file: string): T {
  const path = join(dir, file);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    throw new Error(`No se pudo leer ${path}: ${(err as Error).message}`);
  }
}

/** Lee los JSON de la carpeta de datos y los junta en un GameData. */
export function loadGameData(dir: string): GameData {
  return {
    classes: readJson<ClassesFile>(dir, 'classes.json'),
    heroes: readJson<HeroesFile>(dir, 'heroes.json').heroes,
    abilities: readJson<AbilitiesFile>(dir, 'abilities.json').abilities,
    statuses: readJson<StatusesFile>(dir, 'statuses.json').statuses,
  };
}

export class InvalidGameDataError extends Error {
  constructor(readonly problems: string[]) {
    super(`Los datos del juego tienen ${problems.length} problema(s):\n- ${problems.join('\n- ')}`);
  }
}

/** Lee y valida; lanza InvalidGameDataError si algo no cuadra. */
export function loadValidGameData(dir: string): GameData {
  const data = loadGameData(dir);
  const problems = validateGameData(data);
  if (problems.length) throw new InvalidGameDataError(problems);
  return data;
}

/**
 * Fuente de datos que se recarga sola cuando cambia algún JSON, para poder
 * editar /data sin reiniciar el servidor. Si la edición deja los datos rotos,
 * sigue sirviendo la última versión buena y avisa por consola.
 */
export function createDataSource(dir: string, onError: (err: Error) => void = () => {}): () => GameData {
  const stamp = () => FILES.map((f) => statSync(join(dir, f)).mtimeMs).join(',');
  let current = loadValidGameData(dir);
  let currentStamp = stamp();
  return () => {
    const now = stamp();
    if (now !== currentStamp) {
      currentStamp = now;
      try {
        current = loadValidGameData(dir);
      } catch (err) {
        onError(err as Error);
      }
    }
    return current;
  };
}
