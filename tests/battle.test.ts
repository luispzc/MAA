import { describe, expect, it } from 'vitest';
import { abilityById, classesData, heroById } from '../src/data';
import { Battle } from '../src/core/battle';
import { createRng } from '../src/core/rng';

const team = (...ids: string[]) => ids.map((id) => heroById.get(id)!);

function newBattle(seed = 1, players = ['hulk', 'iron_man', 'captain_america'], enemies = ['wolverine', 'black_widow', 'thor']) {
  const battle = new Battle({
    players: team(...players),
    enemies: team(...enemies),
    abilityById,
    classesData,
    rng: createRng(seed),
  });
  battle.start();
  return battle;
}

/** RNG que siempre devuelve el mismo valor: 0 acierta todo y aplica todos los efectos. */
const fixedRng = (value: number) => () => value;

describe('combate por turnos', () => {
  it('empieza con el primer héroe del jugador y actúan todos en orden', () => {
    const battle = newBattle();
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      const actor = battle.current!;
      order.push(actor.uid);
      const { abilityId, targetUid } = battle.chooseAiAction(actor);
      battle.act(abilityId, targetUid);
    }
    expect(order).toEqual(['player-0', 'player-1', 'player-2', 'enemy-0', 'enemy-1', 'enemy-2']);
    expect(battle.round).toBe(2);
  });

  it('cobra aguante y bloquea la habilidad durante su cooldown', () => {
    const battle = newBattle();
    const hulk = battle.current!;
    battle.act('hulk_thunderclap');
    expect(hulk.stamina).toBe(hulk.stats.stamina - 40);
    const option = battle.abilityOptions(hulk).find((o) => o.ability.id === 'hulk_thunderclap')!;
    expect(option.usable).toBe(false);
    expect(option.reason).toBe('cooldown');
  });

  it('la ventaja de clase aumenta el daño', () => {
    // Iron Man (Blaster) contra Hulk (Bruiser) con ventaja, contra Thor (Generalist) neutral.
    const rng = fixedRng(0);
    const make = (enemy: string) =>
      new Battle({ players: team('iron_man'), enemies: team(enemy), abilityById, classesData, rng });
    const vsHulk = make('hulk');
    vsHulk.start();
    const events = vsHulk.act('iron_man_repulsor', 'enemy-0');
    const dmg = events.find((e) => e.type === 'damage');
    expect(dmg).toMatchObject({ matchup: 'advantage' });

    const vsThor = make('thor');
    vsThor.start();
    const neutral = vsThor.act('iron_man_repulsor', 'enemy-0').find((e) => e.type === 'damage');
    expect(neutral).toMatchObject({ matchup: 'neutral' });
  });

  it('un aturdido pierde su siguiente turno', () => {
    const battle = new Battle({
      players: team('captain_america'),
      enemies: team('thor'),
      abilityById,
      classesData,
      rng: fixedRng(0),
    });
    battle.start();
    const events = battle.act('cap_shield_bash', 'enemy-0');
    expect(events).toContainEqual({ type: 'status', target: 'enemy-0', status: 'stun' });
    expect(events).toContainEqual({ type: 'stunned', target: 'enemy-0' });
    // Thor pierde el turno: vuelve a tocarle a Cap y el aturdimiento ya no está.
    expect(battle.current!.uid).toBe('player-0');
    expect(battle.get('enemy-0').statuses).toEqual([]);
  });

  it('un buff propio dura los turnos indicados', () => {
    const battle = new Battle({
      players: team('hulk'),
      enemies: team('thor'),
      abilityById,
      classesData,
      rng: fixedRng(0.99),
    });
    battle.start();
    const hulk = battle.get('player-0');
    battle.act('hulk_rage');
    let turnsWithBuff = 0;
    while (battle.hasStatus(hulk, 'attack_up')) {
      turnsWithBuff++;
      battle.act('thor_mjolnir', 'player-0'); // Thor falla con 0.99
      battle.act('hulk_smash', 'enemy-0');
    }
    expect(turnsWithBuff).toBe(3);
  });

  it('el combate termina con un ganador', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const battle = newBattle(seed);
      let guard = 0;
      while (!battle.winner && guard++ < 500) {
        const actor = battle.current!;
        const { abilityId, targetUid } = battle.chooseAiAction(actor);
        battle.act(abilityId, targetUid);
      }
      expect(battle.winner).not.toBeNull();
      expect(battle.current).toBeNull();
      const loser = battle.winner === 'player' ? 'enemy' : 'player';
      expect(battle.alive(loser)).toHaveLength(0);
    }
  });

  it('rechaza objetivos no válidos', () => {
    const battle = newBattle();
    expect(() => battle.act('hulk_smash', 'player-1')).toThrow();
    expect(() => battle.act('hulk_smash')).toThrow();
  });
});
