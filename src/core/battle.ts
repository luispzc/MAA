import type { Ability, ClassesFile, Hero, HeroStats } from '../types/game';
import { getDamageMultiplier, getMatchup, type ClassMatchup } from './classAdvantage';
import { randomInt, type Rng } from './rng';

// Reglas provisionales del prototipo. Ajustarlas aquí cambia el balance de todo el combate.
export const BATTLE_RULES = {
  /** Aguante que recupera cada combatiente al empezar su turno. */
  staminaRegenPerTurn: 10,
  /** Probabilidad de acertar con precisión 90 contra evasión 0. */
  baseHitChance: 0.9,
  minHitChance: 0.2,
  /** Daño extra que causa quien tiene attack_up. */
  attackUpMultiplier: 1.25,
  /** Daño extra que recibe quien tiene defense_down. */
  defenseDownMultiplier: 1.25,
  accuracyUpBonus: 15,
  accuracyDownPenalty: 25,
  /** Fracción de la vida máxima que quita bleed / cura regeneration por turno. */
  bleedPercent: 0.05,
  regenerationPercent: 0.08,
};

export type Team = 'player' | 'enemy';

export type StatusId =
  | 'stun'
  | 'attack_up'
  | 'defense_down'
  | 'accuracy_up'
  | 'accuracy_down'
  | 'bleed'
  | 'regeneration';

export interface Status {
  id: StatusId;
  /** Turnos propios que le quedan al efecto. */
  turnsLeft: number;
}

export interface Combatant {
  /** Id único dentro del combate (p. ej. "player-0"). */
  uid: string;
  team: Team;
  hero: Hero;
  stats: HeroStats;
  health: number;
  stamina: number;
  statuses: Status[];
  /** Turnos de espera restantes por id de habilidad. */
  cooldowns: Record<string, number>;
}

export type BattleEvent =
  | { type: 'turn'; actor: string }
  | { type: 'ability'; actor: string; abilityId: string }
  | { type: 'damage'; actor: string; target: string; amount: number; matchup: ClassMatchup }
  | { type: 'miss'; actor: string; target: string }
  | { type: 'heal'; target: string; amount: number }
  | { type: 'status'; target: string; status: StatusId }
  | { type: 'bleed'; target: string; amount: number }
  | { type: 'stunned'; target: string }
  | { type: 'ko'; target: string }
  | { type: 'end'; winner: Team };

export interface AbilityOption {
  ability: Ability;
  usable: boolean;
  /** Motivo por el que no se puede usar, si aplica. */
  reason?: 'stamina' | 'cooldown';
}

export interface BattleSetup {
  players: Hero[];
  enemies: Hero[];
  abilityById: Map<string, Ability>;
  classesData: ClassesFile;
  rng: Rng;
}

/**
 * Estado y reglas de un combate por turnos. No depende de Phaser.
 *
 * Orden: cada ronda actúan primero los héroes del jugador vivos, en orden, y luego los enemigos.
 * Al empezar su turno, un combatiente sufre bleed / regeneration y recupera aguante; si está
 * aturdido pierde el turno. Al terminarlo bajan sus cooldowns y la duración de sus efectos, así que
 * un efecto de duración N afecta a los N siguientes turnos del objetivo y un cooldown de N bloquea
 * la habilidad durante N turnos propios.
 */
export class Battle {
  readonly combatants: Combatant[];
  winner: Team | null = null;
  round = 1;

  private readonly abilityById: Map<string, Ability>;
  private readonly classesData: ClassesFile;
  private readonly rng: Rng;
  private queue: string[] = [];
  private currentUid: string | null = null;
  private started = false;

  constructor(setup: BattleSetup) {
    this.abilityById = setup.abilityById;
    this.classesData = setup.classesData;
    this.rng = setup.rng;
    this.combatants = [
      ...setup.players.map((h, i) => createCombatant(h, 'player', i)),
      ...setup.enemies.map((h, i) => createCombatant(h, 'enemy', i)),
    ];
  }

  /** Arranca el combate y devuelve los eventos hasta el primer turno jugable. */
  start(): BattleEvent[] {
    const events: BattleEvent[] = [];
    this.advance(events);
    return events;
  }

  get current(): Combatant | null {
    return this.currentUid ? this.get(this.currentUid) : null;
  }

  get(uid: string): Combatant {
    const c = this.combatants.find((x) => x.uid === uid);
    if (!c) throw new Error(`Combatiente desconocido: ${uid}`);
    return c;
  }

  alive(team: Team): Combatant[] {
    return this.combatants.filter((c) => c.team === team && c.health > 0);
  }

