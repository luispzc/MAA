import { useCallback, useEffect, useState } from 'react';
import type { GameIndex } from '@maa/shared';
import { fetchGameData } from './api';
import { BattleScreen } from './battle/BattleScreen';

/** Equipos del prototipo. Más adelante saldrán de la pantalla de selección. */
const PLAYER_TEAM = ['iron_man', 'captain_america', 'thor'];
const ENEMY_TEAM = ['hulk', 'wolverine', 'black_widow'];

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: GameIndex };

export function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchData = useCallback(() => {
    setLoad({ status: 'loading' });
    fetchGameData()
      .then((data) => setLoad({ status: 'ready', data }))
      .catch((err: Error) => setLoad({ status: 'error', message: err.message }));
  }, []);

  useEffect(fetchData, [fetchData]);

  if (load.status === 'loading') return <div className="message">Cargando datos del servidor…</div>;
  if (load.status === 'error') {
    return (
      <div className="message">
        <p>{load.message}</p>
        <button type="button" onClick={fetchData}>
          Reintentar
        </button>
      </div>
    );
  }
  return <BattleScreen data={load.data} playerTeam={PLAYER_TEAM} enemyTeam={ENEMY_TEAM} />;
}
