import Phaser from 'phaser';
import type { Hero, HeroClassId } from '@maa/shared';
import { ART, CLASS_COLORS, assetUrl, hexToNumber, initials, shade as shadeHex } from './theme';

/**
 * Arte del escenario de batalla (Phaser): fondo y figuras de los héroes. Las
 * figuras se declaran en data/heroes.json (`art.figure`, relativo a /assets,
 * que sirve el servidor). Lo que no tenga arte se dibuja con un marcador propio.
 * Los retratos e iconos de la interfaz están en los componentes de React.
 */

/**
 * Escala común de las figuras. Los PNG del juego original vienen todos a la
 * misma escala, así que Hulk se ve más grande que Black Widow sin ajustar nada.
 */
export const FIGURE_SCALE = 0.72;
/** Altura del marcador (sin arte) en píxeles de pantalla. */
const MARKER_HEIGHT = 160;

export const stageKey = 'stage';
export const figureKey = (heroId: string) => `figure-${heroId}`;

/** Color de clase como número, para Phaser. */
export const classColor = (classId: HeroClassId) => hexToNumber(CLASS_COLORS[classId]);

/** Carga el fondo y las figuras de los héroes. Se llama desde el preload de la escena. */
export function preloadArt(scene: Phaser.Scene, heroes: readonly Hero[]): void {
  if (ART.stage) scene.load.image(stageKey, assetUrl(ART.stage));
  for (const hero of heroes) {
    if (hero.art) scene.load.image(figureKey(hero.id), assetUrl(hero.art.figure));
  }
}

/** Alto en pantalla de la figura de un héroe (para colocar placas y números encima). */
export function figureHeight(scene: Phaser.Scene, heroId: string, classId: HeroClassId): number {
  if (scene.textures.exists(figureKey(heroId))) {
    return scene.textures.get(figureKey(heroId)).getSourceImage().height * FIGURE_SCALE;
  }
  return MARKER_HEIGHT * (classId === 'bruiser' ? 1.15 : 1);
}

/** Ancho en pantalla de la figura de un héroe. */
export function figureWidth(scene: Phaser.Scene, heroId: string): number {
  if (scene.textures.exists(figureKey(heroId))) {
    return scene.textures.get(figureKey(heroId)).getSourceImage().width * FIGURE_SCALE;
  }
  return 90;
}

function shade(color: number, factor: number): number {
  return hexToNumber(shadeHex(`#${color.toString(16).padStart(6, '0')}`, factor));
}

/** Escenario: sala interior con paredes, columnas y suelo en perspectiva. */
export function drawStage(scene: Phaser.Scene, width: number, height: number): void {
  if (scene.textures.exists(stageKey)) {
    scene.add.image(0, 0, stageKey).setOrigin(0).setDisplaySize(width, height);
    return;
  }
  const g = scene.add.graphics();
  const horizon = height * 0.46;
  g.fillGradientStyle(0x2b2e3f, 0x2b2e3f, 0x3d3a45, 0x3d3a45, 1);
  g.fillRect(0, 0, width, horizon);
  // Paneles de pared y columnas.
  for (let i = 0; i < 8; i++) {
    const x = 20 + i * 125;
    g.fillStyle(0x34374a, 1).fillRect(x, 40, 90, horizon - 70);
    g.lineStyle(2, 0x23252f, 1).strokeRect(x, 40, 90, horizon - 70);
  }
  for (const x of [0, 240, 700, 930]) {
    g.fillStyle(0x1f2029, 1).fillRect(x, 0, 30, horizon);
    g.fillStyle(0x4a4656, 1).fillRect(x + 4, 0, 6, horizon);
  }
  // Cuadros en la pared.
  g.fillStyle(0x5a4630, 1).fillRect(300, 70, 70, 90);
  g.fillStyle(0x6f7f94, 1).fillRect(306, 76, 58, 78);
  g.fillStyle(0x5a4630, 1).fillRect(600, 70, 70, 90);
  g.fillStyle(0x8a6f5a, 1).fillRect(606, 76, 58, 78);
  // Zócalo.
  g.fillStyle(0x1a1b22, 1).fillRect(0, horizon - 14, width, 14);
  // Suelo de madera con perspectiva.
  g.fillGradientStyle(0x5b3d28, 0x5b3d28, 0x2f1f15, 0x2f1f15, 1);
  g.fillRect(0, horizon, width, height - horizon);
  g.lineStyle(1, 0x2a1b12, 0.6);
  const vx = width / 2;
  for (let i = -12; i <= 12; i++) {
    g.lineBetween(vx + i * 30, horizon, vx + i * 140, height);
  }
  for (let i = 1; i < 7; i++) {
    const y = horizon + (height - horizon) * Math.pow(i / 7, 1.6);
    g.lineBetween(0, y, width, y);
  }
  // Emblema propio en el centro del suelo (estrella dentro de un anillo).
  const cy = horizon + (height - horizon) * 0.55;
  g.lineStyle(10, 0xc99a2e, 0.35).strokeEllipse(vx, cy, 230, 80);
  g.fillStyle(0xc99a2e, 0.3);
  const star: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    star.push(new Phaser.Math.Vector2(vx + Math.cos(a) * 70 * r, cy + Math.sin(a) * 26 * r));
  }
  g.fillPoints(star, true);
  // Viñeta para centrar la mirada.
  g.fillStyle(0x000000, 0.25).fillRect(0, 0, width, 30);
}