  abilityOptions(actor: Combatant): AbilityOption[] {
    return actor.hero.abilityIds.map((id) => {
      const ability = this.ability(id);
      if ((actor.cooldowns[id] ?? 0) > 0) return { ability, usable: false, reason: 'cooldown' };
      if (actor.stamina < ability.staminaCost) return { ability, usable: false, reason: 'stamina' };
      return { ability, usable: true };
    });
  }

  /** Objetivos que se pueden elegir. Vacío si la habilidad no necesita elegir objetivo. */
  selectableTargets(actor: Combatant, ability: Ability): Combatant[] {
    if (ability.target === 'single_enemy') return this.alive(opponent(actor.team));
    if (ability.target === 'single_ally') return this.alive(actor.team);
    return [];
  }

  /** El combatiente actual usa una habilidad. Devuelve lo que pasó hasta el siguiente turno jugable. */
  act(abilityId: string, targetUid?: string): BattleEvent[] {
    const actor = this.current;
    if (!actor || this.winner) throw new Error('El combate no espera ninguna acción');
    const option = this.abilityOptions(actor).find((o) => o.ability.id === abilityId);
    if (!option) throw new Error(`${actor.hero.name} no tiene la habilidad ${abilityId}`);
    if (!option.usable) throw new Error(`${abilityId} no se puede usar (${option.reason})`);

    const { ability } = option;
    const targets = this.resolveTargets(actor, ability, targetUid);
    const events: BattleEvent[] = [{ type: 'ability', actor: actor.uid, abilityId }];

    actor.stamina -= ability.staminaCost;
    for (const target of targets) this.applyAbility(actor, ability, target, events);
    this.endTurn(actor);
    if (ability.cooldown > 0) actor.cooldowns[ability.id] = ability.cooldown;

    this.checkWinner(events);
    this.advance(events);
    return events;
  }

  /** IA sencilla: la habilidad usable más cara; ataca al enemigo con menos vida. */
  chooseAiAction(actor: Combatant): { abilityId: string; targetUid?: string } {
    const usable = this.abilityOptions(actor)
      .filter((o) => o.usable)
      .map((o) => o.ability)
      .sort((a, b) => b.staminaCost - a.staminaCost);
    const ability = usable[0];
    if (!ability) throw new Error(`${actor.hero.name} no tiene habilidades usables`);
    const targets = this.selectableTargets(actor, ability);
    if (targets.length === 0) return { abilityId: ability.id };
    const weakest = [...targets].sort((a, b) => a.health - b.health)[0];
    return { abilityId: ability.id, targetUid: weakest.uid };
  }

  hasStatus(c: Combatant, id: StatusId): boolean {
    return c.statuses.some((s) => s.id === id);
  }

  private ability(id: string): Ability {
    const a = this.abilityById.get(id);
    if (!a) throw new Error(`Habilidad desconocida: ${id}`);
    return a;
  }

  private resolveTargets(actor: Combatant, ability: Ability, targetUid?: string): Combatant[] {
    switch (ability.target) {
      case 'self':
        return [actor];
      case 'all_allies':
        return this.alive(actor.team);
      case 'all_enemies':
        return this.alive(opponent(actor.team));
      case 'single_enemy':
      case 'single_ally': {
        const target = this.selectableTargets(actor, ability).find((c) => c.uid === targetUid);
        if (!target) throw new Error(`Objetivo no válido para ${ability.id}: ${targetUid}`);
        return [target];
      }
    }
  }

  private applyAbility(actor: Combatant, ability: Ability, target: Combatant, events: BattleEvent[]): void {
    if (ability.damage) {
      if (!this.rollHit(actor, target)) {
        events.push({ type: 'miss', actor: actor.uid, target: target.uid });
        return;
      }
      const matchup = getMatchup(this.classesData.classes, actor.hero.classId, target.hero.classId);
      for (let i = 0; i < ability.hits && target.health > 0; i++) {
        const amount = this.rollDamage(actor, ability, target, matchup);
        target.health = Math.max(0, target.health - amount);
        events.push({ type: 'damage', actor: actor.uid, target: target.uid, amount, matchup });
      }
      if (target.health === 0) {
        target.statuses = [];
        events.push({ type: 'ko', target: target.uid });
        return;
      }
    }
    for (const effect of ability.effects) {
      if (this.rng() >= effect.chance) continue;
      const id = effect.id as StatusId;
      // Lo que uno se aplica a sí mismo se descontaría al final de este mismo turno; +1 para compensar.
      const turnsLeft = effect.duration + (target === actor ? 1 : 0);
      target.statuses = target.statuses.filter((s) => s.id !== id);
      target.statuses.push({ id, turnsLeft });
      events.push({ type: 'status', target: target.uid, status: id });
    }
  }

