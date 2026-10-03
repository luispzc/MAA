import type { ClassAdvantageRules, HeroClass, HeroClassId } from '../types/game';

export type ClassMatchup = 'advantage' | 'disadvantage' | 'neutral';

/** Indica si el atacante tiene ventaja, desventaja o ninguna sobre el defensor. */
export function getMatchup(
  classes: HeroClass[],
  attacker: HeroClassId,
  defender: HeroClassId,
): ClassMatchup {
  const byId = new Map(classes.map((c) => [c.id, c]));
  if (byId.get(attacker)?.strongAgainst === defender) return 'advantage';
  if (byId.get(defender)?.strongAgainst === attacker) return 'disadvantage';
  return 'neutral';
}

/** Multiplicador de daño que corresponde a un enfrentamiento de clases. */
export function getDamageMultiplier(rules: ClassAdvantageRules, matchup: ClassMatchup): number {
  if (matchup === 'advantage') return rules.advantageDamageMultiplier;
  if (matchup === 'disadvantage') return rules.disadvantageDamageMultiplier;
  return 1;
}
