import Phaser from 'phaser';

/** Carga inicial de recursos. De momento no hay assets; pasa directo al combate. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Aquí se cargarán sprites, sonidos y fuentes (public/assets).
  }

  create(): void {
    this.scene.start('Battle');
  }
}
