import { describe, expect, it } from 'vitest';
import { abilities, abilityById, classesData, heroById } from '../../src/data';
import {
  chooseAiAction,
  computeDamage,
  createBattle,
  currentActor,
  getCombatant,
  hitChance,
  InvalidActionError,
  performAction,
  STATUS_NAMES,
  type BattleState,
  type CombatData,
} from '../../src/core/combat';
import type { Ability, Hero, HeroClassId, HeroStats } from '../../src/types/game';

const gameData: CombatData = { classes: classesData, abilityById };

/** Golpe básico de prueba: 100 de daño fijo, un golpe. */
const HIT: Ability = {
  id: 'hit',
  heroId: 'test',
  name: 'Golpe',
  type: 'melee',
  target: 'single_enemy',
  staminaCost: 0,
  cooldown: 0,
  damage: { min: 100, max: 100 },
  hits: 1,
  effects: [],
  description: '',
};
const WAIT: Ability = { ...HIT, id: 'wait', name: 'Esperar', type: 'buff', target: 'self', damage: null, hits: 0 };

function ability(overrides: Partial<Ability>): Ability {
  return { ...HIT, ...overrides };
}

/**
 * Héroe de prueba: ataque 100, defensa 0 y precisión perfecta para que el daño
 * sea exacto. Las habilidades extra se registran en el CombatData devuelto.
 */
function hero(id: string, opts: { classId?: HeroClassId; stats?: Partial<HeroStats>; abilities?: Ability[] } = {}): Hero {
  const abilities = opts.abilities ?? [HIT];
  for (const a of abilities) testAbilities.set(a.id, a);
  return {
    id,
    name: id,
    classId: opts.classId ?? 'generalist',
    description: '',
    baseStats: { health: 1000, stamina: 100, attack: 100, defense: 0, accuracy: 100, evasion: 0, ...opts.stats },
    abilityIds: abilities.map((a) => a.id),
  };
}
const testAbilities = new Map<string, Ability>();
const testData: CombatData = { classes: classesData, abilityById: testAbilities };

function battle(player: Hero[], enemy: Hero[], seed = 1): BattleState {
  return createBattle(player, enemy, testData, seed);
}

function playToEnd(state: BattleState, maxActions = 2000): void {
  for (let n = 0; !state.winner; n++) {
    if (n > maxActions) throw new Error('La batalla no termina');
    performAction(state, chooseAiAction(state));
  }
}

describe('daño y ventajas de clase', () => {
  it('la ventaja sube el daño un 25% y la desventaja lo baja un 25%', () => {
    const s = battle([hero('a', { classId: 'blaster' })], [hero('b', { classId: 'bruiser' })]);
    const blaster = getCombatant(s, 'player-0');
    const bruiser = getCombatant(s, 'enemy-0');
    expect(computeDamage(s, blaster, bruiser, 100, false)).toBe(125);
    expect(computeDamage(s, bruiser, blaster, 100, false)).toBe(75);
  });

  it('Generalist no aplica ni recibe modificadores', () => {
    const s = battle([hero('a', { classId: 'generalist' })], [hero('b', { classId: 'bruiser' })]);
    expect(computeDamage(s, getCombatant(s, 'player-0'), getCombatant(s, 'enemy-0'), 100, false)).toBe(100);
    expect(computeDamage(s, getCombatant(s, 'enemy-0'), getCombatant(s, 'player-0'), 100, false)).toBe(100);
  });

  it('el ataque escala sobre 100, la defensa mitiga con 200 / (200 + def) y el crítico hace x1.5', () => {
    const s = battle([hero('a', { stats: { attack: 150 } })], [hero('b', { stats: { defense: 200 } })]);
    const a = getCombatant(s, 'player-0');
    const b = getCombatant(s, 'enemy-0');
    expect(computeDamage(s, a, b, 100, false)).toBe(75);
    expect(computeDamage(s, a, b, 100, true)).toBe(113);
  });

  it('la evasión reduce la probabilidad de acierto, con un mínimo de 10%', () => {
    const s = battle([hero('a', { stats: { accuracy: 80 } })], [hero('b', { stats: { evasion: 30 } })]);
    const a = getCombatant(s, 'player-0');
    const b = getCombatant(s, 'enemy-0');
    expect(hitChance(a, b)).toBe(70);
    b.stats.evasion = 500;
    expect(hitChance(a, b)).toBe(10);
  });

  it('aplica el daño y deja KO al llegar a 0 de vida', () => {
    const s = battle([hero('a')], [hero('glass', { stats: { health: 50 } })]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'enemy-0' });
    expect(getCombatant(s, 'enemy-0').hp).toBe(0);
    expect(events.map((e) => e.type)).toContain('ko');
    expect(s.winner).toBe('player');
  });

  it('un golpe que falla genera un evento miss y no hace daño', () => {
    const s = battle([hero('a', { stats: { accuracy: 0 } })], [hero('b', { stats: { evasion: 1000 }, abilities: [WAIT] })]);
    let misses = 0;
    for (let i = 0; i < 20; i++) {
      const events = performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'enemy-0' });
      misses += events.filter((e) => e.type === 'miss').length;
      performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    }
    // 10% de acierto: casi todo falla, y cada fallo no quita vida.
    expect(misses).toBeGreaterThan(12);
    expect(getCombatant(s, 'enemy-0').hp).toBe(1000 - (20 - misses) * 100);
  });
});

