using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using MAA.Core.Combat;
using MAA.Core.Data;

// Uso: dotnet run --project unity/Tools/CoreCheck [carpeta de datos]
// Sin argumento lee unity/Assets/StreamingAssets/data.
internal static class Program
{
    private static int _failures;

    private static int Main(string[] args)
    {
        var baseDir = AppContext.BaseDirectory;
        var dataDir = args.Length > 0
            ? args[0]
            : Path.GetFullPath(Path.Combine(baseDir, "../../../../../Assets/StreamingAssets/data"));
        var json = new JsonSerializerOptions { IncludeFields = true, PropertyNameCaseInsensitive = false };
        T Load<T>(string file) => JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(dataDir, file)), json);
        var data = new GameData(Load<HeroCatalog>("heroes.json"), Load<ClassCatalog>("classes.json"), Load<AbilityCatalog>("abilities.json"));
        var heroes = data.Heroes.heroes;
        var classes = data.Classes;
        Console.WriteLine($"Datos: {heroes.Count} héroes, {classes.classes.Count} clases, {data.Abilities.abilities.Count} habilidades ({dataDir})");

        var adv = new ClassAdvantage(classes);
        Check(adv.Resolve("bruiser", "scrapper") == Matchup.Advantage, "bruiser gana a scrapper");
        Check(adv.Resolve("scrapper", "bruiser") == Matchup.Disadvantage, "scrapper pierde contra bruiser");
        Check(adv.Resolve("blaster", "bruiser") == Matchup.Advantage, "blaster gana a bruiser (cierra el ciclo)");
        Check(adv.Resolve("generalist", "blaster") == Matchup.Neutral, "generalist es neutral");
        foreach (var h in heroes)
        {
            Check(classes.classes.Any(c => c.id == h.classId), $"{h.id}: clase '{h.classId}' existe");
            Check(!data.MissingAbilityIds(h).Any(), $"{h.id}: todas sus habilidades existen ({string.Join(", ", data.MissingAbilityIds(h))})");
            Check(data.AbilitiesOf(h).Any(a => a.DealsDamage && a.staminaCost == 0 && a.cooldown == 0), $"{h.id}: tiene un ataque sin coste ni cooldown");
        }

        // Mismo seed, mismo resultado.
        Check(Simulate(data, 42).Log.Count == Simulate(data, 42).Log.Count, "combate reproducible con semilla");

        // Cooldown: una habilidad con cooldown 2 queda bloqueada los 2 turnos propios siguientes.
        var cdAbility = data.Abilities.abilities.FirstOrDefault(a => a.cooldown == 2 && a.DealsDamage && a.target == "single_enemy");
        if (cdAbility != null)
        {
            var owner = data.Hero(cdAbility.heroId);
            var rival = heroes.First(h => h.id != owner.id);
            var b = new Battle(data, new[] { owner }, new[] { rival }, new DamageCalculator(new ClassAdvantage(classes), new SystemRandom(1)));
            var me = b.Heroes[0];
            Check(me.CanUse(cdAbility), "cooldown: disponible al inicio");
            b.Act(cdAbility, b.Enemies[0]);
            int blocked = 0;
            for (int turn = 0; turn < 5 && b.Outcome == BattleOutcome.InProgress; turn++)
            {
                if (b.CurrentActor != me) { b.Pass(); continue; }
                if (me.CanUse(cdAbility)) break;
                blocked++;
                b.Pass();
            }
            Check(blocked == 2, $"cooldown 2 bloquea 2 turnos (bloqueó {blocked})");
        }

        int heroWins = 0, rounds = 0;
        const int n = 500;
        for (int s = 1; s <= n; s++)
        {
            var b = Simulate(data, s);
            Check(b.Outcome != BattleOutcome.InProgress, $"semilla {s}: el combate termina");
            if (b.Outcome == BattleOutcome.HeroesWin) heroWins++;
            rounds += b.Round;
        }
        Console.WriteLine($"{n} combates auto (3 primeros vs 3 últimos): héroes ganan {heroWins * 100 / n}%, {rounds / (double)n:F1} rondas de media");

        var sample = Simulate(data, 7);
        Console.WriteLine("\nEjemplo (semilla 7):");
        foreach (var e in sample.Log.Take(12)) Console.WriteLine($"  R{e.Round}: {e.Message}");
        Console.WriteLine($"  ... {sample.Outcome} en {sample.Round} rondas");

        Console.WriteLine(_failures == 0 ? "\nOK: todas las comprobaciones pasaron" : $"\nFALLOS: {_failures}");
        return _failures == 0 ? 0 : 1;
    }

    private static Battle Simulate(GameData data, int seed)
    {
        var heroes = data.Heroes.heroes;
        var battle = new Battle(data, heroes.Take(3), heroes.Skip(heroes.Count - 3),
            new DamageCalculator(new ClassAdvantage(data.Classes), new SystemRandom(seed)));
        for (int guard = 0; battle.Outcome == BattleOutcome.InProgress && guard < 10_000; guard++)
            battle.ActAuto();
        return battle;
    }

    private static void Check(bool ok, string what)
    {
        if (ok) return;
        _failures++;
        Console.WriteLine($"FALLA: {what}");
    }
}
