import { useState } from 'react';
import { canUseAbility, currentActor, staminaCost, type Ability } from '@maa/shared';
import type { BattleController, BattleSnapshot } from '../battle/BattleController';
import { GAME_WIDTH, ICON } from '../battle/theme';
import { abilityTooltipLines } from '../battle/view';
import { AbilityIcon } from './AbilityIcon';

const ITEM_SLOTS = 3;
const STEP = ICON + 8;
const TOOLTIP_W = 290;

/** Barra de iconos: habilidades del héroe activo y ranuras de objetos (aún sin uso). */
export function AbilityBar({ snapshot, controller }: { snapshot: BattleSnapshot; controller: BattleController }) {
  const [hovered, setHovered] = useState<{ ability: Ability; x: number } | null>(null);
  const { state, mode, pendingAbility } = snapshot;
  const actor = currentActor(state);
  const mine = actor?.team === 'player' && (mode === 'choose-ability' || mode === 'choose-target');
  const abilities = mine && actor ? actor.abilities : [];
  const slots = Math.max(abilities.length, 3) + ITEM_SLOTS;
  const startX = GAME_WIDTH / 2 - ((slots - 1) * STEP) / 2;
  const tooltip = hovered && actor && abilities.includes(hovered.ability) ? hovered : null;

  return (
    <>
      <div className="ability-band" />
      <div className="ability-bar">
        {Array.from({ length: slots }, (_, i) => {
          const x = startX + i * STEP + (i >= slots - ITEM_SLOTS ? 14 : 0);
          const ability = abilities[i];
          const style = { left: x - (ICON + 4) / 2 };
          if (!ability || !actor) {
            return (
              <div key={`empty-${i}`} className="ability-slot" style={style}>
                {i >= slots - ITEM_SLOTS && <span className="item-plus">+</span>}
              </div>
            );
          }
          const usable = canUseAbility(actor, ability);
          const selected = pendingAbility?.id === ability.id;
          const cd = actor.cooldowns[ability.id] ?? 0;
          return (
            <button
              key={ability.id}
              type="button"
              className={`ability-slot ability ${usable ? 'usable' : 'unusable'} ${selected ? 'selected' : ''}`}
              style={style}
              aria-label={ability.name}
              aria-disabled={!usable}
              onClick={() => usable && controller.chooseAbility(ability)}
              onMouseEnter={() => setHovered({ ability, x })}
              onMouseLeave={() => setHovered(null)}
            >
              <AbilityIcon abilityId={ability.id} type={ability.type} size={ICON} />
              {cd > 0 ? (
                <span className="ability-cooldown">{cd}</span>
              ) : ability.staminaCostPercent > 0 ? (
                <span className="ability-cost">{staminaCost(actor, ability)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tooltip && actor && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(tooltip.x - TOOLTIP_W / 2, 6), GAME_WIDTH - TOOLTIP_W - 6), width: TOOLTIP_W }}
        >
          <strong>{tooltip.ability.name}</strong>
          {abilityTooltipLines(state, actor, tooltip.ability).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </>
  );
}
