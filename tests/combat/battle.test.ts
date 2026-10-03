import { describe, expect, it } from 'vitest';
import { abilities, abilityById, classesData, heroById, statusById } from '../../src/data';
import {
  chooseAiAction,
  computeDamage,
  createBattle,
  currentActor,
  getCombatant,
  hitChance,
  InvalidActionError,
  performAction,
  REST_ABILITY,
  staminaCost,
  type BattleState,
  STAT_REFERENCE as REF,
  type CombatData,
} from '../../src/core/combat';
import type { Ability, AbilityEffect, Hero, HeroClassId, HeroStats } from '../../src/types/game';

const gameData: CombatData = { classes: classesData, abilityById, statusById };

/** Golpe básico de prueba: 100 de daño fijo, un golpe, siempre acierta y nunca es crítico. */
const HIT: Ability = {
  id: 'hit',
  heroId: 'test',
  name: 'Golpe',
  unlockLevel: 1,
  type: 'melee',
  tags: [],
  target: 'single_enemy',
  staminaCostPercent: 0,
  cooldown: 0,
  hits: 1,
  accuracy: 100,
  critChance: 0,
  damage: { min: 100, max: 100 },
  damageEstimated: false,
  properties: [],
  effects: [],
  description: '',
};
const WAIT: Ability = { ...HIT, id: 'wait', name: 'Esperar', type: 'buff', target: 'self', damage: null, hits: 0 };

function ability(overrides: Partial<Ability>): Ability {
  return { ...HIT, ...overrides };
}

function effect(id: string, duration: number, overrides: Partial<AbilityEffect> = {}): AbilityEffect {
  return { id, target: 'target', duration, chance: 1, stacks: 1, ...overrides };
}

/**
 * Héroe de prueba: todos los stats de combate en el valor de referencia (3
 * estrellas), así el daño y el acierto son exactamente los de la ficha. Las
 * habilidades extra se registran en el CombatData de prueba.
 */
function hero(id: string, opts: { classId?: HeroClassId; stats?: Partial<HeroStats>; abilities?: Ability[] } = {}): Hero {
  const abilities = opts.abilities ?? [HIT];
  for (const a of abilities) testAbilities.set(a.id, a);
  return {
    id,
    name: id,
    classId: opts.classId ?? 'generalist',
    description: '',
    baseStats: { health: 1000, stamina: 100, attack: REF, defense: REF, accuracy: REF, evasion: REF, ...opts.stats },
    abilityIds: abilities.map((a) => a.id),
  };
}
const testAbilities = new Map<string, Ability>();
const testData: CombatData = { classes: classesData, abilityById: testAbilities, statusById };

function battle(player: Hero[], enemy: Hero[], seed = 1): BattleState {
  return createBattle(player, enemy, testData, seed);
}

function damages(events: ReturnType<typeof performAction>) {
  return events.filter((e) => e.type === 'damage').map((e) => (e.type === 'damage' ? e.amount : 0));
}

