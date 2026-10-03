using System;
using System.Collections.Generic;
using System.Linq;
using MAA.Core.Data;

namespace MAA.Core.Combat
{
    /// <summary>IA de los enemigos. Port de src/core/combat/ai.ts: determinista y con las mismas puntuaciones.</summary>
    public static class BattleAi
    {
        /// <summary>Valor estimado de una habilidad (mayor es mejor).</summary>
        private static double Score(Battle battle, Combatant actor, AbilityData ability)
        {
            if (ability.id == Battle.Rest.id) return -1;
            var enemies = battle.Combatants.Where(c => c.Team != actor.Team && c.IsAlive).ToList();
            int allies = battle.Combatants.Count(c => c.Team == actor.Team && c.IsAlive);
            double score = 0;
            if (ability.HasDamage)
            {
                score = (ability.damage.min + ability.damage.max) / 2 * (ability.accuracy / 100);
                if (ability.target == "all_enemies") score *= enemies.Count * 0.8;
            }
            foreach (var effect in ability.effects)
            {
                var def = battle.Data.Status(effect.id);
                bool onEnemy = effect.target == "target" && (ability.target == "single_enemy" || ability.target == "all_enemies");
                if (def?.kind == "instant")
                {
                    // Quitar mejoras solo vale si algún enemigo tiene alguna.
                    score += enemies.Any(e => e.Statuses.Any(s => battle.IsBuff(s.Id))) ? 150 : 0;
                }
                else if (onEnemy)
                {
                    score += 80 * effect.chance * (ability.target == "all_enemies" ? enemies.Count : 1);
                }
                else
                {
                    bool self = effect.target == "self" || ability.target == "self";
                    bool already = self && Battle.HasStatus(actor, effect.id) && (def?.maxStacks ?? 1) <= 1;
                    score += already ? -100 : 150 * (effect.target == "all_allies" || ability.target == "all_allies" ? allies : 1);
                }
            }
            // Las acciones rápidas no gastan el turno: casi siempre conviene usarlas primero.
            if (ability.Has("quick_action") && score > 0) score += 2000;
            return score;
        }

        /// <summary>Enemigo preferido: con ventaja de clase primero, luego el de menos vida.</summary>
        private static Combatant PickEnemy(Battle battle, Combatant actor, List<Combatant> candidates)
        {
            int Rank(Combatant c)
            {
                switch (battle.MatchupBetween(actor, c))
                {
                    case Matchup.Advantage: return 0;
                    case Matchup.Neutral: return 1;
                    default: return 2;
                }
            }
            return candidates.OrderBy(Rank).ThenBy(c => c.Hp).First();
        }

        /// <summary>Elige una acción razonable para quien tenga el turno.</summary>
        public static BattleAction Choose(Battle battle)
        {
            var actor = battle.CurrentActor ?? throw new InvalidOperationException("La batalla ya terminó");
            // OrderBy es estable, igual que Array.prototype.sort en la web: los empates mantienen el orden.
            var ability = actor.Abilities
                .Where(a => Battle.CanUse(actor, a))
                .OrderByDescending(a => Score(battle, actor, a))
                .First();

            var candidates = battle.SelectableTargets(actor, ability);
            string targetUid = null;
            if (ability.target == "single_enemy") targetUid = PickEnemy(battle, actor, candidates).Uid;
            else if (ability.target == "single_ally")
                targetUid = candidates.OrderBy(c => (double)c.Hp / c.Stats.health).First().Uid;
            return new BattleAction { ActorUid = actor.Uid, AbilityId = ability.id, TargetUid = targetUid };
        }
    }
}
