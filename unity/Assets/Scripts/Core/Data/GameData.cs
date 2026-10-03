using System;
using System.Collections.Generic;
using System.Linq;

namespace MAA.Core.Data
{
    /// <summary>Los cuatro archivos de /data juntos, con búsqueda por id.</summary>
    public sealed class GameData
    {
        public HeroCatalog Heroes { get; }
        public ClassCatalog Classes { get; }
        public AbilityCatalog Abilities { get; }
        public StatusCatalog Statuses { get; }

        private readonly Dictionary<string, HeroData> _heroById;
        private readonly Dictionary<string, AbilityData> _abilityById;
        private readonly Dictionary<string, StatusDefinition> _statusById;

        public GameData(HeroCatalog heroes, ClassCatalog classes, AbilityCatalog abilities, StatusCatalog statuses)
        {
            Heroes = heroes ?? new HeroCatalog();
            Classes = classes ?? new ClassCatalog();
            Abilities = abilities ?? new AbilityCatalog();
            Statuses = statuses ?? new StatusCatalog();
            _heroById = ById(Heroes.heroes, h => h.id);
            _abilityById = ById(Abilities.abilities, a => a.id);
            _statusById = ById(Statuses.statuses, s => s.id);
        }

        private static Dictionary<string, T> ById<T>(IEnumerable<T> items, Func<T, string> id) =>
            items.Where(x => !string.IsNullOrEmpty(id(x))).GroupBy(id).ToDictionary(g => g.Key, g => g.First());

        public HeroData Hero(string id) =>
            _heroById.TryGetValue(id, out var h) ? h : throw new ArgumentException($"No existe el héroe '{id}'.");

        public AbilityData Ability(string id) => _abilityById.TryGetValue(id, out var a) ? a : null;

        public StatusDefinition Status(string id) => id != null && _statusById.TryGetValue(id, out var s) ? s : null;

        public IEnumerable<string> MissingAbilityIds(HeroData hero) =>
            hero.abilityIds.Where(id => !_abilityById.ContainsKey(id));
    }
}
