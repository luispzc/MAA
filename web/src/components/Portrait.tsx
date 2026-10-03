import type { Hero, HeroClassId } from '@maa/shared';
import { ART, CLASS_COLORS, assetUrl, initials, shade } from '../battle/theme';

interface Props {
  hero: Hero | undefined;
  name: string;
  classId: HeroClassId;
  size: number;
}

/**
 * Retrato cuadrado: el propio de ART.portraits, o la cabeza recortada de la
 * figura (art.portraitCrop) sobre el color de la clase, o un marcador con iniciales.
 */
export function Portrait({ hero, name, classId, size }: Props) {
  const color = CLASS_COLORS[classId];
  const own = hero && ART.portraits[hero.id];
  const crop = hero?.art?.portraitCrop;
  const background = `linear-gradient(${shade(color, 0.6)}, ${shade(color, crop ? 0.2 : 0.25)})`;

  if (own) {
    return <img className="portrait" src={assetUrl(own)} width={size} height={size} alt={name} />;
  }
  if (hero?.art && crop) {
    const k = size / crop.size;
    return (
      <div className="portrait" style={{ width: size, height: size, background }}>
        <img
          src={assetUrl(hero.art.figure)}
          alt={name}
          style={{ position: 'absolute', left: -crop.x * k, top: -crop.y * k, transform: `scale(${k})`, transformOrigin: '0 0', maxWidth: 'none' }}
        />
      </div>
    );
  }
  return (
    <div className="portrait portrait-marker" style={{ width: size, height: size, background }}>
      <span style={{ background: shade(color, 1.2), width: size * 0.44, height: size * 0.44, top: size * 0.06 }} className="portrait-head" />
      <span style={{ fontSize: Math.max(9, Math.round(size * 0.24)) }} className="portrait-initials">
        {initials(name)}
      </span>
    </div>
  );
}
