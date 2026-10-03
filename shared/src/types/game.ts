// Tipos de los datos del juego. Los JSON de /data deben cumplir estas formas.

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
  /** Stamina máxima. Las habilidades cuestan un porcentaje de ella. */
  stamina: number;
  /** Valores reales a nivel 13 del juego original (1144 = 1 estrella … 1717 = 5). */
  attack: number;
  defense: number;
  accuracy: number;
  evasion: number;
}

/** Recorte cuadrado (en píxeles del PNG) que se usa como retrato. */
export interface PortraitCrop {
  x: number;
  y: number;
  size: number;
}

export interface HeroArt {
  /** Figura de cuerpo entero mirando a la derecha, relativa a /assets (la sirve el servidor). */
  figure: string;
  portraitCrop?: PortraitCrop;
}

export interface Hero {
  id: string;
  name: string;
  classId: HeroClassId;
  description: string;
  baseStats: HeroStats;
  abilityIds: string[];
  /** Arte opcional; sin él se dibuja un marcador. */
  art?: HeroArt;
}

export type AbilityType = 'melee' | 'ranged' | 'buff' | 'debuff' | 'heal';
export type AbilityTarget = 'single_enemy' | 'all_enemies' | 'self' | 'single_ally' | 'all_allies';

/**
 * Propiedades especiales de las fichas del juego original. Las que el motor no
 * conoce se muestran pero no tienen efecto.
 */
export type AbilityProperty =
  | 'quick_action' // no gasta el turno
  | 'deadly_crits' // los críticos hacen x2 en vez de x1.5
  | 'high_crits' // solo informativa: ya está en critChance
  | 'mighty_attack' // ignora las reducciones de daño del objetivo
  | 'catastrophic' // no se puede esquivar
  | 'anger_unleashed' // consume las acumulaciones de hulk_up para hacer más daño
  | 'exploits_combos' // +50% contra combo_setup y lo consume
  | 'exploits_bleeds' // +25% por cada acumulación de sangrado del objetivo
  | 'adamantium' // ignora la mitad de la defensa
  | 'subtle' // no provoca contraataques
  | 'stealthy'; // no provoca contraataques

/** A quién se aplica un efecto: los objetivos de la habilidad, quien la usa o todo su equipo. */
export type EffectTarget = 'target' | 'self' | 'all_allies';

export interface AbilityEffect {
  /** Id de data/statuses.json. */
  id: string;
  target: EffectTarget;
  /** Turnos que dura el efecto (0 = instantáneo). */
  duration: number;
  /** Probabilidad de aplicarse, de 0 a 1. */
  chance: number;
  /** Acumulaciones que añade (p. ej. Sangrado x2). */
  stacks: number;
}

export interface Ability {
  id: string;
  heroId: string;
  /** Nombre como aparece en el juego original. */
  name: string;
  /** Nivel del héroe en que se desbloquea (1, 2, 6, 9). */
  unlockLevel: number;
  type: AbilityType;
  /** Subtipos de la ficha: energy, tech, slashing, vibranium, gun… */
  tags: string[];
  target: AbilityTarget;
  /** Coste en % de la stamina máxima del héroe. */
  staminaCostPercent: number;
  /** Turnos de espera tras usarla (0 = sin cooldown). */
  cooldown: number;
  hits: number;
  /** Probabilidad de acierto (%) contra un objetivo sin evasión. */
  accuracy: number;
  /** Probabilidad de crítico (%) de cada golpe. */
  critChance: number;
  /** Daño total de todos los golpes (se reparte entre `hits`). */
  damage: { min: number; max: number } | null;
  /** true si el daño no venía en la ficha y es una estimación. */
  damageEstimated: boolean;
  properties: AbilityProperty[];
  effects: AbilityEffect[];
  description: string;
}

export interface HeroesFile {
  heroes: Hero[];
}

export interface AbilitiesFile {
  abilities: Ability[];
}

export type StatusKind = 'buff' | 'debuff' | 'instant';

/** Modificadores de un efecto, por acumulación. Todos son opcionales. */
export interface StatusModifiers {
  /** % de daño que hace el portador. */
  damageDealtPercent?: number;
  /** % de daño que recibe el portador. */
  damageTakenPercent?: number;
  /** % sobre la defensa del portador. */
  defensePercent?: number;
  /** Puntos de precisión. */
  accuracy?: number;
  /** Puntos de evasión. */
  evasion?: number;
  /** Puntos de probabilidad de crítico. */
  critChance?: number;
  /** % de vida máxima que pierde al empezar cada turno. */
  damageOverTimePercent?: number;
  /** % de vida máxima que recupera al empezar cada turno. */
  healOverTimePercent?: number;
  /** Pierde el turno. */
  skipTurn?: boolean;
  /** Los ataques contra el portador no fallan. */
  attacksCannotMiss?: boolean;
  /** El portador no esquiva: su evasión no cuenta. */
  ignoreEvasion?: boolean;
  /** El portador no contraataca. */
  noCounter?: boolean;
  /** % del golpe (antes de reducciones) que devuelve a quien le ataca cuerpo a cuerpo. */
  counterPercent?: number;
}

export interface StatusDefinition {
  id: string;
  name: string;
  kind: StatusKind;
  maxStacks: number;
  description: string;
  modifiers: StatusModifiers;
}

export interface StatusesFile {
  statuses: StatusDefinition[];
}
