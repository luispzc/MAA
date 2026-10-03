import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { Hero } from '@maa/shared';
import type { BattleController } from './BattleController';
import { StageScene } from './StageScene';
import { GAME_WIDTH, STAGE_H } from './theme';

interface Props {
  controller: BattleController;
  heroes: readonly Hero[];
  /** Escala con la que se dibuja el lienzo (para que Phaser ubique bien el ratón). */
  scale: number;
}

/** Monta el escenario de Phaser dentro de React y lo destruye al desmontar. */
export function PhaserStage({ controller, heroes, scale }: Props) {
  const parent = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    game.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent.current!,
      width: GAME_WIDTH,
      height: STAGE_H,
      backgroundColor: '#0b0f1a',
      scale: { mode: Phaser.Scale.NONE },
      scene: [new StageScene(controller, heroes)],
    });
    return () => {
      game.current?.destroy(true);
      game.current = null;
    };
  }, [controller, heroes]);

  // El lienzo se escala con CSS junto con el resto de la pantalla; Phaser
  // necesita recalcular sus límites para traducir bien los clics.
  useEffect(() => {
    game.current?.scale.refresh();
  }, [scale]);

  return <div ref={parent} className="stage" />;
}
