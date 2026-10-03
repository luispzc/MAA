import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentActor, type Ability } from '@maa/shared';
import { BattleController } from '../src/battle/BattleController';
import { abilityTooltipLines, upcomingTurns } from '../src/battle/view';
import { gameData } from '../../shared/tests/gameData';

const PLAYERS = ['iron_man', 'captain_america', 'thor'];
const ENEMIES = ['hulk', 'wolverine', 'black_widow'];
const TIMINGS = { enemyDelay: 10, afterAction: 10 };

function newController(seed = 1) {
  return new BattleController(gameData, PLAYERS, ENEMIES, TIMINGS, seed);
}

/** Primera habilidad usable del héroe activo con el objetivo pedido. */
function abilityWith(c: BattleController, target: Ability['target']): Ability {
  const actor = currentActor(c.state)!;
  const ability = actor.abilities.find((a) => a.target === target && (actor.cooldowns[a.id] ?? 0) === 0);
  if (!ability) throw new Error(`${actor.name} no tiene habilidad ${target}`);
  return ability;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('BattleController', () => {
  it('empieza esperando al jugador y avisa a los suscriptores', () => {
    const c = newController();
    const listener = vi.fn();
    c.subscribe(listener);
    c.start();
    expect(c.getSnapshot().mode).toBe('choose-ability');
    expect(currentActor(c.state)?.team).toBe('player');
    expect(listener).toHaveBeenCalled();
  });

  it('una habilidad de objetivo único pide objetivo y se puede cancelar', () => {
    const c = newController();
    c.start();
    const ability = abilityWith(c, 'single_enemy');
    c.chooseAbility(ability);
    expect(c.getSnapshot().mode).toBe('choose-target');
    expect([...c.targetSet()].every((uid) => uid.startsWith('enemy-'))).toBe(true);
    c.cancelTarget();
    expect(c.getSnapshot().mode).toBe('choose-ability');
    expect(c.targetSet().size).toBe(0);
  });

  it('al elegir objetivo ejecuta la acción, anima y luego juega la IA', () => {
    const c = newController();
    const onAction = vi.fn();
    c.onAction(onAction);
    c.start();
    const before = c.getSnapshot().log.length;
    c.chooseAbility(abilityWith(c, 'single_enemy'));
    c.clickTarget('enemy-0');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().mode).toBe('busy');
    expect(c.getSnapshot().log.length).toBeGreaterThan(before);
    vi.advanceTimersByTime(TIMINGS.afterAction + TIMINGS.enemyDelay + 1);
    expect(onAction.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('ignora clics en algo que no es objetivo válido', () => {
    const c = newController();
    c.start();
    c.chooseAbility(abilityWith(c, 'single_enemy'));
    c.clickTarget('player-1');
    expect(c.getSnapshot().mode).toBe('choose-target');
  });

  it('llega al final y Jugar de nuevo empieza otra batalla', () => {
    const c = newController(3);
    c.start();
    for (let i = 0; i < 2000 && c.getSnapshot().mode !== 'over'; i++) {
      if (c.getSnapshot().mode === 'choose-ability') {
        const actor = currentActor(c.state)!;
        const usable = actor.abilities.find((a) => a.target === 'all_enemies' && (actor.cooldowns[a.id] ?? 0) === 0 && actor.stamina >= (actor.stats.stamina * a.staminaCostPercent) / 100);
        c.chooseAbility(usable ?? actor.abilities[actor.abilities.length - 1]);
      }
      vi.advanceTimersByTime(TIMINGS.afterAction + TIMINGS.enemyDelay + 1);
    }
    const end = c.getSnapshot();
    expect(end.mode).toBe('over');
    expect(end.state.winner).not.toBeNull();
    c.restart();
    expect(c.getSnapshot().battleId).toBe(end.battleId + 1);
    expect(c.state.winner).toBeNull();
    expect(c.getSnapshot().mode).not.toBe('over');
  });

  it('dispose detiene el turno pendiente de la IA', () => {
    const c = newController();
    const onAction = vi.fn();
    c.onAction(onAction);
    c.start();
    c.chooseAbility(abilityWith(c, 'single_enemy'));
    c.clickTarget('enemy-0');
    c.dispose();
    vi.advanceTimersByTime(1000);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('textos de la interfaz', () => {
  it('la fila de turnos empieza por quien actúa y solo trae vivos', () => {
    const c = newController();
    const upcoming = upcomingTurns(c.state);
    expect(upcoming[0].uid).toBe(currentActor(c.state)!.uid);
    expect(upcoming.length).toBe(7);
  });

  it('la ficha de una habilidad muestra coste, daño y descripción', () => {
    const c = newController();
    const actor = currentActor(c.state)!;
    const ability = actor.abilities.find((a) => a.damage)!;
    const lines = abilityTooltipLines(c.state, actor, ability);
    expect(lines[0]).toContain('Daño');
    expect(lines).toContain(ability.description);
  });
});