function playToEnd(state: BattleState, maxActions = 3000): void {
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

  it('la defensa mitiga con 2·REF / (REF + def) y el crítico hace x1.5; el ataque ya viene en la ficha', () => {
    const s = battle([hero('a', { stats: { attack: 1717 } })], [hero('b', { stats: { defense: 1717 } }), hero('c', { stats: { defense: 1144 } })]);
    const a = getCombatant(s, 'player-0');
    expect(computeDamage(s, a, getCombatant(s, 'enemy-0'), 100, false)).toBe(91);
    expect(computeDamage(s, a, getCombatant(s, 'enemy-0'), 100, true)).toBe(136);
    expect(computeDamage(s, a, getCombatant(s, 'enemy-1'), 100, false)).toBe(111);
  });

  it('el daño de la ficha es el total y se reparte entre los golpes', () => {
    const twice = ability({ id: 'twice', hits: 2, damage: { min: 200, max: 200 } });
    const s = battle([hero('a', { abilities: [twice] })], [hero('b')]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'twice', targetUid: 'enemy-0' });
    expect(damages(events)).toEqual([100, 100]);
  });

  it('acierto = ficha ± 5 por estrella de precisión contra evasión, con un mínimo de 10%', () => {
    const s = battle([hero('a')], [hero('b', { stats: { evasion: 1717 } })]);
    const a = getCombatant(s, 'player-0');
    const b = getCombatant(s, 'enemy-0');
    expect(hitChance(s, a, b, ability({ accuracy: 80 }))).toBe(70);
    a.stats.accuracy = 1717;
    b.stats.evasion = 1144;
    expect(hitChance(s, a, b, ability({ accuracy: 60 }))).toBe(80);
    b.stats.evasion = 100000;
    expect(hitChance(s, a, b, ability({ accuracy: 80 }))).toBe(10);
  });

  it('la probabilidad de crítico sale de la habilidad; críticos letales hacen x2', () => {
    const crit = ability({ id: 'crit', critChance: 100 });
    const deadly = ability({ id: 'deadly', critChance: 100, properties: ['deadly_crits'] });
    const s = battle([hero('a', { abilities: [crit, deadly] })], [hero('b', { abilities: [WAIT] })]);
    expect(damages(performAction(s, { actorUid: 'player-0', abilityId: 'crit', targetUid: 'enemy-0' }))).toEqual([150]);
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    expect(damages(performAction(s, { actorUid: 'player-0', abilityId: 'deadly', targetUid: 'enemy-0' }))).toEqual([200]);
  });

  it('aplica el daño y deja KO al llegar a 0 de vida', () => {
    const s = battle([hero('a')], [hero('glass', { stats: { health: 50 } })]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'enemy-0' });
    expect(getCombatant(s, 'enemy-0').hp).toBe(0);
    expect(events.map((e) => e.type)).toContain('ko');
    expect(s.winner).toBe('player');
  });

  it('un golpe que falla genera un evento miss y no hace daño', () => {
    const s = battle([hero('a', { abilities: [ability({ accuracy: 0 })] })], [hero('b', { stats: { evasion: 100000 }, abilities: [WAIT] })]);
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

  it('una acción rápida no gasta el turno', () => {
    const quick = ability({ id: 'quick', type: 'buff', target: 'self', damage: null, hits: 0, cooldown: 2, properties: ['quick_action'], effects: [effect('attack_up', 1)] });
    const s = battle([hero('a', { abilities: [HIT, quick] })], [hero('b')]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'quick' });
    expect(events.find((e) => e.type === 'ability-used')).toMatchObject({ quick: true });
    expect(currentActor(s)?.uid).toBe('player-0');
    // Ya con el buff, el golpe normal sí cierra el turno.
    expect(damages(performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'enemy-0' }))).toEqual([125]);
    expect(currentActor(s)?.uid).toBe('enemy-0');
  });
});

describe('stamina y cooldown', () => {
  const special = ability({ id: 'special', staminaCostPercent: 60, cooldown: 1 });

  it('el coste es un % de la stamina máxima', () => {
    const s = battle([hero('a', { abilities: [special], stats: { stamina: 50 } })], [hero('b')]);
    expect(staminaCost(getCombatant(s, 'player-0'), special)).toBe(30);
  });

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

  it('sin stamina suficiente la habilidad no se puede usar, pero siempre se puede descansar', () => {
    const big = ability({ id: 'big', staminaCostPercent: 150 });
    const s = battle([hero('a', { abilities: [big] })], [hero('b')]);
    expect(() => performAction(s, { actorUid: 'player-0', abilityId: 'big', targetUid: 'enemy-0' })).toThrow(/no está disponible/);
    expect(chooseAiAction(s).abilityId).toBe(REST_ABILITY.id);
    const a = getCombatant(s, 'player-0');
    a.stamina = 10;
    performAction(s, { actorUid: 'player-0', abilityId: REST_ABILITY.id });
    expect(a.stamina).toBe(35);
  });
});

