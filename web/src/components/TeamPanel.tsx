import { currentActor, isAlive, type TeamId } from '@maa/shared';
import type { BattleController, BattleSnapshot } from '../battle/BattleController';
import { CLASS_COLORS } from '../battle/theme';
import { statusSummary } from '../battle/view';

const BAR_W = 118;

/** Panel inferior de un equipo: salud, stamina (solo el jugador), nombre, efectos y clase. */
export function TeamPanel({
  team,
  snapshot,
  controller,
  targets,
}: {
  team: TeamId;
  snapshot: BattleSnapshot;
  controller: BattleController;
  targets: Set<string>;
}) {
  const { state, mode, hovered } = snapshot;
  const actor = currentActor(state);
  const members = state.combatants.filter((c) => c.team === team);
  const className = (id: string) => state.classes.classes.find((k) => k.id === id)?.name ?? id;

  return (
    <div className={`team-panel ${team}`}>
      {members.map((c) => {
        const isActor = actor?.uid === c.uid && mode !== 'over';
        const isTarget = targets.has(c.uid);
        const hot = isTarget && hovered === c.uid;
        const rowClass = ['team-row', isActor && 'actor', isTarget && 'target', hot && 'hot', !isAlive(c) && 'down']
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={c.uid}
            className={rowClass}
            onClick={() => controller.clickTarget(c.uid)}
            onMouseEnter={() => controller.setHovered(c.uid)}
            onMouseLeave={() => controller.setHovered(null)}
          >
            <div className="bars">
              <Bar label="SALUD" value={c.hp} max={c.stats.health} kind="hp" />
              {team === 'player' && <Bar label="STAMINA" value={c.stamina} max={c.stats.stamina} kind="stamina" />}
            </div>
            <span className="team-name">{c.name.toUpperCase()}</span>
            <span className="team-statuses">{statusSummary(state, c)}</span>
            <span className="class-badge" style={{ background: CLASS_COLORS[c.classId] }} title={className(c.classId)}>
              {className(c.classId).slice(0, 2).toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: 'hp' | 'stamina' }) {
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <span className={`bar-track ${kind}`} style={{ width: BAR_W }}>
        <span className="bar-fill" style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className="bar-value">{value}</span>
    </div>
  );
}
