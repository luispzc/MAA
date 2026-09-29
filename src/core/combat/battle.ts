import type { Ability, ClassesFile, Hero } from '../../types/game';
import { getDamageMultiplier, getMatchup } from '../classAdvantage';
import { nextRandom } from './rng';
import {
  accuracyBonus,
  addStatus,
  attackModifier,
  defenseModifier,
  hasStatus,
  TICK_FRACTION,
} from './statuses';
import type { Action, BattleEvent, BattleState, Combatant, Matchup, StatusId, TeamId } from './types';

export const TEAM_SIZE = 3;
/** Fracción de la stamina máxima que se recupera al empezar cada turno. */
export const STAMINA_REGEN_FRACTION = 0.1;
export const CRIT_CHANCE = 0.1;
export const CRIT_MULTIPLIER = 1.5;
export const MIN_HIT_CHANCE = 10;
/** Precisión extra de base para que un héroe normal acierte la mayoría de golpes. */
export const BASE_HIT_BONUS = 20;

export interface CombatData {
  classes: ClassesFile;
  abilityById: ReadonlyMap<string, Ability>;
}

export class InvalidActionError extends Error {}

export function createCombatant(hero: Hero, team: TeamId, slot: number, data: CombatData): Combatant {
  const abilities = hero.abilityIds.map((id) => {
    const ability = data.abilityById.get(id);
    if (!ability) throw new Error(`La habilidad ${id} de ${hero.name} no existe`);
    return ability;
  });
  return {
    uid: `${team}-${slot}`,
    heroId: hero.id,
    name: hero.name,
    team,
    slot,
    classId: hero.classId,
    stats: { ...hero.baseStats },
    abilities,
    hp: hero.baseStats.health,
    stamina: hero.baseStats.stamina,
    statuses: [],
    cooldowns: {},
  };
}

/**
 * Crea una batalla de hasta 3 contra 3 y avanza hasta el primer combatiente que
 * puede actuar. Con la misma semilla, la batalla es reproducible.
 */
export function createBattle(
  playerTeam: Hero[],
  enemyTeam: Hero[],
  data: CombatData,
  seed: number = Date.now(),
): BattleState {
  for (const team of [playerTeam, enemyTeam]) {
    if (team.length < 1 || team.length > TEAM_SIZE) {
      throw new Error(`Cada equipo debe tener entre 1 y ${TEAM_SIZE} héroes`);
    }
  }
  const state: BattleState = {
    round: 0,
    combatants: [
      ...playerTeam.map((h, i) => createCombatant(h, 'player', i, data)),
      ...enemyTeam.map((h, i) => createCombatant(h, 'enemy', i, data)),
    ],
    turnOrder: [],
    turnIndex: 0,
    winner: null,
    log: [],
    rngState: seed | 0,
    classes: data.classes,
  };
  advance(state);
  return state;
}

export function getCombatant(state: BattleState, uid: string): Combatant {
  const c = state.combatants.find((x) => x.uid === uid);
  if (!c) throw new InvalidActionError(`No existe el combatiente ${uid}`);
  return c;
}

export function isAlive(c: Combatant): boolean {
  return c.hp > 0;
}

/** Combatiente al que le toca elegir acción, o null si la batalla terminó. */
export function currentActor(state: BattleState): Combatant | null {
  if (state.winner) return null;
  return getCombatant(state, state.turnOrder[state.turnIndex]);
}

export function canUseAbility(c: Combatant, ability: Ability): boolean {
  return c.stamina >= ability.staminaCost && (c.cooldowns[ability.id] ?? 0) === 0;
}

/** Objetivos elegibles para una habilidad de objetivo único (vacío si no hay que elegir). */
export function selectableTargets(state: BattleState, actor: Combatant, ability: Ability): Combatant[] {
  if (ability.target === 'single_enemy') {
    return state.combatants.filter((c) => c.team !== actor.team && isAlive(c));
  }
  if (ability.target === 'single_ally') {
    return state.combatants.filter((c) => c.team === actor.team && isAlive(c));
  }
  return [];
}

export function matchupBetween(state: BattleState, attacker: Combatant, defender: Combatant): Matchup {
  return getMatchup(state.classes.classes, attacker.classId, defender.classId);
}

/** Probabilidad de acertar (0 a 100) de un golpe. */
export function hitChance(attacker: Combatant, defender: Combatant): number {
  const chance = attacker.stats.accuracy + accuracyBonus(attacker) + BASE_HIT_BONUS - defender.stats.evasion;
  return Math.min(100, Math.max(MIN_HIT_CHANCE, chance));
}

