import {
  chooseAiAction,
  createBattle,
  currentActor,
  describeEvent,
  performAction,
  selectableTargets,
  type Ability,
  type Action,
  type BattleEvent,
  type BattleState,
  type GameIndex,
} from '@maa/shared';

export type Mode = 'busy' | 'choose-ability' | 'choose-target' | 'over';

/** Lo que la interfaz necesita saber además del estado del motor. */
export interface BattleSnapshot {
  /** Cambia cada vez que algo cambia; sirve para que React vuelva a pintar. */
  version: number;
  /** Cambia al empezar una batalla nueva (Jugar de nuevo). */
  battleId: number;
  state: BattleState;
  mode: Mode;
  pendingAbility: Ability | null;
  /** Combatiente bajo el ratón (en el escenario o en los paneles). */
  hovered: string | null;
  /** Registro completo en texto; en pantalla se ven las últimas líneas. */
  log: string[];
}

export interface Timings {
  /** Pausa antes de que actúe la IA. */
  enemyDelay: number;
  /** Pausa tras cada acción para que se vea la animación. */
  afterAction: number;
}

const DEFAULT_TIMINGS: Timings = { enemyDelay: 800, afterAction: 750 };

type ActionListener = (action: Action, events: BattleEvent[]) => void;

/**
 * Controla una batalla: guarda el estado del motor y el modo de la interfaz,
 * hace jugar a la IA y avisa a React (subscribe/getSnapshot, para
 * useSyncExternalStore) y al escenario de Phaser (onAction, para animar).
 */
export class BattleController {
  private snapshot: BattleSnapshot;
  private listeners = new Set<() => void>();
  private actionListeners = new Set<ActionListener>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly data: GameIndex,
    private readonly playerTeam: string[],
    private readonly enemyTeam: string[],
    private readonly timings: Timings = DEFAULT_TIMINGS,
    private readonly seed?: number,
  ) {
    this.snapshot = this.freshSnapshot(0);
  }

  // --- Suscripción ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): BattleSnapshot => this.snapshot;

  /** Avisa de cada acción ejecutada con sus eventos, para animarla. */
  onAction(listener: ActionListener): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  get state(): BattleState {
    return this.snapshot.state;
  }

  // --- Ciclo de vida ---

  /** Empieza (o reanuda) el bucle de turnos. Se puede llamar de nuevo tras dispose. */
  start(): void {
    this.clearTimers();
    this.nextTurn();
  }

  /** Detiene los temporizadores (al desmontar la pantalla). */
  dispose(): void {
    this.clearTimers();
  }

  /** Jugar de nuevo con los mismos equipos. */
  restart(): void {
    this.clearTimers();
    this.snapshot = this.freshSnapshot(this.snapshot.battleId + 1);
    this.emit();
    this.nextTurn();
  }

  // --- Entrada del jugador ---

  /** Uids que se pueden elegir como objetivo ahora mismo. */
  targetSet(): Set<string> {
    const { mode, pendingAbility, state } = this.snapshot;
    const actor = currentActor(state);
    if (mode !== 'choose-target' || !actor || !pendingAbility) return new Set();
    return new Set(selectableTargets(state, actor, pendingAbility).map((t) => t.uid));
  }

  chooseAbility(ability: Ability): void {
    const { mode, pendingAbility, state } = this.snapshot;
    const actor = currentActor(state);
    if ((mode !== 'choose-ability' && mode !== 'choose-target') || !actor || actor.team !== 'player') return;
    if (pendingAbility?.id === ability.id) {
      this.cancelTarget();
      return;
    }
    if (ability.target === 'single_enemy' || ability.target === 'single_ally') {
      this.update({ mode: 'choose-target', pendingAbility: ability });
      return;
    }
    this.execute({ actorUid: actor.uid, abilityId: ability.id });
  }

  cancelTarget(): void {
    if (this.snapshot.mode !== 'choose-target') return;
    this.update({ mode: 'choose-ability', pendingAbility: null });
  }

  clickTarget(uid: string): void {
    const { mode, pendingAbility, state } = this.snapshot;
    const actor = currentActor(state);
    if (mode !== 'choose-target' || !actor || !pendingAbility) return;
    if (!this.targetSet().has(uid)) return;
    this.execute({ actorUid: actor.uid, abilityId: pendingAbility.id, targetUid: uid });
  }

  setHovered(uid: string | null): void {
    if (this.snapshot.hovered === uid) return;
    this.update({ hovered: uid });
  }

  // --- Interno ---

  private freshSnapshot(battleId: number): BattleSnapshot {
    const hero = (id: string) => {
      const h = this.data.heroById.get(id);
      if (!h) throw new Error(`No existe el héroe ${id}`);
      return h;
    };
    const state = createBattle(this.playerTeam.map(hero), this.enemyTeam.map(hero), this.data, this.seed);
    return {
      version: 0,
      battleId,
      state,
      mode: 'busy',
      pendingAbility: null,
      hovered: null,
      log: this.describe(state, state.log),
    };
  }

  private describe(state: BattleState, events: BattleEvent[]): string[] {
    return events.map((e) => describeEvent(state, e)).filter((l): l is string => !!l);
  }

  private update(patch: Partial<BattleSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, version: this.snapshot.version + 1 };
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  private clearTimers(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
  }

  private nextTurn(): void {
    const actor = currentActor(this.state);
    if (!actor) {
      this.update({ mode: 'over', pendingAbility: null, hovered: null });
      return;
    }
    if (actor.team === 'enemy') {
      this.update({ mode: 'busy', pendingAbility: null });
      this.later(this.timings.enemyDelay, () => this.execute(chooseAiAction(this.state)));
      return;
    }
    this.update({ mode: 'choose-ability', pendingAbility: null });
  }

  private execute(action: Action): void {
    const events = performAction(this.state, action);
    this.update({
      mode: 'busy',
      pendingAbility: null,
      hovered: null,
      log: [...this.snapshot.log, ...this.describe(this.state, events)],
    });
    for (const l of this.actionListeners) l(action, events);
    this.later(this.timings.afterAction, () => this.nextTurn());
  }
}
