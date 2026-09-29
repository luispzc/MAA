using System;
using System.Collections.Generic;
using MAA.Core.Data;

namespace MAA.Core.Combat
{
    public enum Side { Heroes, Enemies }

    /// <summary>Estado vivo de un personaje durante un combate.</summary>
    public sealed class Combatant
    {
        private readonly Dictionary<string, int> _cooldowns = new Dictionary<string, int>();

        public HeroData Data { get; }
        public IReadOnlyList<AbilityData> Abilities { get; }
        public Side Side { get; }
        public int Health { get; private set; }
        public int Stamina { get; private set; }

        public string Name => Data.name;
        public string ClassId => Data.classId;
        public StatBlock Stats => Data.baseStats;
        public bool IsAlive => Health > 0;

        public Combatant(HeroData data, IReadOnlyList<AbilityData> abilities, Side side)
        {
            Data = data ?? throw new ArgumentNullException(nameof(data));
            Abilities = abilities ?? throw new ArgumentNullException(nameof(abilities));
            Side = side;
            Health = data.baseStats.health;
            Stamina = data.baseStats.stamina;
        }

        public int CooldownOf(AbilityData ability) =>
            _cooldowns.TryGetValue(ability.id, out var turns) ? turns : 0;

        public bool CanUse(AbilityData ability) =>
            IsAlive && Stamina >= ability.staminaCost && CooldownOf(ability) == 0;

        public void Use(AbilityData ability)
        {
            Stamina = Math.Max(0, Stamina - ability.staminaCost);
            // +1 porque el contador baja al empezar cada turno propio: así queda
            // bloqueada exactamente "cooldown" turnos.
            if (ability.cooldown > 0) _cooldowns[ability.id] = ability.cooldown + 1;
        }

        /// <summary>Se llama al empezar cada turno de este personaje.</summary>
        public void TickCooldowns()
        {
            foreach (var id in new List<string>(_cooldowns.Keys))
                _cooldowns[id] = Math.Max(0, _cooldowns[id] - 1);
        }

        public void TakeDamage(int amount) => Health = Math.Max(0, Health - Math.Max(0, amount));

        public override string ToString() => $"{Name} ({Health}/{Stats.health} HP)";
    }
}
