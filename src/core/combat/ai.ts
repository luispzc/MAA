import type { Ability } from '../../types/game';
import { canUseAbility, currentActor, isAlive, matchupBetween, selectableTargets } from './battle';
import type { Action, BattleState, Combatant } from './types';

/** Valor estimado de una habilidad para la IA (mayor es mejor). */
function scoreAbility(state: BattleState, actor: Combatant, ability: Ability): number {
  const enemies = state.combatants.filter((c) => c.team !== actor.team && isAlive(c)).length;
  let score = 0;
  if (ability.damage) {
    score = ((ability.damage.min + ability.damage.max) / 2) * ability.hits;
    if (ability.target === 'all_enemies') score *= enemies;
  }
  for (const effect of ability.effects) {
    if (effect.id === 'regeneration') {
      // Curarse solo vale la pena con poca vida.
      score += actor.hp / actor.stats.health < 0.5 ? 400 : -100;
    } else if (ability.target === 'self' || ability.target === 'all_allies') {
      const already = actor.statuses.some((s) => s.id === effect.id);
      score += already ? -100 : 150;
    } else {
      score += 60 * effect.chance * (ability.target === 'all_enemies' ? enemies : 1);
    }
  }
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
  if (usable.length === 0) throw new Error(`${actor.name} no tiene habilidades disponibles`);
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
