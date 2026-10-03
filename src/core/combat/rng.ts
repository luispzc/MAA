/**
 * Generador pseudoaleatorio determinista (mulberry32). El estado vive dentro de
 * BattleState, así una batalla con la misma semilla se reproduce igual en tests.
 */
export function nextRandom(state: { rngState: number }): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