/**
 * Daño de un golpe sin aplicarlo. `baseDamage` sale del rango min-max de la
 * habilidad; el ataque escala sobre 100 y la defensa mitiga con 200 / (200 + def).
 */
export function computeDamage(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  baseDamage: number,
  crit: boolean,
): number {
  const attack = (attacker.stats.attack * attackModifier(attacker)) / 100;
  const defense = defender.stats.defense * defenseModifier(defender);
  const mitigation = 200 / (200 + defense);
  const classMod = getDamageMultiplier(state.classes.rules, matchupBetween(state, attacker, defender));
  const dmg = baseDamage * attack * mitigation * classMod * (crit ? CRIT_MULTIPLIER : 1);
  return Math.max(1, Math.round(dmg));
}

/**
 * Ejecuta la acción de quien tiene el turno, cierra su turno y avanza hasta el
 * siguiente que pueda actuar. Devuelve los eventos generados, en orden.
 */
export function performAction(state: BattleState, action: Action): BattleEvent[] {
  const logStart = state.log.length;
  const actor = currentActor(state);
  if (!actor) throw new InvalidActionError('La batalla ya terminó');
  if (actor.uid !== action.actorUid) {
    throw new InvalidActionError(`No es el turno de ${action.actorUid}, sino de ${actor.uid}`);
  }
  const ability = actor.abilities.find((a) => a.id === action.abilityId);
  if (!ability) throw new InvalidActionError(`${actor.name} no tiene la habilidad ${action.abilityId}`);
  if (!canUseAbility(actor, ability)) throw new InvalidActionError(`${ability.name} no está disponible`);

  const targets = resolveTargets(state, actor, ability, action.targetUid);
  actor.stamina -= ability.staminaCost;
  // +1 porque el contador baja al empezar el siguiente turno propio.
  if (ability.cooldown > 0) actor.cooldowns[ability.id] = ability.cooldown + 1;
  emit(state, { type: 'ability-used', actorUid: actor.uid, abilityId: ability.id, targets: targets.map((t) => t.uid) });

  for (const target of targets) {
    let landed = !ability.damage;
    if (ability.damage) {
      for (let i = 0; i < ability.hits && isAlive(target); i++) {
        if (strike(state, actor, target, ability.damage)) landed = true;
      }
    }
    // Los efectos sobre un enemigo solo entran si al menos un golpe acertó.
    if (!landed || !isAlive(target)) continue;
    for (const effect of ability.effects) {
      if (effect.chance < 1 && nextRandom(state) >= effect.chance) {
        emit(state, { type: 'status-resisted', targetUid: target.uid, statusId: effect.id });
        continue;
      }
      addStatus(target, effect.id, effect.duration);
      if (target === actor) actor.statuses.find((s) => s.id === effect.id)!.fresh = true;
      emit(state, { type: 'status-applied', targetUid: target.uid, statusId: effect.id, duration: effect.duration });
    }
  }

  checkWinner(state);
  if (!state.winner) {
    endTurn(state, actor);
    state.turnIndex++;
    advance(state);
  }
  return state.log.slice(logStart);
}

function resolveTargets(
  state: BattleState,
  actor: Combatant,
  ability: Ability,
  targetUid: string | undefined,
): Combatant[] {
  switch (ability.target) {
    case 'self':
      return [actor];
    case 'all_enemies':
      return state.combatants.filter((c) => c.team !== actor.team && isAlive(c));
    case 'all_allies':
      return state.combatants.filter((c) => c.team === actor.team && isAlive(c));
    case 'single_enemy':
    case 'single_ally': {
      if (!targetUid) throw new InvalidActionError(`${ability.name} necesita un objetivo`);
      const target = getCombatant(state, targetUid);
      if (!selectableTargets(state, actor, ability).includes(target)) {
        throw new InvalidActionError(`${target.name} no es un objetivo válido para ${ability.name}`);
      }
      return [target];
    }
  }
}

/** Un golpe: tirada de acierto, de daño y de crítico. Devuelve si acertó. */
function strike(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  range: { min: number; max: number },
): boolean {
  if (nextRandom(state) * 100 >= hitChance(attacker, defender)) {
    emit(state, { type: 'miss', sourceUid: attacker.uid, targetUid: defender.uid });
    return false;
  }
  const base = range.min + Math.floor(nextRandom(state) * (range.max - range.min + 1));
  const crit = nextRandom(state) < CRIT_CHANCE;
  const amount = computeDamage(state, attacker, defender, base, crit);
  applyDamage(state, defender, amount, {
    sourceUid: attacker.uid,
    crit,
    matchup: matchupBetween(state, attacker, defender),
    cause: 'ability',
  });
  return true;
}