describe('orden de turnos', () => {
  it('alterna jugador y enemigo por posición', () => {
    const s = battle([hero('a'), hero('b'), hero('c')], [hero('d'), hero('e'), hero('f')]);
    expect(s.turnOrder).toEqual(['player-0', 'enemy-0', 'player-1', 'enemy-1', 'player-2', 'enemy-2']);
    expect(currentActor(s)?.uid).toBe('player-0');
  });

  it('rechaza acciones fuera de turno, sin objetivo o con objetivo inválido', () => {
    const s = battle([hero('a'), hero('b')], [hero('c')]);
    expect(() => performAction(s, { actorUid: 'enemy-0', abilityId: 'hit', targetUid: 'player-0' })).toThrow(InvalidActionError);
    expect(() => performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'player-1' })).toThrow(InvalidActionError);
    expect(() => performAction(s, { actorUid: 'player-0', abilityId: 'hit' })).toThrow(InvalidActionError);
  });

  it('salta a los caídos y empieza otra ronda al terminar la anterior', () => {
    const s = battle([hero('a')], [hero('b'), hero('c')]);
    getCombatant(s, 'enemy-0').hp = 0;
    performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'enemy-1' });
    expect(currentActor(s)?.uid).toBe('enemy-1');
    performAction(s, { actorUid: 'enemy-1', abilityId: 'hit', targetUid: 'player-0' });
    expect(s.round).toBe(2);
    expect(s.turnOrder).toEqual(['player-0', 'enemy-1']);
  });
});

describe('stamina y cooldown', () => {
  const special = ability({ id: 'special', staminaCost: 60, cooldown: 1 });

  it('gasta stamina, recupera 10% por turno y respeta el cooldown', () => {
    const s = battle([hero('a', { abilities: [HIT, special] })], [hero('b')]);
    const actor = getCombatant(s, 'player-0');
    expect(actor.stamina).toBe(100);
    performAction(s, { actorUid: 'player-0', abilityId: 'special', targetUid: 'enemy-0' });
    expect(actor.stamina).toBe(40);
    performAction(s, { actorUid: 'enemy-0', abilityId: 'hit', targetUid: 'player-0' });
    expect(actor.stamina).toBe(50);
    expect(() => performAction(s, { actorUid: 'player-0', abilityId: 'special', targetUid: 'enemy-0' })).toThrow(/no está disponible/);
    performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'enemy-0' });
    performAction(s, { actorUid: 'enemy-0', abilityId: 'hit', targetUid: 'player-0' });
    // Cooldown cumplido y 60 de stamina: vuelve a estar disponible.
    expect(actor.stamina).toBe(60);
    expect(() => performAction(s, { actorUid: 'player-0', abilityId: 'special', targetUid: 'enemy-0' })).not.toThrow();
  });

  it('sin stamina suficiente la habilidad no se puede usar', () => {
    const s = battle([hero('a', { abilities: [HIT, ability({ id: 'big', staminaCost: 150 })] })], [hero('b')]);
    expect(() => performAction(s, { actorUid: 'player-0', abilityId: 'big', targetUid: 'enemy-0' })).toThrow(/no está disponible/);
  });
});