describe('efectos', () => {
  const stun = ability({ id: 'stun', damage: null, hits: 0, effects: [effect('stun', 1)] });

  it('aturdido pierde su siguiente turno y luego se le pasa', () => {
    const s = battle([hero('a', { abilities: [stun] })], [hero('b')]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'stun', targetUid: 'enemy-0' });
    expect(events).toContainEqual({ type: 'turn-skipped', actorUid: 'enemy-0', reason: 'stun' });
    expect(currentActor(s)?.uid).toBe('player-0');
    expect(getCombatant(s, 'enemy-0').statuses).toEqual([]);
  });

  it('sangrado x2 quita 4% de la vida máxima por acumulación al empezar cada turno', () => {
    const cut = ability({ id: 'cut', damage: null, hits: 0, effects: [effect('bleed', 2, { stacks: 2 })] });
    const s = battle([hero('a', { abilities: [cut, WAIT] })], [hero('b', { abilities: [WAIT] })]);
    const victim = getCombatant(s, 'enemy-0');
    performAction(s, { actorUid: 'player-0', abilityId: 'cut', targetUid: 'enemy-0' });
    expect(victim.hp).toBe(920);
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    performAction(s, { actorUid: 'player-0', abilityId: 'wait' });
    expect(victim.hp).toBe(840);
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    performAction(s, { actorUid: 'player-0', abilityId: 'wait' });
    expect(victim.hp).toBe(840);
    expect(victim.statuses).toEqual([]);
  });

  it('las acumulaciones no pasan del máximo del efecto', () => {
    const cut = ability({ id: 'cut', damage: null, hits: 0, effects: [effect('bleed', 3, { stacks: 4 })] });
    const s = battle([hero('a', { abilities: [cut] })], [hero('b', { abilities: [WAIT] })]);
    performAction(s, { actorUid: 'player-0', abilityId: 'cut', targetUid: 'enemy-0' });
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    performAction(s, { actorUid: 'player-0', abilityId: 'cut', targetUid: 'enemy-0' });
    expect(getCombatant(s, 'enemy-0').statuses[0]).toMatchObject({ id: 'bleed', stacks: statusById.get('bleed')!.maxStacks });
  });

  it('regeneración cura sin pasar de la vida máxima', () => {
    const regen = ability({ id: 'regen', type: 'heal', target: 'self', damage: null, hits: 0, effects: [effect('regeneration', 3)] });
    const s = battle([hero('a', { abilities: [regen, WAIT] })], [hero('b', { abilities: [WAIT] })]);
    const a = getCombatant(s, 'player-0');
    a.hp = 950;
    performAction(s, { actorUid: 'player-0', abilityId: 'regen' });
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    expect(a.hp).toBe(1000);
  });

  it('un buff propio no pierde duración en el turno en que se aplica', () => {
    const guard = ability({ id: 'guard', type: 'buff', target: 'self', damage: null, hits: 0, effects: [effect('defense_up', 1)] });
    const s = battle([hero('a', { abilities: [guard] })], [hero('b')]);
    performAction(s, { actorUid: 'player-0', abilityId: 'guard' });
    const events = performAction(s, { actorUid: 'enemy-0', abilityId: 'hit', targetUid: 'player-0' });
    // Defensa x1.5 → 100 × 2·REF / (REF + 1.5·REF) = 80 (sin el buff serían 100).
    expect(damages(events)).toEqual([80]);
    performAction(s, { actorUid: 'player-0', abilityId: 'guard' });
    expect(getCombatant(s, 'player-0').statuses.map((x) => x.id)).toEqual(['defense_up']);
  });

  it('modificadores de daño hecho, daño recibido y defensa', () => {
    const s = battle([hero('a')], [hero('b')]);
    const a = getCombatant(s, 'player-0');
    const b = getCombatant(s, 'enemy-0');
    a.statuses = [{ id: 'attack_up', turnsLeft: 1, stacks: 1 }];
    expect(computeDamage(s, a, b, 100, false)).toBe(125);
    a.statuses = [{ id: 'weakened', turnsLeft: 1, stacks: 1 }];
    expect(computeDamage(s, a, b, 100, false)).toBe(75);
    a.statuses = [{ id: 'might_of_mjolnir', turnsLeft: 1, stacks: 3 }];
    expect(computeDamage(s, a, b, 100, false)).toBe(130);
    a.statuses = [];
    b.statuses = [{ id: 'defense_down', turnsLeft: 1, stacks: 1 }];
    expect(computeDamage(s, a, b, 100, false)).toBe(125); // defensa 0.6·REF → 2/1.6
    b.statuses = [{ id: 'target_focus', turnsLeft: 1, stacks: 1 }];
    expect(computeDamage(s, a, b, 100, false)).toBe(120);
    b.statuses = [{ id: 'deflector_shield', turnsLeft: 1, stacks: 1 }];
    expect(computeDamage(s, a, b, 100, false)).toBe(70);
  });

  it('precisión y evasión de los efectos cambian el acierto', () => {
    const s = battle([hero('a')], [hero('b', { stats: { evasion: 1717 } })]);
    const a = getCombatant(s, 'player-0');
    const b = getCombatant(s, 'enemy-0');
    const shot = ability({ accuracy: 80 });
    a.statuses = [{ id: 'dizzy', turnsLeft: 1, stacks: 1 }];
    expect(hitChance(s, a, b, shot)).toBe(45); // 80 − 10 por evasión − 25
    a.statuses = [];
    b.statuses = [{ id: 'cornered', turnsLeft: 1, stacks: 1 }];
    expect(hitChance(s, a, b, shot)).toBe(90);
    // Incapacitado: su evasión no cuenta, queda como un objetivo de referencia.
    b.statuses = [{ id: 'incapacitated', turnsLeft: 1, stacks: 1 }];
    expect(hitChance(s, a, b, shot)).toBe(80);
    b.statuses = [{ id: 'lock_on', turnsLeft: 1, stacks: 1 }];
    expect(hitChance(s, a, b, ability({ accuracy: 20 }))).toBe(100);
    b.statuses = [];
    expect(hitChance(s, a, b, ability({ accuracy: 20, properties: ['catastrophic'] }))).toBe(100);
  });

  it('todos los efectos de data/abilities.json están definidos en data/statuses.json', () => {
    for (const a of abilities) {
      for (const e of a.effects) expect(statusById.has(e.id), `${a.id} → ${e.id}`).toBe(true);
    }
  });

  it('un efecto con probabilidad puede resistirse', () => {
    const tryStun = ability({ id: 'try', damage: null, hits: 0, effects: [effect('stun', 1, { chance: 0 })] });
    const s = battle([hero('a', { abilities: [tryStun] })], [hero('b')]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'try', targetUid: 'enemy-0' });
    expect(events).toContainEqual({ type: 'status-resisted', targetUid: 'enemy-0', statusId: 'stun' });
  });

  it('los efectos sobre el objetivo no entran si todos los golpes fallan; los propios sí', () => {
    const stunHit = ability({ id: 'stun-hit', accuracy: 0, effects: [effect('stun', 1), effect('attack_up', 2, { target: 'self' })] });
    const s = battle([hero('a', { abilities: [stunHit] })], [hero('b', { stats: { evasion: 100000 } })], 3);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'stun-hit', targetUid: 'enemy-0' });
    expect(events.some((e) => e.type === 'miss')).toBe(true);
    expect(events.filter((e) => e.type === 'status-applied')).toEqual([
      { type: 'status-applied', targetUid: 'player-0', statusId: 'attack_up', duration: 2, stacks: 1 },
    ]);
  });

  it('quitar mejoras borra los buffs del objetivo y deja los debuffs', () => {
    const kick = ability({ id: 'kick', effects: [effect('remove_buffs', 0)] });
    const s = battle([hero('a', { abilities: [kick] })], [hero('b')]);
    const b = getCombatant(s, 'enemy-0');
    b.statuses = [
      { id: 'attack_up', turnsLeft: 2, stacks: 1 },
      { id: 'bleed', turnsLeft: 2, stacks: 1 },
      { id: 'deflector_shield', turnsLeft: 2, stacks: 1 },
    ];
    performAction(s, { actorUid: 'player-0', abilityId: 'kick', targetUid: 'enemy-0' });
    expect(b.statuses.map((x) => x.id)).toEqual(['bleed']);
  });
});

