import { describe, expect, it } from 'vitest';
import { abilities, abilityById, classesData, heroById, heroes, statusById, statuses } from '../src/data';
import { PROPERTY_INFO } from '../src/core/combat';
import { getDamageMultiplier, getMatchup } from '../src/core/classAdvantage';

const { classes, rules } = classesData;
const classIds = new Set(classes.map((c) => c.id));

describe('clases', () => {
  it('existen las seis clases', () => {
    expect([...classIds].sort()).toEqual(
      ['blaster', 'bruiser', 'generalist', 'infiltrator', 'scrapper', 'tactician'],
    );
  });

  it('las cinco clases no generalistas forman un ciclo de ventajas', () => {
    const start = 'blaster';
    const seen = new Set<string>();
    let current: string | null = start;
    while (current && !seen.has(current)) {
      seen.add(current);
      current = classes.find((c) => c.id === current)!.strongAgainst;
    }
    expect(current).toBe(start);
    expect(seen.size).toBe(5);
    expect(classes.find((c) => c.id === 'generalist')!.strongAgainst).toBeNull();
  });

  it('calcula ventaja, desventaja y neutral', () => {
    expect(getMatchup(classes, 'blaster', 'bruiser')).toBe('advantage');
    expect(getMatchup(classes, 'bruiser', 'blaster')).toBe('disadvantage');
    expect(getMatchup(classes, 'generalist', 'bruiser')).toBe('neutral');
    expect(getMatchup(classes, 'blaster', 'scrapper')).toBe('neutral');
    expect(getDamageMultiplier(rules, 'advantage')).toBe(rules.advantageDamageMultiplier);
    expect(getDamageMultiplier(rules, 'neutral')).toBe(1);
  });
});

describe('héroes y habilidades', () => {
  it('los ids son únicos', () => {
    expect(heroById.size).toBe(heroes.length);
    expect(abilityById.size).toBe(abilities.length);
  });

  it('cada héroe tiene una clase válida y habilidades que existen y le pertenecen', () => {
    for (const hero of heroes) {
      expect(classIds.has(hero.classId)).toBe(true);
      for (const id of hero.abilityIds) {
        expect(abilityById.get(id)?.heroId).toBe(hero.id);
      }
    }
  });

  it('cada habilidad pertenece a un héroe y tiene valores coherentes', () => {
    for (const a of abilities) {
      expect(heroById.get(a.heroId)?.abilityIds).toContain(a.id);
      if (a.damage) expect(a.damage.min).toBeLessThanOrEqual(a.damage.max);
      for (const e of a.effects) expect(e.chance).toBeGreaterThanOrEqual(0);
      for (const e of a.effects) expect(e.chance).toBeLessThanOrEqual(1);
      for (const e of a.effects) expect(e.stacks).toBeGreaterThanOrEqual(1);
      expect(a.accuracy).toBeGreaterThanOrEqual(0);
      expect(a.accuracy).toBeLessThanOrEqual(100);
      expect(a.critChance).toBeGreaterThanOrEqual(0);
      expect(a.staminaCostPercent).toBeGreaterThanOrEqual(0);
      expect(a.staminaCostPercent).toBeLessThanOrEqual(100);
      expect(a.damage === null, a.id).toBe(a.hits === 0);
    }
  });

  it('cada héroe tiene sus 4 habilidades con niveles de desbloqueo 1, 2, 6 y 9', () => {
    for (const hero of heroes) {
      expect(hero.abilityIds.map((id) => abilityById.get(id)!.unlockLevel), hero.id).toEqual([1, 2, 6, 9]);
    }
  });

  it('las propiedades especiales existen en el motor', () => {
    for (const a of abilities) {
      for (const p of a.properties) expect(Object.keys(PROPERTY_INFO), `${a.id} → ${p}`).toContain(p);
    }
  });

  it('una acción rápida tiene cooldown, para que no se pueda encadenar sin fin', () => {
    for (const a of abilities.filter((x) => x.properties.includes('quick_action'))) {
      expect(a.cooldown, a.id).toBeGreaterThan(0);
    }
  });
});

describe('efectos', () => {
  it('los ids son únicos y los efectos tienen un tipo y acumulaciones válidos', () => {
    expect(statusById.size).toBe(statuses.length);
    for (const s of statuses) {
      expect(['buff', 'debuff', 'instant']).toContain(s.kind);
      expect(s.maxStacks).toBeGreaterThanOrEqual(1);
    }
  });
});
