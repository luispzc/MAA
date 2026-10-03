import type { Ability } from '../../types/game';
import { canUseAbility, currentActor, hasProperty, isAlive, matchupBetween, REST_ABILITY, selectableTargets } from './battle';
import { hasStatus, isBuff } from './statuses';
import type { Action, BattleState, Combatant } from './types';

/** Valor estimado de una habilidad para la IA (mayor es mejor). */
function scoreAbility(state: BattleState, actor: Combatant, ability: Ability): number {
  if (ability.id === REST_ABILITY.id) return -1;
  const enemies = state.combatants.filter((c) => c.team !== actor.team && isAlive(c));
  const allies = state.combatants.filter((c) => c.team === actor.team && isAlive(c)).length;
  let score = 0;
  if (ability.damage) {
    score = ((ability.damage.min + ability.damage.max) / 2) * (ability.accuracy / 100);
    if (ability.target === 'all_enemies') score *= enemies.length * 0.8;
  }
  for (const effect of ability.effects) {
    const def = state.statusById.get(effect.id);
    const onEnemy = effect.target === 'target' && (ability.target === 'single_enemy' || ability.target === 'all_enemies');
    if (def?.kind === 'instant') {
      // Quitar mejoras solo vale si algún enemigo tiene alguna.
      score += enemies.some((e) => e.statuses.some((s) => isBuff(state, s.id))) ? 150 : 0;
    } else if (onEnemy) {
      score += 80 * effect.chance * (ability.target === 'all_enemies' ? enemies.length : 1);
    } else {
      const self = effect.target === 'self' || ability.target === 'self';
      const already = self && hasStatus(actor, effect.id) && (def?.maxStacks ?? 1) <= 1;
      score += already ? -100 : 150 * (effect.target === 'all_allies' || ability.target === 'all_allies' ? allies : 1);
    }
  }
  // Las acciones rápidas no gastan el turno: casi siempre conviene usarlas primero.
  if (hasProperty(ability, 'quick_action') && score > 0) score += 2000;
  return score;
}

/** Enemigo preferido: con ventaja de clase primero, luego el de menos vida. */
function pickEnemy(state: BattleState, actor: Combatant, candidates: Combatant[]): Combatant {
  const rank = (c: Combatant) => ({ advantage: 0, neutral: 1, disadvantage: 2 })[matchupBetween(state, actor, c)];
  return [...candidates].sort((a, b) => rank(a) - rank(b) || a.hp - b.hp)[0];
}

/** Elige una acción razonable para quien tenga el turno. Es determinista. */
export function chooseAiAction(state: BattleState): Action {
  const actor = currentActor(state);
  if (!actor) throw new Error('La batalla ya terminó');

  const usable = actor.abilities.filter((a) => canUseAbility(actor, a));
  const ability = [...usable].sort((a, b) => scoreAbility(state, actor, b) - scoreAbility(state, actor, a))[0];

  const candidates = selectableTargets(state, actor, ability);
  let targetUid: string | undefined;
  if (ability.target === 'single_enemy') {
    targetUid = pickEnemy(state, actor, candidates).uid;
  } else if (ability.target === 'single_ally') {
    targetUid = [...candidates].sort((a, b) => a.hp / a.stats.health - b.hp / b.stats.health)[0].uid;
  }
  return { actorUid: actor.uid, abilityId: ability.id, targetUid };
}