function applyDamage(
  state: BattleState,
  target: Combatant,
  amount: number,
  info: Omit<Extract<BattleEvent, { type: 'damage' }>, 'type' | 'targetUid' | 'amount'>,
) {
  const dealt = Math.min(target.hp, amount);
  target.hp -= dealt;
  emit(state, { type: 'damage', targetUid: target.uid, amount: dealt, ...info });
  if (target.hp === 0) {
    target.statuses = [];
    emit(state, { type: 'ko', targetUid: target.uid });
  }
}

function heal(state: BattleState, target: Combatant, amount: number, cause: string) {
  const healed = Math.min(target.stats.health - target.hp, amount);
  target.hp += healed;
  emit(state, { type: 'heal', targetUid: target.uid, amount: healed, cause });
}

/**
 * Nueva ronda: los equipos se alternan por posición (jugador 1, enemigo 1,
 * jugador 2, enemigo 2…). Los caídos no entran.
 */
function startRound(state: BattleState) {
  state.round++;
  const order: string[] = [];
  for (let slot = 0; slot < TEAM_SIZE; slot++) {
    for (const team of ['player', 'enemy'] as const) {
      const c = state.combatants.find((x) => x.team === team && x.slot === slot);
      if (c && isAlive(c)) order.push(c.uid);
    }
  }
  state.turnOrder = order;
  state.turnIndex = 0;
  emit(state, { type: 'round-start', round: state.round, order: [...order] });
}

/**
 * Avanza hasta el próximo combatiente que puede elegir acción: empieza rondas
 * nuevas, salta caídos, aplica efectos por turno y pierde el turno si está aturdido.
 */
function advance(state: BattleState) {
  while (!state.winner) {
    if (state.turnIndex >= state.turnOrder.length) startRound(state);
    const actor = getCombatant(state, state.turnOrder[state.turnIndex]);
    if (!isAlive(actor)) {
      state.turnIndex++;
      continue;
    }
    emit(state, { type: 'turn-start', actorUid: actor.uid });
    startTurn(state, actor);
    checkWinner(state);
    if (state.winner) return;
    if (!isAlive(actor)) {
      state.turnIndex++;
      continue;
    }
    if (hasStatus(actor, 'stun')) {
      emit(state, { type: 'turn-skipped', actorUid: actor.uid, reason: 'stun' });
      endTurn(state, actor);
      state.turnIndex++;
      continue;
    }
    return;
  }
}

function startTurn(state: BattleState, actor: Combatant) {
  const regen = Math.round(actor.stats.stamina * STAMINA_REGEN_FRACTION);
  actor.stamina = Math.min(actor.stats.stamina, actor.stamina + regen);
  for (const id of Object.keys(actor.cooldowns)) {
    actor.cooldowns[id] = Math.max(0, actor.cooldowns[id] - 1);
  }
  for (const status of [...actor.statuses]) {
    const fraction = TICK_FRACTION[status.id as StatusId];
    if (!fraction || !isAlive(actor)) continue;
    const amount = Math.max(1, Math.round(actor.stats.health * fraction));
    if (status.id === 'regeneration') {
      heal(state, actor, amount, status.id);
    } else {
      applyDamage(state, actor, amount, { sourceUid: null, crit: false, matchup: 'neutral', cause: status.id });
    }
  }
}

/** Resta un turno a los efectos del combatiente, salvo los que se puso en este mismo turno. */
function endTurn(state: BattleState, actor: Combatant) {
  for (const status of [...actor.statuses]) {
    if (status.fresh) {
      delete status.fresh;
      continue;
    }
    status.turnsLeft--;
    if (status.turnsLeft <= 0) {
      actor.statuses.splice(actor.statuses.indexOf(status), 1);
      emit(state, { type: 'status-expired', targetUid: actor.uid, statusId: status.id });
    }
  }
}

function checkWinner(state: BattleState) {
  if (state.winner) return;
  const alive = (team: TeamId) => state.combatants.some((c) => c.team === team && isAlive(c));
  const winner: TeamId | null = !alive('enemy') ? 'player' : !alive('player') ? 'enemy' : null;
  if (winner) {
    state.winner = winner;
    emit(state, { type: 'battle-end', winner });
  }
}

function emit(state: BattleState, event: BattleEvent) {
  state.log.push(event);
}
