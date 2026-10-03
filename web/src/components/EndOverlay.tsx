import type { BattleState } from '@maa/shared';

/** Cartel de victoria o derrota sobre el escenario. */
export function EndOverlay({ state, onRestart }: { state: BattleState; onRestart: () => void }) {
  const won = state.winner === 'player';
  return (
    <div className="end-overlay">
      <h1 className={won ? 'won' : 'lost'}>{won ? '¡VICTORIA!' : 'DERROTA'}</h1>
      <p>La batalla duró {state.round} rondas</p>
      <button type="button" onClick={onRestart}>
        Jugar de nuevo
      </button>
    </div>
  );
}
