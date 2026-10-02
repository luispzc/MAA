import type { StatusModifiers } from '../../types/game';
import type { BattleState, Combatant, StatusEffect } from './types';

type NumericModifier = { [K in keyof StatusModifiers]-?: NonNullable<StatusModifiers[K]> extends number ? K : never }[keyof StatusModifiers];
type FlagModifier = { [K in keyof StatusModifiers]-?: NonNullable<StatusModifiers[K]> extends boolean ? K : never }[keyof StatusModifiers];

export function statusName(state: BattleState, id: string): string {
  return state.statusById.get(id)?.name ?? id;
}

export function isDebuff(state: BattleState, id: string): boolean {
  return state.statusById.get(id)?.kind === 'debuff';
}

export function isBuff(state: BattleState, id: string): boolean {
  return state.statusById.get(id)?.kind === 'buff';
}

export function getStatus(c: Combatant, id: string): StatusEffect | undefined {
  return c.statuses.find((s) => s.id === id);
}

export function hasStatus(c: Combatant, id: string): boolean {
  return c.statuses.some((s) => s.id === id);
}

export function stacksOf(c: Combatant, id: string): number {
  return getStatus(c, id)?.stacks ?? 0;
}

/** Suma de un modificador numérico en todos los efectos del combatiente (por acumulación). */
export function sumModifier(state: BattleState, c: Combatant, key: NumericModifier): number {
  let total = 0;
  for (const s of c.statuses) total += (state.statusById.get(s.id)?.modifiers[key] ?? 0) * s.stacks;
  return total;
}

/** Si algún efecto del combatiente activa la marca. */
export function hasFlag(state: BattleState, c: Combatant, key: FlagModifier): boolean {
  return c.statuses.some((s) => state.statusById.get(s.id)?.modifiers[key] === true);
}

/**
 * Aplica (o refresca) un efecto. Si ya existe, suma acumulaciones hasta su
 * máximo y se queda con la duración mayor.
 */
export function addStatus(state: BattleState, c: Combatant, id: string, duration: number, stacks = 1): StatusEffect {
  const max = state.statusById.get(id)?.maxStacks ?? 1;
  const existing = getStatus(c, id);
  if (existing) {
    existing.turnsLeft = Math.max(existing.turnsLeft, duration);
    existing.stacks = Math.min(max, existing.stacks + stacks);
    return existing;
  }
  const status = { id, turnsLeft: duration, stacks: Math.min(max, stacks) };
  c.statuses.push(status);
  return status;
}

export function removeStatus(c: Combatant, id: string): boolean {
  const i = c.statuses.findIndex((s) => s.id === id);
  if (i < 0) return false;
  c.statuses.splice(i, 1);
  return true;
}
