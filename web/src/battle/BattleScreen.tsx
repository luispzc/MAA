import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GameIndex } from '@maa/shared';
import { AbilityBar } from '../components/AbilityBar';
import { EndOverlay } from '../components/EndOverlay';
import { TeamPanel } from '../components/TeamPanel';
import { TurnStrip } from '../components/TurnStrip';
import { BattleController } from './BattleController';
import { PhaserStage } from './PhaserStage';
import { GAME_HEIGHT, GAME_WIDTH } from './theme';
import { useFitScale } from './useFitScale';

interface Props {
  data: GameIndex;
  playerTeam: string[];
  enemyTeam: string[];
}

/**
 * Combate 3 contra 3. La lógica vive en @maa/shared; el escenario lo dibuja
 * Phaser y todo lo demás (turnos, barra de habilidades, paneles) es React.
 */
export function BattleScreen({ data, playerTeam, enemyTeam }: Props) {
  const [controller] = useState(() => new BattleController(data, playerTeam, enemyTeam));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const scale = useFitScale(GAME_WIDTH, GAME_HEIGHT);

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') controller.cancelTarget();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  // Solo para depurar desde la consola del navegador: __maa.state, __maa.chooseAbility(...)
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __maa: unknown }).__maa = controller;
  }, [controller]);

  const { state, mode, log, pendingAbility } = snapshot;
  const targets = controller.targetSet();
  const hint =
    mode === 'choose-ability'
      ? { text: 'ELIGE UNA HABILIDAD', color: '#ffffff' }
      : mode === 'choose-target'
        ? { text: pendingAbility?.target === 'single_ally' ? 'SELECCIONA UN ALIADO' : 'SELECCIONA UN ENEMIGO', color: '#ff3b30' }
        : null;

  return (
    <div className="viewport">
      <div className="battle-box" style={{ width: GAME_WIDTH * scale, height: GAME_HEIGHT * scale }}>
        <div
          className="battle"
          style={{ width: GAME_WIDTH, height: GAME_HEIGHT, transform: `scale(${scale})` }}
          onContextMenu={(e) => {
            e.preventDefault();
            controller.cancelTarget();
          }}
        >
          <PhaserStage controller={controller} heroes={data.heroes} scale={scale} />
          <div className="hud">
            {mode !== 'over' && <TurnStrip state={state} data={data} />}
            <div className="caption">
              {log.slice(-2).map((line, i) => (
                <div key={log.length - 2 + i}>{line}</div>
              ))}
            </div>
            {hint && (
              <div className="hint" style={{ color: hint.color }}>
                {hint.text}
              </div>
            )}
            <AbilityBar snapshot={snapshot} controller={controller} />
            {mode === 'over' && <EndOverlay state={state} onRestart={() => controller.restart()} />}
          </div>
          <div className="panels">
            <TeamPanel team="player" snapshot={snapshot} controller={controller} targets={targets} />
            <TeamPanel team="enemy" snapshot={snapshot} controller={controller} targets={targets} />
          </div>
        </div>
      </div>
    </div>
  );
}
