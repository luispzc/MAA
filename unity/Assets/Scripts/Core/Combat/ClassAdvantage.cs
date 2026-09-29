using System;
using System.Collections.Generic;
using MAA.Core.Data;

namespace MAA.Core.Combat
{
    public enum Matchup { Neutral, Advantage, Disadvantage }

    /// <summary>Resuelve el ciclo de ventajas de clase a partir de /data/classes.json.</summary>
    public sealed class ClassAdvantage
    {
        private readonly Dictionary<string, string> _strongAgainst =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        private readonly ClassCatalog _catalog;

        public ClassAdvantage(ClassCatalog catalog)
        {
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            foreach (var c in catalog.classes)
            {
                if (!string.IsNullOrEmpty(c.id) && !string.IsNullOrEmpty(c.strongAgainst))
                    _strongAgainst[c.id] = c.strongAgainst;
            }
        }

        public Matchup Resolve(string attackerClass, string defenderClass)
        {
            if (Beats(attackerClass, defenderClass)) return Matchup.Advantage;
            if (Beats(defenderClass, attackerClass)) return Matchup.Disadvantage;
            return Matchup.Neutral;
        }

        public float Multiplier(string attackerClass, string defenderClass)
        {
            switch (Resolve(attackerClass, defenderClass))
            {
                case Matchup.Advantage: return _catalog.rules.advantageDamageMultiplier;
                case Matchup.Disadvantage: return _catalog.rules.disadvantageDamageMultiplier;
                default: return 1f;
            }
        }

        private bool Beats(string a, string b) =>
            a != null && b != null && _strongAgainst.TryGetValue(a, out var target)
            && string.Equals(target, b, StringComparison.OrdinalIgnoreCase);
    }
}
