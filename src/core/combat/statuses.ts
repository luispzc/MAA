import type { Combatant, StatusId } from './types';

/** Fracción de la vida máxima que quitan o curan los efectos por turno. */
export const TICK_FRACTION: Partial<Record<StatusId, number>> = {
  bleed: 0.06,
  regeneration: 0.08,
};

export const DEBUFFS: ReadonlySet<string> = new Set<StatusId>([
  'stun',
  'bleed',
  'attack_down',
  'defense_down',
  'accuracy_down',
]);

export const STATUS_NAMES: Record<StatusId, string> = {
  stun: 'Aturdido',
  bleed: 'Sangrado',
  regeneration: 'Regeneración',
  attack_up: 'Ataque +',
  attack_down: 'Ataque −',
  defense_up: 'Defensa +',
  defense_down: 'Defensa −',
  accuracy_up: 'Precisión +',
  accuracy_down: 'Precisión −',
};

export function hasStatus(c: Combatant, id: StatusId): boolean {
  return c.statuses.some((s) => s.id === id);
}

/**
 * Aplica (o refresca) un efecto. No se acumulan: si ya existe, se queda con la
 * duración mayor.
 */
export function addStatus(c: Combatant, id: string, duration: number): void {
  const existing = c.statuses.find((s) => s.id === id);
  if (existing) {
    existing.turnsLeft = Math.max(existing.turnsLeft, duration);
  } else {
    c.statuses.push({ id, turnsLeft: duration });
  }
}

export function attackModifier(c: Combatant): number {
  let mod = 1;
  if (hasStatus(c, 'attack_up')) mod *= 1.25;
  if (hasStatus(c, 'attack_down')) mod *= 0.75;
  return mod;
}

export function defenseModifier(c: Combatant): number {
  let mod = 1;
  if (hasStatus(c, 'defense_up')) mod *= 1.5;
  if (hasStatus(c, 'defense_down')) mod *= 0.6;
  return mod;
}

/** Puntos de precisión que suman o restan los efectos. */
export function accuracyBonus(c: Combatant): number {
  let bonus = 0;
  if (hasStatus(c, 'accuracy_up')) bonus += 15;
  if (hasStatus(c, 'accuracy_down')) bonus -= 25;
  return bonus;
}
