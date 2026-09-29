/** Generador de números aleatorios. Devuelve un valor en [0, 1). */
export type Rng = () => number;

/** RNG con semilla (mulberry32). Útil para pruebas y repeticiones deterministas. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero aleatorio entre min y max, ambos incluidos. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
