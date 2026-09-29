import Phaser from 'phaser';
import { preloadArt } from './battle/art';

/** Carga inicial de recursos. El arte que falte se dibuja con marcadores (ver battle/art.ts). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.scene.start('Battle');
  }
}
