using System.Collections.Generic;
using System.Linq;

namespace MAA.Core.Combat
{
    /// <summary>Textos en español del combate. Port de src/core/combat/describe.ts.</summary>
    public static class BattleText
    {
        /// <summary>Texto de un evento para el registro (null = no se muestra).</summary>
        public static string Describe(Battle b, BattleEvent e)
        {
            string Name(string uid) => b.Get(uid).Name;
            switch (e.Type)
            {
                case EventType.RoundStart:
                    return $"— Ronda {e.Round} —";
                case EventType.TurnStart:
                case EventType.StatusExpired:
                    return null;
                case EventType.TurnSkipped:
                    return $"{Name(e.ActorUid)} está {b.StatusName(e.StatusId).ToLowerInvariant()} y pierde el turno.";
                case EventType.AbilityUsed:
                {
                    var actor = b.Get(e.ActorUid);
                    var ability = actor.Abilities.FirstOrDefault(a => a.id == e.AbilityId);
                    return $"{actor.Name} usa {ability?.name ?? e.AbilityId}{(e.Quick ? " (acción rápida)" : "")}.";
                }
                case EventType.Miss:
                    return $"{Name(e.TargetUid)} esquiva el golpe.";
                case EventType.Damage:
                {
                    if (e.Cause == "counter") return $"{Name(e.TargetUid)} recibe {e.Amount} de contraataque.";
                    if (e.Cause != "ability") return $"{Name(e.TargetUid)} pierde {e.Amount} por {b.StatusName(e.Cause)}.";
                    var tags = new List<string>();
                    if (e.Crit) tags.Add("¡crítico!");
                    if (e.Matchup == Matchup.Advantage) tags.Add("ventaja");
                    if (e.Matchup == Matchup.Disadvantage) tags.Add("desventaja");
                    return $"{Name(e.TargetUid)} recibe {e.Amount} de daño{(tags.Count > 0 ? $" ({string.Join(", ", tags)})" : "")}.";
                }
                case EventType.Heal:
                    return e.Amount > 0 ? $"{Name(e.TargetUid)} recupera {e.Amount} de vida." : null;
                case EventType.Stamina:
                    return $"{Name(e.TargetUid)} recupera {e.Amount} de stamina.";
                case EventType.StatusApplied:
                    return $"{Name(e.TargetUid)}: {b.StatusName(e.StatusId)}{(e.Stacks > 1 ? $" x{e.Stacks}" : "")} ({e.Duration} t).";
                case EventType.StatusResisted:
                    return $"{Name(e.TargetUid)} resiste {b.StatusName(e.StatusId)}.";
                case EventType.StatusRemoved:
                    return $"{Name(e.TargetUid)} pierde {b.StatusName(e.StatusId)}.";
                case EventType.Ko:
                    return $"¡{Name(e.TargetUid)} queda fuera de combate!";
                case EventType.BattleEnd:
                    return e.Winner == Team.Player ? "¡Victoria!" : "Derrota…";
                default:
                    return null;
            }
        }

        /// <summary>Nombre y explicación de cada propiedad especial.</summary>
        public static readonly Dictionary<string, (string Name, string Description)> Properties =
            new Dictionary<string, (string, string)>
            {
                ["quick_action"] = ("Acción rápida", "No gasta el turno."),
                ["deadly_crits"] = ("Críticos letales", "Los críticos hacen x2 en vez de x1.5."),
                ["high_crits"] = ("Críticos altos", "Más probabilidad de crítico (ya incluida)."),
                ["mighty_attack"] = ("Ataque poderoso", "Ignora escudos y reducciones de daño."),
                ["catastrophic"] = ("Catastrófico", "No se puede esquivar."),
                ["anger_unleashed"] = ("Furia desatada", "Consume Hulk se crece: +15% de daño por acumulación."),
                ["exploits_combos"] = ("Explota combos", "+50% contra Combo preparado, y lo consume."),
                ["exploits_bleeds"] = ("Explota sangrados", "+25% por cada acumulación de Sangrado."),
                ["adamantium"] = ("Adamantium", "Ignora la mitad de la defensa."),
                ["subtle"] = ("Sutil", "No provoca contraataques."),
                ["stealthy"] = ("Sigiloso", "No provoca contraataques."),
            };

        public static string PropertyName(string id) => Properties.TryGetValue(id, out var p) ? p.Name : id;
    }
}
