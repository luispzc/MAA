import { getCombatant } from './battle';
import { STATUS_NAMES } from './statuses';
import type { BattleEvent, BattleState, StatusId } from './types';

export function statusName(id: string): string {
  return STATUS_NAMES[id as StatusId] ?? id;
}

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
      return `${name(event.actorUid)} está aturdido y pierde el turno.`;
    case 'ability-used': {
      const actor = getCombatant(state, event.actorUid);
      const ability = actor.abilities.find((a) => a.id === event.abilityId);
      return `${actor.name} usa ${ability?.name ?? event.abilityId}.`;
    }
    case 'miss':
      return `${name(event.targetUid)} esquiva el golpe.`;
    case 'damage': {
      if (event.cause !== 'ability') {
        return `${name(event.targetUid)} pierde ${event.amount} por ${statusName(event.cause)}.`;
      }
      const tags = [event.crit && '¡crítico!', event.matchup === 'advantage' && 'ventaja', event.matchup === 'disadvantage' && 'desventaja'].filter(Boolean);
      return `${name(event.targetUid)} recibe ${event.amount} de daño${tags.length ? ` (${tags.join(', ')})` : ''}.`;
    }
    case 'heal':
      return event.amount > 0 ? `${name(event.targetUid)} recupera ${event.amount} de vida.` : null;
    case 'status-applied':
      return `${name(event.targetUid)}: ${statusName(event.statusId)} (${event.duration} t).`;
    case 'status-resisted':
      return `${name(event.targetUid)} resiste ${statusName(event.statusId)}.`;
    case 'ko':
      return `¡${name(event.targetUid)} queda fuera de combate!`;
    case 'battle-end':
      return event.winner === 'player' ? '¡Victoria!' : 'Derrota…';
  }
}
