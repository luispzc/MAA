import { indexGameData, type ApiError, type GameData, type GameIndex } from '@maa/shared';

/** Cliente de la API del servidor. En desarrollo Vite la redirige a server/ (ver vite.config.ts). */

export class ApiRequestError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    throw new ApiRequestError('No se pudo conectar con el servidor. ¿Está corriendo `npm run dev`?');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(body?.error ?? `El servidor respondió ${res.status} en ${path}`);
  }
  return (await res.json()) as T;
}

/** Datos del juego (clases, héroes, habilidades, efectos) con búsquedas por id. */
export async function fetchGameData(): Promise<GameIndex> {
  return indexGameData(await getJson<GameData>('/api/game-data'));
}
