using System;
using MAA.Core.Data;

namespace MAA.Core.Combat
{
    public struct HitResult
    {
        public bool Hit;
        public bool Critical;
        public int Damage;
        public Matchup Matchup;
    }

    /// <summary>
    /// Fórmulas de daño. Son una aproximación jugable, no las del juego original:
    /// todas las constantes están aquí para ajustarlas (y alinearlas con la versión web).
    /// </summary>
    public sealed class DamageCalculator
    {
        public double BaseHitChance = 0.90;
        public double MinHitChance = 0.50;
        public double MaxHitChance = 0.99;
        public double BaseCritChance = 0.10;
        public double CritMultiplier = 1.5;
        /// <summary>Cuánto pesan ataque y defensa: daño × (K + ataque) / (K + defensa).</summary>
        public double StatScale = 100.0;

        private readonly ClassAdvantage _advantage;
        private readonly IRandom _random;

        public DamageCalculator(ClassAdvantage advantage, IRandom random)
        {
            _advantage = advantage ?? throw new ArgumentNullException(nameof(advantage));
            _random = random ?? throw new ArgumentNullException(nameof(random));
        }

        public double HitChance(Combatant attacker, Combatant defender)
        {
            var chance = BaseHitChance + (attacker.Stats.accuracy - defender.Stats.evasion) / 100.0;
            return Math.Max(MinHitChance, Math.Min(MaxHitChance, chance));
        }

        /// <summary>Un golpe: daño base aleatorio entre damage.min y damage.max, escalado por stats y clase.</summary>
        public HitResult Roll(Combatant attacker, Combatant defender, AbilityData ability)
        {
            var result = new HitResult { Matchup = _advantage.Resolve(attacker.ClassId, defender.ClassId) };
            if (!ability.DealsDamage || _random.NextDouble() >= HitChance(attacker, defender))
                return result;

            result.Hit = true;
            result.Critical = _random.NextDouble() < BaseCritChance;

            int min = Math.Min(ability.damage.min, ability.damage.max);
            double raw = min + _random.NextDouble() * (ability.damage.max - min);
            raw *= (StatScale + attacker.Stats.attack) / (StatScale + defender.Stats.defense);
            raw *= _advantage.Multiplier(attacker.ClassId, defender.ClassId);
            if (result.Critical) raw *= CritMultiplier;

            result.Damage = Math.Max(1, (int)Math.Round(raw));
            return result;
        }

        public static double ExpectedBaseDamage(AbilityData ability) =>
            ability.DealsDamage ? (ability.damage.min + ability.damage.max) / 2.0 * Math.Max(1, ability.hits) : 0;
    }
}
