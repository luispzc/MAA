import { describe, expect, it } from 'vitest';
import { abilities, abilityById, classesData, heroById, heroes } from '../src/data';
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
    }
  });
});
