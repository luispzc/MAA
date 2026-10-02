import type { Ability, AbilityProperty, ClassesFile, Hero, StatusDefinition } from '../../types/game';
import { getDamageMultiplier, getMatchup } from '../classAdvantage';
import { nextRandom } from './rng';
import { addStatus, hasFlag, hasStatus, isBuff, removeStatus, stacksOf, sumModifier } from './statuses';
import type { Action, BattleEvent, BattleState, Combatant, Matchup, TeamId } from './types';

export const TEAM_SIZE = 3;
/** Fracción de la stamina máxima que se recupera al empezar cada turno. */
export const STAMINA_REGEN_FRACTION = 0.1;
/** Stamina extra (fracción de la máxima) que da Descansar. */
export const REST_STAMINA_FRACTION = 0.25;
export const CRIT_MULTIPLIER = 1.5;
export const DEADLY_CRIT_MULTIPLIER = 2;
export const MIN_HIT_CHANCE = 10;
/** Fracción de la defensa que ignora Adamantium. */
export const ADAMANTIUM_DEFENSE_IGNORED = 0.5;
export const EXPLOIT_COMBO_BONUS = 0.5;
export const EXPLOIT_BLEED_BONUS_PER_STACK = 0.25;
export const ANGER_BONUS_PER_STACK = 0.15;

/** Acción de reserva que siempre está disponible, para no quedarse sin opciones por falta de stamina. */
export const REST_ABILITY: Ability = {
  id: 'rest',
  heroId: '',
  name: 'Descansar',
  unlockLevel: 1,
  type: 'buff',
  tags: [],
  target: 'self',
  staminaCostPercent: 0,
  cooldown: 0,
  hits: 0,
  accuracy: 100,
  critChance: 0,
  damage: null,
  damageEstimated: false,
  properties: [],
  effects: [],
  description: `Pasa el turno y recupera ${REST_STAMINA_FRACTION * 100}% de stamina extra.`,
};

export interface CombatData {
  classes: ClassesFile;
  abilityById: ReadonlyMap<string, Ability>;
  statusById: ReadonlyMap<string, StatusDefinition>;
}

export class InvalidActionError extends Error {}

export function hasProperty(ability: Ability, property: AbilityProperty): boolean {
  return ability.properties.includes(property);
}

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
    abilities: [...abilities, REST_ABILITY],
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
    statusById: data.statusById,
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

/** Stamina que cuesta la habilidad a este combatiente (porcentaje de su máximo). */
export function staminaCost(c: Combatant, ability: Ability): number {
  return Math.round((c.stats.stamina * ability.staminaCostPercent) / 100);
}

