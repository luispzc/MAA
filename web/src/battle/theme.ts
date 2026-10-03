import type { AbilityType, HeroClassId } from '@maa/shared';

/** Colores y medidas compartidos por el escenario (Phaser) y la interfaz (React). */

/** Lienzo del juego original: escenario arriba y paneles de equipo abajo. */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;
export const STAGE_H = 540;
/** Centro vertical de la barra de habilidades (sobre el borde inferior del escenario). */
export const BAR_Y = 505;
export const ICON = 48;

export const CLASS_COLORS: Record<HeroClassId, string> = {
  blaster: '#d9822b',
  bruiser: '#3fa34d',
  scrapper: '#b83b5e',
  infiltrator: '#6c4ab6',
  tactician: '#2f6fbf',
  generalist: '#7d8597',
};

export const ABILITY_COLORS: Record<AbilityType, string> = {
  melee: '#d9483b',
  ranged: '#e08a2e',
  buff: '#3d8bfd',
  debuff: '#8e5bd9',
  heal: '#3fbf6a',
};

/** '#d9822b' -> 0xd9822b, para Phaser. */
export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Aclara (>1) u oscurece (<1) un color '#rrggbb'. */
export function shade(hex: string, factor: number): string {
  const n = hexToNumber(hex);
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Iniciales para los marcadores: "Iron Man" -> "IM", "Hulk" -> "HU". */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** URL de un archivo de arte (lo sirve el servidor en /assets). */
export function assetUrl(path: string): string {
  return `/assets/${path}`;
}

/**
 * Arte opcional que no viene en data/heroes.json, relativo a /assets. Lo que
 * falte se dibuja con un marcador propio (siluetas y formas).
 */
export const ART = {
  /** Fondo del escenario, 960x540 aprox. Ej.: 'stages/mansion.png'. */
  stage: null as string | null,
  /** Retrato cuadrado propio por héroe; si falta, se recorta de la figura con art.portraitCrop. */
  portraits: {} as Partial<Record<string, string>>,
  /** Icono cuadrado por habilidad para la barra inferior. */
  abilityIcons: {} as Partial<Record<string, string>>,
};
