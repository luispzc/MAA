import { PROPERTY_INFO, type GameData } from '@maa/shared';

/**
 * Revisa que los datos sean coherentes (ids únicos, referencias que existen,
 * valores en rango). Devuelve la lista de problemas; vacía si todo está bien.
 * El servidor no arranca con datos inválidos.
 */
export function validateGameData(data: GameData): string[] {
  const problems: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };
  const { classes } = data.classes;
  const classIds = new Set(classes.map((c) => c.id));
  const heroById = new Map(data.heroes.map((h) => [h.id, h]));
  const abilityById = new Map(data.abilities.map((a) => [a.id, a]));
  const statusIds = new Set(data.statuses.map((s) => s.id));
  const properties = new Set(Object.keys(PROPERTY_INFO));

  check(heroById.size === data.heroes.length, 'Hay héroes con el id repetido');
  check(abilityById.size === data.abilities.length, 'Hay habilidades con el id repetido');
  check(statusIds.size === data.statuses.length, 'Hay efectos con el id repetido');

  for (const c of classes) {
    check(c.strongAgainst === null || classIds.has(c.strongAgainst), `La clase ${c.id} tiene ventaja sobre ${c.strongAgainst}, que no existe`);
  }

  for (const hero of data.heroes) {
    check(classIds.has(hero.classId), `${hero.id}: la clase ${hero.classId} no existe`);
    for (const id of hero.abilityIds) {
      const ability = abilityById.get(id);
      check(!!ability, `${hero.id}: la habilidad ${id} no existe`);
      check(!ability || ability.heroId === hero.id, `${hero.id}: la habilidad ${id} es de ${ability?.heroId}`);
    }
  }

  for (const a of data.abilities) {
    check(!!heroById.get(a.heroId)?.abilityIds.includes(a.id), `${a.id}: ningún héroe ${a.heroId} la lista en abilityIds`);
    check(!a.damage || a.damage.min <= a.damage.max, `${a.id}: daño mínimo mayor que el máximo`);
    check((a.damage === null) === (a.hits === 0), `${a.id}: damage debe ser null si y solo si hits es 0`);
    check(a.accuracy >= 0 && a.accuracy <= 100, `${a.id}: accuracy fuera de 0-100`);
    check(a.critChance >= 0, `${a.id}: critChance negativo`);
    check(a.staminaCostPercent >= 0 && a.staminaCostPercent <= 100, `${a.id}: staminaCostPercent fuera de 0-100`);
    check(!a.properties.includes('quick_action') || a.cooldown > 0, `${a.id}: una acción rápida necesita cooldown`);
    for (const p of a.properties) check(properties.has(p), `${a.id}: la propiedad ${p} no existe en el motor`);
    for (const e of a.effects) {
      check(statusIds.has(e.id), `${a.id}: el efecto ${e.id} no existe en statuses.json`);
      check(e.chance >= 0 && e.chance <= 1, `${a.id}: la probabilidad de ${e.id} debe ir de 0 a 1`);
      check(e.stacks >= 1, `${a.id}: ${e.id} necesita al menos 1 acumulación`);
    }
  }

  for (const s of data.statuses) {
    check(['buff', 'debuff', 'instant'].includes(s.kind), `${s.id}: tipo ${s.kind} desconocido`);
    check(s.maxStacks >= 1, `${s.id}: maxStacks debe ser al menos 1`);
  }
  return problems;
}