export function canUseAbility(c: Combatant, ability: Ability): boolean {
  return c.stamina >= staminaCost(c, ability) && (c.cooldowns[ability.id] ?? 0) === 0;
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

/**
 * Probabilidad de acertar (0 a 100) de un golpe: precisión de la habilidad más
 * los efectos del atacante, menos la evasión del defensor.
 */
export function hitChance(state: BattleState, attacker: Combatant, defender: Combatant, ability: Ability): number {
  if (hasProperty(ability, 'catastrophic') || hasFlag(state, defender, 'attacksCannotMiss')) return 100;
  const evasion = hasFlag(state, defender, 'ignoreEvasion')
    ? 0
    : defender.stats.evasion + sumModifier(state, defender, 'evasion');
  const chance = ability.accuracy + sumModifier(state, attacker, 'accuracy') - evasion;
  return Math.min(100, Math.max(MIN_HIT_CHANCE, chance));
}

/** Probabilidad de crítico (0 a 100) de cada golpe. */
export function critChance(state: BattleState, attacker: Combatant, ability: Ability): number {
  return Math.min(100, Math.max(0, ability.critChance + sumModifier(state, attacker, 'critChance')));
}

/** Multiplicador por propiedades que aprovechan efectos del objetivo o del atacante. */
function exploitMultiplier(attacker: Combatant, defender: Combatant, ability: Ability): number {
  let mult = 1;
  if (hasProperty(ability, 'exploits_combos') && hasStatus(defender, 'combo_setup')) mult *= 1 + EXPLOIT_COMBO_BONUS;
  if (hasProperty(ability, 'exploits_bleeds')) mult *= 1 + EXPLOIT_BLEED_BONUS_PER_STACK * stacksOf(defender, 'bleed');
  if (hasProperty(ability, 'anger_unleashed')) mult *= 1 + ANGER_BONUS_PER_STACK * stacksOf(attacker, 'hulk_up');
  return mult;
}

export interface DamageBreakdown {
  /** Daño final que recibe el defensor. */
  amount: number;
  /** Daño antes de las reducciones del defensor (base para contraataques). */
  beforeTaken: number;
}

/**
 * Daño de un golpe sin aplicarlo. `baseDamage` es la tirada de ese golpe; el
 * ataque escala sobre 100, la defensa mitiga con 200 / (200 + def) y luego se
 * aplican clase, crítico, efectos y propiedades de la habilidad.
 */
export function computeDamage(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  baseDamage: number,
  crit: boolean,
  ability?: Ability,
): number {
  return damageBreakdown(state, attacker, defender, baseDamage, crit, ability).amount;
}

export function damageBreakdown(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  baseDamage: number,
  crit: boolean,
  ability?: Ability,
): DamageBreakdown {
  const dealt = Math.max(0.1, 1 + sumModifier(state, attacker, 'damageDealtPercent') / 100);
  const attack = (attacker.stats.attack / 100) * dealt;
  let defense = defender.stats.defense * Math.max(0, 1 + sumModifier(state, defender, 'defensePercent') / 100);
  if (ability && hasProperty(ability, 'adamantium')) defense *= 1 - ADAMANTIUM_DEFENSE_IGNORED;
  const mitigation = 200 / (200 + defense);
  const classMod = getDamageMultiplier(state.classes.rules, matchupBetween(state, attacker, defender));
  const critMod = crit ? (ability && hasProperty(ability, 'deadly_crits') ? DEADLY_CRIT_MULTIPLIER : CRIT_MULTIPLIER) : 1;
  const exploit = ability ? exploitMultiplier(attacker, defender, ability) : 1;
  const beforeTaken = baseDamage * attack * mitigation * classMod * critMod * exploit;

  let taken = sumModifier(state, defender, 'damageTakenPercent');
  // Un ataque poderoso atraviesa escudos: solo cuentan los efectos que suben el daño recibido.
  if (ability && hasProperty(ability, 'mighty_attack')) {
    taken = 0;
    for (const s of defender.statuses) {
      const v = state.statusById.get(s.id)?.modifiers.damageTakenPercent ?? 0;
      if (v > 0) taken += v * s.stacks;
    }
  }
  const amount = beforeTaken * Math.max(0, 1 + taken / 100);
  return { amount: Math.max(1, Math.round(amount)), beforeTaken };
}

/**
 * Ejecuta la acción de quien tiene el turno. Una acción rápida no gasta el
 * turno; cualquier otra lo cierra y avanza hasta el siguiente que pueda actuar.
 * Devuelve los eventos generados, en orden.
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
  const quick = hasProperty(ability, 'quick_action');
  actor.stamina -= staminaCost(actor, ability);
  // +1 porque el contador baja al empezar el siguiente turno propio.
  if (ability.cooldown > 0) actor.cooldowns[ability.id] = ability.cooldown + 1;
  emit(state, { type: 'ability-used', actorUid: actor.uid, abilityId: ability.id, targets: targets.map((t) => t.uid), quick });

  if (ability.id === REST_ABILITY.id) {
    const before = actor.stamina;
    actor.stamina = Math.min(actor.stats.stamina, actor.stamina + Math.round(actor.stats.stamina * REST_STAMINA_FRACTION));
    emit(state, { type: 'stamina', targetUid: actor.uid, amount: actor.stamina - before, cause: 'rest' });
  }

  for (const target of targets) {
    let landed = !ability.damage;
    if (ability.damage) {
      for (let i = 0; i < ability.hits && isAlive(target) && isAlive(actor); i++) {
        if (strike(state, actor, target, ability)) landed = true;
      }
      if (landed && hasProperty(ability, 'exploits_combos') && removeStatus(target, 'combo_setup')) {
        emit(state, { type: 'status-removed', targetUid: target.uid, statusId: 'combo_setup', cause: 'exploits_combos' });
      }
    }
    // Los efectos sobre un objetivo solo entran si al menos un golpe acertó.
    if (!landed || !isAlive(target)) continue;
    for (const effect of ability.effects) {
      if (effect.target === 'target') applyEffect(state, actor, target, effect);
    }
  }

  if (isAlive(actor)) {
    if (hasProperty(ability, 'anger_unleashed') && removeStatus(actor, 'hulk_up')) {
      emit(state, { type: 'status-removed', targetUid: actor.uid, statusId: 'hulk_up', cause: 'anger_unleashed' });
    }
    for (const effect of ability.effects) {
      if (effect.target === 'self') applyEffect(state, actor, actor, effect);
      if (effect.target === 'all_allies') {
        for (const ally of state.combatants.filter((c) => c.team === actor.team && isAlive(c))) {
          applyEffect(state, actor, ally, effect);
        }
      }
    }
  }

  checkWinner(state);
  if (!state.winner && !(quick && isAlive(actor))) {
    endTurn(state, actor);
    state.turnIndex++;
    advance(state);
  }
  return state.log.slice(logStart);
}

function applyEffect(state: BattleState, actor: Combatant, target: Combatant, effect: Ability['effects'][number]) {
  if (effect.chance < 1 && nextRandom(state) >= effect.chance) {
    emit(state, { type: 'status-resisted', targetUid: target.uid, statusId: effect.id });
    return;
  }
  if (state.statusById.get(effect.id)?.kind === 'instant') {
    applyInstant(state, target, effect.id);
    return;
  }
  const status = addStatus(state, target, effect.id, effect.duration, effect.stacks);
  if (target === actor) status.fresh = true;
  emit(state, {
    type: 'status-applied',
    targetUid: target.uid,
    statusId: effect.id,
    duration: effect.duration,
    stacks: status.stacks,
  });
}

/** Efectos de un solo uso, que no se quedan en el objetivo. */
function applyInstant(state: BattleState, target: Combatant, id: string) {
  if (id === 'remove_buffs') {
    for (const s of target.statuses.filter((x) => isBuff(state, x.id))) {
      removeStatus(target, s.id);
      emit(state, { type: 'status-removed', targetUid: target.uid, statusId: s.id, cause: id });
    }
  }
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

/** Un golpe: tirada de acierto, de daño y de crítico, y contraataque si toca. Devuelve si acertó. */
function strike(state: BattleState, attacker: Combatant, defender: Combatant, ability: Ability): boolean {
  if (nextRandom(state) * 100 >= hitChance(state, attacker, defender, ability)) {
    emit(state, { type: 'miss', sourceUid: attacker.uid, targetUid: defender.uid });
    return false;
  }
  const range = ability.damage!;
  const hits = Math.max(1, ability.hits);
  const min = range.min / hits;
  const max = range.max / hits;
  const base = min + nextRandom(state) * (max - min);
  const crit = nextRandom(state) * 100 < critChance(state, attacker, ability);
  const { amount, beforeTaken } = damageBreakdown(state, attacker, defender, base, crit, ability);
  applyDamage(state, defender, amount, {
    sourceUid: attacker.uid,
    crit,
    matchup: matchupBetween(state, attacker, defender),
    cause: 'ability',
  });
  counter(state, attacker, defender, ability, beforeTaken);
  return true;
}

/** Devuelve parte del golpe a un atacante cuerpo a cuerpo si el defensor tiene un efecto de contraataque. */
function counter(state: BattleState, attacker: Combatant, defender: Combatant, ability: Ability, beforeTaken: number) {
  if (ability.type !== 'melee' || !isAlive(defender) || !isAlive(attacker)) return;
  if (hasProperty(ability, 'subtle') || hasProperty(ability, 'stealthy')) return;
  if (hasFlag(state, defender, 'noCounter')) return;
  const percent = sumModifier(state, defender, 'counterPercent');
  if (percent <= 0) return;
  const amount = Math.max(1, Math.round((beforeTaken * percent) / 100));
  applyDamage(state, attacker, amount, { sourceUid: defender.uid, crit: false, matchup: 'neutral', cause: 'counter' });
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
    const skip = actor.statuses.find((s) => state.statusById.get(s.id)?.modifiers.skipTurn);
    if (skip) {
      emit(state, { type: 'turn-skipped', actorUid: actor.uid, reason: skip.id });
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
    if (!isAlive(actor)) break;
    const mods = state.statusById.get(status.id)?.modifiers;
    if (!mods) continue;
    if (mods.healOverTimePercent) {
      heal(state, actor, Math.max(1, Math.round((actor.stats.health * mods.healOverTimePercent * status.stacks) / 100)), status.id);
    }
    if (mods.damageOverTimePercent) {
      const amount = Math.max(1, Math.round((actor.stats.health * mods.damageOverTimePercent * status.stacks) / 100));
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
