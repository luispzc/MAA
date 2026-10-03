import {
  getCombatant,
  isAlive,
  propertyName,
  staminaCost,
  statusName,
  type Ability,
  type BattleState,
  type Combatant,
} from '@maa/shared';

/**
 * Textos y listas que muestra la interfaz de batalla. Son funciones puras sobre
 * el estado del motor, para poder probarlas sin navegador.
 */

/** Quien actúa ahora y los siguientes turnos (vivos), hasta `max`. */
export function upcomingTurns(state: BattleState, max = 7): Combatant[] {
  const order = state.turnOrder;
  const upcoming: Combatant[] = [];
  for (let i = state.turnIndex; upcoming.length < max && i < state.turnIndex + order.length * 2; i++) {
    const c = getCombatant(state, order[i % order.length]);
    if (isAlive(c)) upcoming.push(c);
  }
  return upcoming;
}

/** "Sangrado x2 3  Fijado 1": efectos activos con acumulaciones y turnos restantes. */
export function statusSummary(state: BattleState, c: Combatant): string {
  return c.statuses.map((s) => `${statusName(state, s.id)}${s.stacks > 1 ? ` x${s.stacks}` : ''} ${s.turnsLeft}`).join('  ');
}

const EFFECT_TARGET = { target: 'Objetivo', self: 'Propio', all_allies: 'Equipo' } as const;

/** Líneas de la ficha de una habilidad (sin el título). */
export function abilityTooltipLines(state: BattleState, actor: Combatant, ability: Ability): string[] {
  const cd = actor.cooldowns[ability.id] ?? 0;
  const cost = staminaCost(actor, ability);
  const stats = [
    cost ? `${cost} stamina (${ability.staminaCostPercent}%)` : 'Sin coste',
    ability.damage
      ? `Daño ${ability.damage.min}-${ability.damage.max}${ability.damageEstimated ? '*' : ''}${ability.hits > 1 ? ` en ${ability.hits} golpes` : ''}`
      : null,
    ability.damage ? `Acierto ${ability.accuracy}% · Crítico ${ability.critChance}%` : null,
    ability.cooldown ? `Cooldown ${ability.cooldown} ronda${ability.cooldown > 1 ? 's' : ''}` : null,
    cd > 0 ? `Lista en ${cd} turno${cd > 1 ? 's' : ''}` : null,
  ].filter(Boolean);
  const effects = ability.effects.map((e) => {
    const chance = e.chance < 1 ? ` (${Math.round(e.chance * 100)}%)` : '';
    const stacks = e.stacks > 1 ? ` x${e.stacks}` : '';
    const turns = e.duration > 0 ? `, ${e.duration} t` : '';
    return `${EFFECT_TARGET[e.target]}: ${statusName(state, e.id)}${stacks}${turns}${chance}`;
  });
  return [
    stats.join(' · '),
    ability.properties.length ? ability.properties.map(propertyName).join(' · ') : null,
    ...effects,
    ability.description,
    ability.damageEstimated ? '* Daño estimado: la ficha original no lo trae.' : null,
  ].filter((l): l is string => !!l);
}