describe('estados alterados', () => {
  const stun = ability({ id: 'stun', damage: null, hits: 0, effects: [{ id: 'stun', duration: 1, chance: 1 }] });

  it('aturdido pierde su siguiente turno y luego se le pasa', () => {
    const s = battle([hero('a', { abilities: [stun] })], [hero('b')]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'stun', targetUid: 'enemy-0' });
    expect(events).toContainEqual({ type: 'turn-skipped', actorUid: 'enemy-0', reason: 'stun' });
    expect(currentActor(s)?.uid).toBe('player-0');
    expect(getCombatant(s, 'enemy-0').statuses).toEqual([]);
  });

  it('sangrado quita 6% de la vida máxima al empezar cada turno durante su duración', () => {
    const cut = ability({ id: 'cut', damage: null, hits: 0, effects: [{ id: 'bleed', duration: 2, chance: 1 }] });
    const s = battle([hero('a', { abilities: [cut, WAIT] })], [hero('b', { abilities: [WAIT] })]);
    const victim = getCombatant(s, 'enemy-0');
    performAction(s, { actorUid: 'player-0', abilityId: 'cut', targetUid: 'enemy-0' });
    expect(victim.hp).toBe(940);
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    performAction(s, { actorUid: 'player-0', abilityId: 'wait' });
    expect(victim.hp).toBe(880);
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    performAction(s, { actorUid: 'player-0', abilityId: 'wait' });
    expect(victim.hp).toBe(880);
    expect(victim.statuses).toEqual([]);
  });

  it('regeneración cura sin pasar de la vida máxima', () => {
    const regen = ability({ id: 'regen', type: 'heal', target: 'self', damage: null, hits: 0, effects: [{ id: 'regeneration', duration: 3, chance: 1 }] });
    const s = battle([hero('a', { abilities: [regen, WAIT] })], [hero('b', { abilities: [WAIT] })]);
    const a = getCombatant(s, 'player-0');
    a.hp = 950;
    performAction(s, { actorUid: 'player-0', abilityId: 'regen' });
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    expect(a.hp).toBe(1000);
  });

  it('un buff propio no pierde duración en el turno en que se aplica', () => {
    const guard = ability({ id: 'guard', type: 'buff', target: 'self', damage: null, hits: 0, effects: [{ id: 'defense_up', duration: 1, chance: 1 }] });
    const s = battle([hero('a', { abilities: [guard], stats: { defense: 200 } })], [hero('b')]);
    performAction(s, { actorUid: 'player-0', abilityId: 'guard' });
    const events = performAction(s, { actorUid: 'enemy-0', abilityId: 'hit', targetUid: 'player-0' });
    // Defensa 200 x1.5 = 300 → 100 * 200/500 = 40 (sin el buff serían 50).
    expect(events.find((e) => e.type === 'damage')).toMatchObject({ amount: 40 });
    // Se agota al terminar su siguiente turno.
    performAction(s, { actorUid: 'player-0', abilityId: 'guard' });
    expect(getCombatant(s, 'player-0').statuses.map((x) => x.id)).toEqual(['defense_up']);
  });

  it('ataque arriba/abajo y defensa abajo modifican el daño', () => {
    const s = battle([hero('a')], [hero('b', { stats: { defense: 200 } })]);
    const a = getCombatant(s, 'player-0');
    const b = getCombatant(s, 'enemy-0');
    a.statuses.push({ id: 'attack_up', turnsLeft: 1 });
    expect(computeDamage(s, a, b, 100, false)).toBe(63); // 125 * 0.5
    a.statuses = [{ id: 'attack_down', turnsLeft: 1 }];
    expect(computeDamage(s, a, b, 100, false)).toBe(38); // 75 * 0.5
    a.statuses = [];
    b.statuses.push({ id: 'defense_down', turnsLeft: 1 });
    expect(computeDamage(s, a, b, 100, false)).toBe(63); // def 120 → 200/320
  });

  it('precisión abajo reduce la probabilidad de acierto', () => {
    const s = battle([hero('a', { stats: { accuracy: 80 } })], [hero('b')]);
    const a = getCombatant(s, 'player-0');
    a.statuses.push({ id: 'accuracy_down', turnsLeft: 1 });
    expect(hitChance(a, getCombatant(s, 'enemy-0'))).toBe(75);
  });

  it('todos los efectos de data/abilities.json tienen mecánica en el motor', () => {
    for (const a of abilities) {
      for (const e of a.effects) expect(Object.keys(STATUS_NAMES)).toContain(e.id);
    }
  });

  it('un efecto con probabilidad puede resistirse', () => {
    const tryStun = ability({ id: 'try', damage: null, hits: 0, effects: [{ id: 'stun', duration: 1, chance: 0 }] });
    const s = battle([hero('a', { abilities: [tryStun] })], [hero('b')]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'try', targetUid: 'enemy-0' });
    expect(events).toContainEqual({ type: 'status-resisted', targetUid: 'enemy-0', statusId: 'stun' });
  });

  it('los efectos de un ataque no entran si todos los golpes fallan', () => {
    const stunHit = ability({ id: 'stun-hit', effects: [{ id: 'stun', duration: 1, chance: 1 }] });
    const s = battle([hero('a', { abilities: [stunHit], stats: { accuracy: 0 } })], [hero('b', { stats: { evasion: 1000 } })], 3);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'stun-hit', targetUid: 'enemy-0' });
    if (events.some((e) => e.type === 'miss')) {
      expect(events.some((e) => e.type === 'status-applied')).toBe(false);
    }
  });
});

