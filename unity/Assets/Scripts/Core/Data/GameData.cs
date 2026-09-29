using System;
using System.Collections.Generic;
using System.Linq;

namespace MAA.Core.Data
{
    /// <summary>Los tres catálogos juntos, con búsqueda por id.</summary>
    public sealed class GameData
    {
        public HeroCatalog Heroes { get; }
        public ClassCatalog Classes { get; }
        public AbilityCatalog Abilities { get; }

        private readonly Dictionary<string, AbilityData> _abilitiesById;

        public GameData(HeroCatalog heroes, ClassCatalog classes, AbilityCatalog abilities)
        {
            Heroes = heroes ?? new HeroCatalog();
            Classes = classes ?? new ClassCatalog();
            Abilities = abilities ?? new AbilityCatalog();
            _abilitiesById = Abilities.abilities
                .Where(a => !string.IsNullOrEmpty(a.id))
                .GroupBy(a => a.id)
                .ToDictionary(g => g.Key, g => g.First());
        }

        public HeroData Hero(string id) =>
            Heroes.heroes.FirstOrDefault(h => h.id == id)
            ?? throw new ArgumentException($"No existe el héroe '{id}'.");

        /// <summary>Habilidades del héroe en el orden de abilityIds; ignora ids que no existan.</summary>
        public List<AbilityData> AbilitiesOf(HeroData hero) =>
            hero.abilityIds
                .Select(id => _abilitiesById.TryGetValue(id, out var a) ? a : null)
                .Where(a => a != null)
                .ToList();

        public IEnumerable<string> MissingAbilityIds(HeroData hero) =>
            hero.abilityIds.Where(id => !_abilitiesById.ContainsKey(id));
    }
}