/**
 * Figura de cuerpo entero con los pies en (0, 0). El marcador es una silueta con
 * el color de la clase y las iniciales del héroe en el pecho.
 */
export function createFigure(
  scene: Phaser.Scene,
  heroId: string,
  name: string,
  classId: HeroClassId,
  facingLeft: boolean,
): Phaser.GameObjects.Container {
  const box = scene.add.container(0, 0);
  const scale = classId === 'bruiser' ? 1.15 : 1;
  if (scene.textures.exists(figureKey(heroId))) {
    const img = scene.add.image(0, 0, figureKey(heroId)).setOrigin(0.5, 1).setFlipX(facingLeft);
    img.setScale(FIGURE_SCALE);
    const shadow = scene.add.ellipse(0, -2, img.displayWidth * 0.7, 18, 0x000000, 0.35);
    box.add([shadow, img]);
    return box;
  }
  const color = classColor(classId);
  const dark = shade(color, 0.45);
  const g = scene.add.graphics();
  const s = scale;
  // Sombra.
  g.fillStyle(0x000000, 0.35).fillEllipse(0, 0, 70 * s, 16 * s);
  // Piernas.
  g.fillStyle(dark, 1);
  g.fillRoundedRect(-18 * s, -62 * s, 15 * s, 60 * s, 5 * s);
  g.fillRoundedRect(3 * s, -62 * s, 15 * s, 60 * s, 5 * s);
  // Capa.
  g.fillStyle(shade(color, 0.3), 1);
  g.fillTriangle(-26 * s, -118 * s, 26 * s, -118 * s, (facingLeft ? 30 : -30) * s, -40 * s);
  // Torso.
  g.fillStyle(color, 1).fillRoundedRect(-24 * s, -122 * s, 48 * s, 66 * s, 12 * s);
  g.fillStyle(shade(color, 1.35), 1).fillRoundedRect(-18 * s, -116 * s, 14 * s, 50 * s, 6 * s);
  // Brazos (uno adelantado hacia el rival).
  const dir = facingLeft ? -1 : 1;
  g.fillStyle(dark, 1);
  g.fillRoundedRect((dir > 0 ? -38 : 24) * s, -118 * s, 14 * s, 52 * s, 6 * s);
  g.fillRoundedRect((dir > 0 ? 22 : -56) * s, -112 * s, 34 * s, 13 * s, 6 * s);
  // Cabeza.
  g.fillStyle(shade(color, 0.75), 1).fillCircle(0, -138 * s, 17 * s);
  g.fillStyle(0xffffff, 0.9).fillRect((dir > 0 ? 2 : -12) * s, -142 * s, 10 * s, 4 * s);
  g.lineStyle(2, 0x000000, 0.5).strokeRoundedRect(-24 * s, -122 * s, 48 * s, 66 * s, 12 * s);
  const label = scene.add
    .text(0, -92 * s, initials(name), {
      fontFamily: 'sans-serif',
      fontSize: `${Math.round(16 * s)}px`,
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    })
    .setOrigin(0.5);
  box.add([g, label]);
  return box;
}