describe('habilidades de área', () => {
  it('all_enemies golpea a todos los enemigos vivos, cada golpe por separado', () => {
    const aoe = ability({ id: 'aoe', target: 'all_enemies', hits: 2 });
    const s = battle([hero('a', { abilities: [aoe] })], [hero('b'), hero('c'), hero('d')]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'aoe' });
    const damage = events.filter((e) => e.type === 'damage');
    expect(damage).toHaveLength(6);
    expect(new Set(damage.map((e) => e.targetUid))).toEqual(new Set(['enemy-0', 'enemy-1', 'enemy-2']));
  });

  it('all_allies aplica el buff a todo el equipo', () => {
    const rally = ability({ id: 'rally', type: 'buff', target: 'all_allies', damage: null, hits: 0, effects: [{ id: 'attack_up', duration: 2, chance: 1 }] });
    const s = battle([hero('a', { abilities: [rally] }), hero('b')], [hero('c')]);
    performAction(s, { actorUid: 'player-0', abilityId: 'rally' });
    expect(getCombatant(s, 'player-1').statuses.map((x) => x.id)).toEqual(['attack_up']);
  });
});

describe('batalla completa 3 contra 3 con los datos del juego', () => {
  const players = ['iron_man', 'captain_america', 'thor'].map((id) => heroById.get(id)!);
  const enemies = ['hulk', 'wolverine', 'black_widow'].map((id) => heroById.get(id)!);

  it('se juega hasta el final con la IA en ambos bandos', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createBattle(players, enemies, gameData, seed);
      playToEnd(s);
      const losers = s.combatants.filter((c) => c.team !== s.winner);
      expect(losers.every((c) => c.hp === 0)).toBe(true);
      expect(s.log.at(-1)).toEqual({ type: 'battle-end', winner: s.winner });
    }
  });

  it('es determinista con la misma semilla', () => {
    const a = createBattle(players, enemies, gameData, 42);
    const b = createBattle(players, enemies, gameData, 42);
    playToEnd(a);
    playToEnd(b);
    expect(a.log).toEqual(b.log);
  });

  it('no permite actuar cuando la batalla terminó', () => {
    const s = createBattle(players, enemies, gameData, 7);
    playToEnd(s);
    expect(currentActor(s)).toBeNull();
    expect(() => performAction(s, { actorUid: 'player-0', abilityId: 'iron_man_repulsor', targetUid: 'enemy-0' })).toThrow(InvalidActionError);
  });
});
