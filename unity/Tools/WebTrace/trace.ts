// Traza de la versión web con las mismas semillas que Tools/CoreCheck, para
// comprobar que el motor C# da exactamente el mismo combate.
// Uso (desde la raíz del repo): node unity/Tools/WebTrace/run.mjs <archivo de salida>
import { writeFileSync } from 'node:fs';
import { abilityById, classesData, heroById, statusById } from '../../../src/data';
import { chooseAiAction, createBattle, performAction, type BattleEvent } from '../../../src/core/combat';

const PLAYER_TEAM = ['iron_man', 'captain_america', 'thor'];
const ENEMY_TEAM = ['hulk', 'wolverine', 'black_widow'];
const SEEDS = 200;

function format(e: BattleEvent): string {
  switch (e.type) {
    case 'round-start': return `round-start ${e.round} ${e.order.join(',')}`;
    case 'turn-start': return `turn-start ${e.actorUid}`;
    case 'turn-skipped': return `turn-skipped ${e.actorUid} ${e.reason}`;
    case 'ability-used': return `ability-used ${e.actorUid} ${e.abilityId} ${e.targets.join(',')} ${e.quick ? 1 : 0}`;
    case 'miss': return `miss ${e.sourceUid} ${e.targetUid}`;
    case 'damage': return `damage ${e.sourceUid ?? '-'} ${e.targetUid} ${e.amount} ${e.crit ? 1 : 0} ${e.matchup} ${e.cause}`;
    case 'heal': return `heal ${e.targetUid} ${e.amount} ${e.cause}`;
    case 'stamina': return `stamina ${e.targetUid} ${e.amount} ${e.cause}`;
    case 'status-applied': return `status-applied ${e.targetUid} ${e.statusId} ${e.duration} ${e.stacks}`;
    case 'status-resisted': return `status-resisted ${e.targetUid} ${e.statusId}`;
    case 'status-removed': return `status-removed ${e.targetUid} ${e.statusId} ${e.cause}`;
    case 'status-expired': return `status-expired ${e.targetUid} ${e.statusId}`;
    case 'ko': return `ko ${e.targetUid}`;
    case 'battle-end': return `battle-end ${e.winner}`;
  }
}

const hero = (id: string) => heroById.get(id)!;
let out = '';
for (let seed = 1; seed <= SEEDS; seed++) {
  const state = createBattle(PLAYER_TEAM.map(hero), ENEMY_TEAM.map(hero), { classes: classesData, abilityById, statusById }, seed);
  for (let guard = 0; !state.winner && guard < 2000; guard++) performAction(state, chooseAiAction(state));
  out += `# seed ${seed}\n` + state.log.map(format).join('\n') + '\n';
}
writeFileSync(process.argv[2] ?? 'web-trace.txt', out);
