import type { AbilityProperty } from '../../types/game';
import { getCombatant } from './battle';
import { statusName } from './statuses';
import type { BattleEvent, BattleState } from './types';

/** Texto en español de un evento para el registro de combate (null = no se muestra). */
export function describeEvent(state: BattleState, event: BattleEvent): string | null {
  const name = (uid: string) => getCombatant(state, uid).name;
  switch (event.type) {
    case 'round-start':
      return `— Ronda ${event.round} —`;
    case 'turn-start':
    case 'status-expired':
      return null;
    case 'turn-skipped':
      return `${name(event.actorUid)} está ${statusName(state, event.reason).toLowerCase()} y pierde el turno.`;
    case 'ability-used': {
      const actor = getCombatant(state, event.actorUid);
      const ability = actor.abilities.find((a) => a.id === event.abilityId);
      return `${actor.name} usa ${ability?.name ?? event.abilityId}${event.quick ? ' (acción rápida)' : ''}.`;
    }
    case 'miss':
      return `${name(event.targetUid)} esquiva el golpe.`;
    case 'damage': {
      if (event.cause === 'counter') {
        return `${name(event.targetUid)} recibe ${event.amount} de contraataque.`;
      }
      if (event.cause !== 'ability') {
        return `${name(event.targetUid)} pierde ${event.amount} por ${statusName(state, event.cause)}.`;
      }
      const tags = [event.crit && '¡crítico!', event.matchup === 'advantage' && 'ventaja', event.matchup === 'disadvantage' && 'desventaja'].filter(Boolean);
      return `${name(event.targetUid)} recibe ${event.amount} de daño${tags.length ? ` (${tags.join(', ')})` : ''}.`;
    }
    case 'heal':
      return event.amount > 0 ? `${name(event.targetUid)} recupera ${event.amount} de vida.` : null;
    case 'stamina':
      return `${name(event.targetUid)} recupera ${event.amount} de stamina.`;
    case 'status-applied':
      return `${name(event.targetUid)}: ${statusName(state, event.statusId)}${event.stacks > 1 ? ` x${event.stacks}` : ''} (${event.duration} t).`;
    case 'status-resisted':
      return `${name(event.targetUid)} resiste ${statusName(state, event.statusId)}.`;
    case 'status-removed':
      return `${name(event.targetUid)} pierde ${statusName(state, event.statusId)}.`;
    case 'ko':
      return `¡${name(event.targetUid)} queda fuera de combate!`;
    case 'battle-end':
      return event.winner === 'player' ? '¡Victoria!' : 'Derrota…';
  }
}

/** Nombre y explicación en español de cada propiedad especial. */
export const PROPERTY_INFO: Record<AbilityProperty, { name: string; description: string }> = {
  quick_action: { name: 'Acción rápida', description: 'No gasta el turno.' },
  deadly_crits: { name: 'Críticos letales', description: 'Los críticos hacen x2 en vez de x1.5.' },
  high_crits: { name: 'Críticos altos', description: 'Más probabilidad de crítico (ya incluida).' },
  mighty_attack: { name: 'Ataque poderoso', description: 'Ignora escudos y reducciones de daño.' },
  catastrophic: { name: 'Catastrófico', description: 'No se puede esquivar.' },
  anger_unleashed: { name: 'Furia desatada', description: 'Consume Hulk se crece: +15% de daño por acumulación.' },
  exploits_combos: { name: 'Explota combos', description: '+50% contra Combo preparado, y lo consume.' },
  exploits_bleeds: { name: 'Explota sangrados', description: '+25% por cada acumulación de Sangrado.' },
  adamantium: { name: 'Adamantium', description: 'Ignora la mitad de la defensa.' },
  subtle: { name: 'Sutil', description: 'No provoca contraataques.' },
  stealthy: { name: 'Sigiloso', description: 'No provoca contraataques.' },
};

export function propertyName(id: string): string {
  return PROPERTY_INFO[id as AbilityProperty]?.name ?? id;
}
