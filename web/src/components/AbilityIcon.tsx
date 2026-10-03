import type { AbilityType } from '@maa/shared';
import type { ReactElement } from 'react';
import { ABILITY_COLORS, ART, assetUrl, shade } from '../battle/theme';

/** Símbolo por tipo de habilidad, en una caja de -5..5. */
const SYMBOLS: Record<AbilityType, ReactElement> = {
  // Rayo.
  melee: <polygon points="1,-4 -3,1 0,1 -1,4 3,-1 0,-1" fill="#fff" />,
  // Mira.
  ranged: (
    <g stroke="#fff" strokeWidth={0.8} fill="none">
      <circle r={3} />
      <line x1={-4} x2={4} />
      <line y1={-4} y2={4} />
    </g>
  ),
  // Flecha arriba.
  buff: <path d="M0,-4 L-3.5,0 L-1.3,0 L-1.3,4 L1.3,4 L1.3,0 L3.5,0 Z" fill="#fff" />,
  // Flecha abajo.
  debuff: <path d="M0,4 L-3.5,0 L-1.3,0 L-1.3,-4 L1.3,-4 L1.3,0 L3.5,0 Z" fill="#fff" />,
  // Cruz.
  heal: <path d="M-1.3,-4 H1.3 V-1.3 H4 V1.3 H1.3 V4 H-1.3 V1.3 H-4 V-1.3 H-1.3 Z" fill="#fff" />,
};

/** Icono cuadrado de habilidad: el de ART.abilityIcons o uno dibujado según su tipo. */
export function AbilityIcon({ abilityId, type, size }: { abilityId: string; type: AbilityType; size: number }) {
  const own = ART.abilityIcons[abilityId];
  if (own) return <img src={assetUrl(own)} width={size} height={size} alt="" />;
  const color = ABILITY_COLORS[type];
  return (
    <svg width={size} height={size} viewBox="-5 -5 10 10" aria-hidden>
      <defs>
        <linearGradient id={`grad-${type}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(color, 0.7)} />
          <stop offset="1" stopColor={shade(color, 0.25)} />
        </linearGradient>
      </defs>
      <rect x={-5} y={-5} width={10} height={10} fill={`url(#grad-${type})`} />
      <g opacity={0.92}>{SYMBOLS[type]}</g>
    </svg>
  );
}
