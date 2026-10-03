import type { Ability, ClassesFile, Hero, StatusDefinition } from './game';

/**
 * Respuestas de la API del servidor (server/). La web solo conoce estos tipos,
 * no los JSON de /data.
 */

/** GET /api/game-data: todo lo que necesita el juego para arrancar, en una sola petición. */
export interface GameData {
  classes: ClassesFile;
  heroes: Hero[];
  abilities: Ability[];
  statuses: StatusDefinition[];
}

/** GET /api/heroes/:id: el héroe con sus habilidades ya resueltas. */
export interface HeroDetail extends Hero {
  abilities: Ability[];
}

/** Cuerpo de cualquier respuesta con error. */
export interface ApiError {
  error: string;
}
