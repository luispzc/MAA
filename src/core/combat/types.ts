import type { Ability, ClassesFile, HeroClassId, HeroStats, StatusDefinition } from '../../types/game';

/**
 * Tipos del motor de combate. Es lógica pura, sin Phaser: se prueba con Vitest
 * y la escena solo dibuja el estado y manda las acciones del jugador.
 */

export type TeamId = 'player' | 'enemy';

export interface StatusEffect {
  /** Id de data/statuses.json. Uno desconocido se muestra pero no tiene efecto mecánico. */
  id: string;
  /** Turnos propios del portador que le quedan al efecto. */
  turnsLeft: number;
  /** Acumulaciones (Sangrado x2, Poder de Mjolnir x3…). */
  stacks: number;
  /** Puesto por el portador en su turno actual: ese turno no cuenta. */
  fresh?: boolean;
}

export interface Combatant {
  /** Identificador único en la batalla, p. ej. "player-0". */
  uid: string;
  heroId: string;
  name: string;
  team: TeamId;
  slot: number;
  classId: HeroClassId;
  stats: HeroStats;
  /** Habilidades del héroe más Descansar al final. */
  abilities: Ability[];
  hp: number;
  stamina: number;
  statuses: StatusEffect[];
  /** Turnos que faltan para poder usar cada habilidad (por id). */
  cooldowns: Record<string, number>;
}

export interface Action {
  actorUid: string;
  abilityId: string;
  /** Obligatorio para habilidades de objetivo único. */
  targetUid?: string;
}

export type Matchup = 'advantage' | 'disadvantage' | 'neutral';

export type BattleEvent =
  | { type: 'round-start'; round: number; order: string[] }
  | { type: 'turn-start'; actorUid: string }
  | { type: 'turn-skipped'; actorUid: string; reason: string }
  | { type: 'ability-used'; actorUid: string; abilityId: string; targets: string[]; quick: boolean }
  | { type: 'miss'; sourceUid: string; targetUid: string }
  | {
      type: 'damage';
      sourceUid: string | null;
      targetUid: string;
      amount: number;
      crit: boolean;
      matchup: Matchup;
      /** 'ability', 'counter' o el id del efecto que causó el daño (p. ej. 'bleed'). */
      cause: string;
    }
  | { type: 'heal'; targetUid: string; amount: number; cause: string }
  | { type: 'stamina'; targetUid: string; amount: number; cause: string }
  | { type: 'status-applied'; targetUid: string; statusId: string; duration: number; stacks: number }
  | { type: 'status-resisted'; targetUid: string; statusId: string }
  | { type: 'status-removed'; targetUid: string; statusId: string; cause: string }
  | { type: 'status-expired'; targetUid: string; statusId: string }
  | { type: 'ko'; targetUid: string }
  | { type: 'battle-end'; winner: TeamId };

export interface BattleState {
  round: number;
  combatants: Combatant[];
  /** Orden de actuación de la ronda actual (uids). */
  turnOrder: string[];
  /** Índice en turnOrder de quien actúa ahora. */
  turnIndex: number;
  winner: TeamId | null;
  log: BattleEvent[];
  rngState: number;
  /** Clases y reglas de ventaja con las que se juega esta batalla. */
  classes: ClassesFile;
  /** Definiciones de los efectos (data/statuses.json). */
  statusById: ReadonlyMap<string, StatusDefinition>;
}
