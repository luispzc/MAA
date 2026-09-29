import Phaser from 'phaser';
import { classesData, heroes } from '../data';

/** Escena de combate por turnos. Por ahora vacía: solo muestra que el juego arranca. */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 20, 'Marvel: Avengers Alliance', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(
        width / 2,
        height / 2 + 24,
        `${heroes.length} héroes · ${classesData.classes.length} clases cargadas`,
        { fontFamily: 'sans-serif', fontSize: '16px', color: '#9aa4bf' },
      )
      .setOrigin(0.5);
  }
}
