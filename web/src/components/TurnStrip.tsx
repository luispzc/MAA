import type { BattleState, GameIndex } from '@maa/shared';
import { upcomingTurns } from '../battle/view';
import { Portrait } from './Portrait';

const BIG = 52;
const SMALL = 34;

/** Fila de retratos arriba: quien actúa ahora y los siguientes turnos. */
export function TurnStrip({ state, data }: { state: BattleState; data: GameIndex }) {
  const upcoming = upcomingTurns(state);
  return (
    <div className="turn-strip">
      {upcoming.map((c, i) => {
        const now = i === 0;
        return (
          <div
            key={`${i}-${c.uid}`}
            className={`turn-slot ${now ? 'now' : c.team}`}
            title={c.name}
          >
            <Portrait hero={data.heroById.get(c.heroId)} name={c.name} classId={c.classId} size={now ? BIG : SMALL} />
            {now && <span className="turn-now">AHORA</span>}
          </div>
        );
      })}
    </div>
  );
}
