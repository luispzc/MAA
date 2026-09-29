// Tipos compartidos del juego. Los JSON de src/data deben cumplir estas formas.

export type HeroClassId =
  | 'bruiser'
  | 'blaster'
  | 'tactician'
  | 'scrapper'
  | 'infiltrator'
  | 'generalist';

export interface HeroClass {
  id: HeroClassId;
  name: string;
  description: string;
  /** Clase contra la que esta clase tiene ventaja (null para Generalist). */
  strongAgainst: HeroClassId | null;
  /** Efecto pasivo que se aplica al atacar con ventaja. */
  advantageBonus: string;
}

export interface ClassAdvantageRules {
  /** Multiplicador de daño al atacar con ventaja de clase. */
  advantageDamageMultiplier: number;
  /** Multiplicador de daño al atacar con desventaja de clase. */
  disadvantageDamageMultiplier: number;
}

export interface ClassesFile {
  rules: ClassAdvantageRules;
  classes: HeroClass[];
}

export interface HeroStats {
  health: number;
  stamina: number;
  attack: number;
  defense: number;
  accuracy: number;
  evasion: number;
}

export interface Hero {
  id: string;
  name: string;
  classId: HeroClassId;
  description: string;
  baseStats: HeroStats;
  abilityIds: string[];
}

export type AbilityType = 'melee' | 'ranged' | 'buff' | 'debuff' | 'heal';
export type AbilityTarget = 'single_enemy' | 'all_enemies' | 'self' | 'single_ally' | 'all_allies';

export interface AbilityEffect {
  id: string;
  /** Turnos que dura el efecto (0 = instantáneo). */
  duration: number;
  /** Probabilidad de aplicarse, de 0 a 1. */
  chance: number;
}

export interface Ability {
  id: string;
  heroId: string;
  name: string;
  type: AbilityType;
  target: AbilityTarget;
  staminaCost: number;
  /** Turnos de espera tras usarla (0 = sin cooldown). */
  cooldown: number;
  damage: { min: number; max: number } | null;
  hits: number;
  effects: AbilityEffect[];
  description: string;
}

export interface HeroesFile {
  heroes: Hero[];
}

export interface AbilitiesFile {
  abilities: Ability[];
}