  private rollHit(actor: Combatant, target: Combatant): boolean {
    let accuracy = actor.stats.accuracy;
    if (this.hasStatus(actor, 'accuracy_up')) accuracy += BATTLE_RULES.accuracyUpBonus;
    if (this.hasStatus(actor, 'accuracy_down')) accuracy -= BATTLE_RULES.accuracyDownPenalty;
    const chance = Math.min(
      1,
      Math.max(
        BATTLE_RULES.minHitChance,
        BATTLE_RULES.baseHitChance + (accuracy - 90) / 100 - target.stats.evasion / 200,
      ),
    );
    return this.rng() < chance;
  }

  private rollDamage(actor: Combatant, ability: Ability, target: Combatant, matchup: ClassMatchup): number {
    const { min, max } = ability.damage!;
    let dmg = randomInt(this.rng, min, max);
    dmg *= actor.stats.attack / 100;
    dmg *= 100 / (100 + target.stats.defense / 2);
    dmg *= getDamageMultiplier(this.classesData.rules, matchup);
    if (this.hasStatus(actor, 'attack_up')) dmg *= BATTLE_RULES.attackUpMultiplier;
    if (this.hasStatus(target, 'defense_down')) dmg *= BATTLE_RULES.defenseDownMultiplier;
    return Math.max(1, Math.round(dmg));
  }

  private checkWinner(events: BattleEvent[]): void {
    if (this.winner) return;
    if (this.alive('enemy').length === 0) this.winner = 'player';
    else if (this.alive('player').length === 0) this.winner = 'enemy';
    if (this.winner) events.push({ type: 'end', winner: this.winner });
  }

  /** Pasa al siguiente combatiente que pueda actuar, resolviendo efectos de inicio de turno. */
  private advance(events: BattleEvent[]): void {
    this.currentUid = null;
    while (!this.winner) {
      if (this.queue.length === 0) {
        if (this.started) this.round++;
        this.started = true;
        this.queue = [...this.alive('player'), ...this.alive('enemy')].map((c) => c.uid);
      }
      const next = this.get(this.queue.shift()!);
      if (next.health <= 0) continue;
      if (this.startTurn(next, events)) {
        this.currentUid = next.uid;
        events.push({ type: 'turn', actor: next.uid });
        return;
      }
      if (next.health > 0) this.endTurn(next);
      this.checkWinner(events);
    }
  }

  /** Efectos de inicio de turno. Devuelve false si el combatiente pierde el turno. */
  private startTurn(c: Combatant, events: BattleEvent[]): boolean {
    const maxHealth = c.stats.health;
    if (this.hasStatus(c, 'bleed')) {
      const amount = Math.round(maxHealth * BATTLE_RULES.bleedPercent);
      c.health = Math.max(0, c.health - amount);
      events.push({ type: 'bleed', target: c.uid, amount });
      if (c.health === 0) {
        c.statuses = [];
        events.push({ type: 'ko', target: c.uid });
        return false;
      }
    }
    if (this.hasStatus(c, 'regeneration')) {
      const amount = Math.min(maxHealth - c.health, Math.round(maxHealth * BATTLE_RULES.regenerationPercent));
      c.health += amount;
      events.push({ type: 'heal', target: c.uid, amount });
    }

    c.stamina = Math.min(c.stats.stamina, c.stamina + BATTLE_RULES.staminaRegenPerTurn);

    if (!this.hasStatus(c, 'stun')) return true;
    events.push({ type: 'stunned', target: c.uid });
    return false;
  }

  /** Fin del turno propio (haya actuado o no): bajan cooldowns y duración de efectos. */
  private endTurn(c: Combatant): void {
    for (const id of Object.keys(c.cooldowns)) {
      c.cooldowns[id] = Math.max(0, c.cooldowns[id] - 1);
    }
    for (const s of c.statuses) s.turnsLeft--;
    c.statuses = c.statuses.filter((s) => s.turnsLeft > 0);
  }
}

function opponent(team: Team): Team {
  return team === 'player' ? 'enemy' : 'player';
}

function createCombatant(hero: Hero, team: Team, index: number): Combatant {
  return {
    uid: `${team}-${index}`,
    team,
    hero,
    stats: { ...hero.baseStats },
    health: hero.baseStats.health,
    stamina: hero.baseStats.stamina,
    statuses: [],
    cooldowns: {},
  };
}
