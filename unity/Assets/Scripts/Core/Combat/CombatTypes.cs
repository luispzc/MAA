using System.Collections.Generic;
using MAA.Core.Data;

// Tipos del motor de combate. Espejo de src/core/combat/types.ts: la versión web
// y la de Unity deben dar el mismo combate con la misma semilla.
namespace MAA.Core.Combat
{
    public enum Team { Player, Enemy }

    public enum Matchup { Neutral, Advantage, Disadvantage }

    public sealed class StatusEffect
    {
        /// <summary>Id de data/statuses.json. Uno desconocido se muestra pero no tiene efecto mecánico.</summary>
        public string Id;
        /// <summary>Turnos propios del portador que le quedan al efecto.</summary>
        public int TurnsLeft;
        public int Stacks;
        /// <summary>Puesto por el portador en su turno actual: ese turno no cuenta.</summary>
        public bool Fresh;
    }

    public sealed class Combatant
    {
        /// <summary>Identificador único en la batalla, p. ej. "player-0".</summary>
        public string Uid;
        public string HeroId;
        public string Name;
        public Team Team;
        public int Slot;
        public string ClassId;
        public StatBlock Stats;
        public HeroArt Art;
        /// <summary>Habilidades del héroe más Descansar al final.</summary>
        public List<AbilityData> Abilities;
        public int Hp;
        public int Stamina;
        public List<StatusEffect> Statuses = new List<StatusEffect>();
        /// <summary>Turnos que faltan para poder usar cada habilidad (por id).</summary>
        public Dictionary<string, int> Cooldowns = new Dictionary<string, int>();

        public bool IsAlive => Hp > 0;

        public int CooldownOf(AbilityData ability) => Cooldowns.TryGetValue(ability.id, out var t) ? t : 0;
    }

    public sealed class BattleAction
    {
        public string ActorUid;
        public string AbilityId;
        /// <summary>Obligatorio para habilidades de objetivo único.</summary>
        public string TargetUid;
    }

    public enum EventType
    {
        RoundStart, TurnStart, TurnSkipped, AbilityUsed, Miss, Damage, Heal, Stamina,
        StatusApplied, StatusResisted, StatusRemoved, StatusExpired, Ko, BattleEnd,
    }

    /// <summary>Un evento del combate. Cada tipo usa solo algunos campos (igual que en la web).</summary>
    public sealed class BattleEvent
    {
        public EventType Type;
        public int Round;
        public List<string> Order;
        public string ActorUid;
        public string SourceUid;
        public string TargetUid;
        public string AbilityId;
        public List<string> Targets;
        public bool Quick;
        public int Amount;
        public bool Crit;
        public Matchup Matchup;
        /// <summary>'ability', 'counter', 'rest' o el id del efecto que lo causó.</summary>
        public string Cause;
        /// <summary>Id del efecto (o el motivo en TurnSkipped).</summary>
        public string StatusId;
        public int Duration;
        public int Stacks;
        public Team Winner;
    }
}