describe('propiedades especiales', () => {
  it('ataque poderoso atraviesa las reducciones de daño pero no las subidas', () => {
    const mighty = ability({ properties: ['mighty_attack'] });
    const s = battle([hero('a')], [hero('b')]);
    const a = getCombatant(s, 'player-0');
    const b = getCombatant(s, 'enemy-0');
    b.statuses = [
      { id: 'deflector_shield', turnsLeft: 1, stacks: 1 },
      { id: 'target_focus', turnsLeft: 1, stacks: 1 },
    ];
    expect(computeDamage(s, a, b, 100, false, mighty)).toBe(120);
    expect(computeDamage(s, a, b, 100, false, HIT)).toBe(90);
  });

  it('adamantium ignora la mitad de la defensa', () => {
    const s = battle([hero('a')], [hero('b')]);
    const claws = ability({ properties: ['adamantium'] });
    // Defensa REF/2 → 100 × 2 / 1.5.
    expect(computeDamage(s, getCombatant(s, 'player-0'), getCombatant(s, 'enemy-0'), 100, false, claws)).toBe(133);
  });

  it('explota combos: +50% contra Combo preparado, lo consume y lo vuelve a poner', () => {
    const combo = ability({ id: 'combo', properties: ['exploits_combos'], effects: [effect('combo_setup', 2)] });
    const s = battle([hero('a', { abilities: [combo] })], [hero('b', { abilities: [WAIT] })]);
    expect(damages(performAction(s, { actorUid: 'player-0', abilityId: 'combo', targetUid: 'enemy-0' }))).toEqual([100]);
    performAction(s, { actorUid: 'enemy-0', abilityId: 'wait' });
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'combo', targetUid: 'enemy-0' });
    expect(damages(events)).toEqual([150]);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['status-removed', 'status-applied']));
  });

  it('explota sangrados: +25% por acumulación de sangrado', () => {
    const s = battle([hero('a')], [hero('b')]);
    const b = getCombatant(s, 'enemy-0');
    b.statuses = [{ id: 'bleed', turnsLeft: 2, stacks: 2 }];
    const frenzy = ability({ properties: ['exploits_bleeds'] });
    expect(computeDamage(s, getCombatant(s, 'player-0'), b, 100, false, frenzy)).toBe(150);
  });

  it('furia desatada consume Hulk se crece y pega más por cada acumulación', () => {
    const smash = ability({ id: 'smash', properties: ['anger_unleashed'] });
    const s = battle([hero('a', { abilities: [smash] })], [hero('b')]);
    const a = getCombatant(s, 'player-0');
    a.statuses = [{ id: 'hulk_up', turnsLeft: 5, stacks: 2 }];
    // +30% por el buff y otro +30% por la furia: 100 × 1.3 × 1.3.
    expect(damages(performAction(s, { actorUid: 'player-0', abilityId: 'smash', targetUid: 'enemy-0' }))).toEqual([169]);
    expect(a.statuses).toEqual([]);
  });

  it('guardia de escudo reduce el daño a la mitad y contraataca al cuerpo a cuerpo', () => {
    const s = battle([hero('a')], [hero('b')]);
    const b = getCombatant(s, 'enemy-0');
    b.statuses = [{ id: 'shield_guard', turnsLeft: 1, stacks: 1 }];
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'enemy-0' });
    expect(events.filter((e) => e.type === 'damage')).toMatchObject([
      { targetUid: 'enemy-0', amount: 50, cause: 'ability' },
      { targetUid: 'player-0', amount: 25, cause: 'counter' },
    ]);
  });

  it('los ataques sutiles, sigilosos o a distancia no provocan contraataque', () => {
    for (const a of [ability({ properties: ['subtle'] }), ability({ properties: ['stealthy'] }), ability({ type: 'ranged' })]) {
      const s = battle([hero('a', { abilities: [a] })], [hero('b', { abilities: [WAIT] })]);
      getCombatant(s, 'enemy-0').statuses = [{ id: 'shield_guard', turnsLeft: 1, stacks: 1 }];
      const events = performAction(s, { actorUid: 'player-0', abilityId: 'hit', targetUid: 'enemy-0' });
      expect(events.some((e) => e.type === 'damage' && e.cause === 'counter')).toBe(false);
    }
    testAbilities.set('hit', HIT);
  });
});

describe('habilidades de área', () => {
  it('all_enemies golpea a todos los enemigos vivos, cada golpe por separado', () => {
    const aoe = ability({ id: 'aoe', target: 'all_enemies', hits: 2, damage: { min: 200, max: 200 } });
    const s = battle([hero('a', { abilities: [aoe] })], [hero('b'), hero('c'), hero('d')]);
    const events = performAction(s, { actorUid: 'player-0', abilityId: 'aoe' });
    const damage = events.filter((e) => e.type === 'damage');
    expect(damage).toHaveLength(6);
    expect(new Set(damage.map((e) => e.targetUid))).toEqual(new Set(['enemy-0', 'enemy-1', 'enemy-2']));
  });

  it('all_allies aplica el buff a todo el equipo y el efecto propio solo a quien la usa', () => {
    const rally = ability({
      id: 'rally',
      type: 'buff',
      target: 'all_allies',
      damage: null,
      hits: 0,
      effects: [effect('strengthened', 2), effect('might_of_mjolnir', 3, { target: 'self' })],
    });
    const s = battle([hero('a', { abilities: [rally] }), hero('b')], [hero('c')]);
    performAction(s, { actorUid: 'player-0', abilityId: 'rally' });
    expect(getCombatant(s, 'player-0').statuses.map((x) => x.id)).toEqual(['strengthened', 'might_of_mjolnir']);
    expect(getCombatant(s, 'player-1').statuses.map((x) => x.id)).toEqual(['strengthened']);
  });
});

describe('batalla completa 3 contra 3 con los datos del juego', () => {
  const players = ['iron_man', 'captain_america', 'thor'].map((id) => heroById.get(id)!);
  const enemies = ['hulk', 'wolverine', 'black_widow'].map((id) => heroById.get(id)!);

  it('se juega hasta el final con la IA en ambos bandos', () => {
    const rounds: number[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const s = createBattle(players, enemies, gameData, seed);
      playToEnd(s);
      const losers = s.combatants.filter((c) => c.team !== s.winner);
      expect(losers.every((c) => c.hp === 0)).toBe(true);
      expect(s.log.at(-1)).toEqual({ type: 'battle-end', winner: s.winner });
      rounds.push(s.round);
    }
    // Ni de un golpe ni eternas.
    const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
    expect(avg).toBeGreaterThan(3);
    expect(avg).toBeLessThan(25);
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
    expect(() => performAction(s, { actorUid: 'player-0', abilityId: 'iron_man_repulsor_ray', targetUid: 'enemy-0' })).toThrow(InvalidActionError);
  });
});
