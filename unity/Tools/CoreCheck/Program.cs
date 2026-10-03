using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using MAA.Core.Combat;
using MAA.Core.Data;

// Compila MAA.Core fuera de Unity (C# 9) y comprueba reglas y datos.
// Uso:
//   dotnet run --project unity/Tools/CoreCheck                     usa /data del repo
//   dotnet run --project unity/Tools/CoreCheck -- --data <carpeta>
//   dotnet run --project unity/Tools/CoreCheck -- --trace <archivo> escribe la traza de
//     las semillas 1..200 para compararla con la versión web (tools/combat-trace.mjs).
internal static class Program
{
    private static readonly string[] PlayerTeam = { "iron_man", "captain_america", "thor" };
    private static readonly string[] EnemyTeam = { "hulk", "wolverine", "black_widow" };
    private const int TraceSeeds = 200;
    private static int _failures;

    private static int Main(string[] args)
    {
        string dataDir = Arg(args, "--data") ?? FindRepoData();
        string tracePath = Arg(args, "--trace");
        var data = Load(dataDir);
        Console.WriteLine($"Datos: {data.Heroes.heroes.Count} héroes, {data.Abilities.abilities.Count} habilidades, {data.Statuses.statuses.Count} efectos ({dataDir})");

        CheckData(data);
        CheckRules(data);

        int playerWins = 0, rounds = 0;
        var trace = new StringBuilder();
        for (int seed = 1; seed <= TraceSeeds; seed++)
        {
            var b = AutoBattle(data, seed, trace);
            Check(b.Winner.HasValue, $"semilla {seed}: el combate termina");
            if (b.Winner == Team.Player) playerWins++;
            rounds += b.Round;
        }
        Console.WriteLine($"{TraceSeeds} combates IA contra IA ({string.Join(", ", PlayerTeam)} vs {string.Join(", ", EnemyTeam)}): " +
                          $"gana el equipo del jugador {playerWins * 100 / TraceSeeds}%, {rounds / (double)TraceSeeds:F1} rondas de media");
        if (tracePath != null)
        {
            File.WriteAllText(tracePath, trace.ToString());
            Console.WriteLine($"Traza escrita en {tracePath}");
        }

        Console.WriteLine(_failures == 0 ? "OK: todas las comprobaciones pasaron" : $"FALLOS: {_failures}");
        return _failures == 0 ? 0 : 1;
    }

    private static void CheckData(GameData data)
    {
        foreach (var h in data.Heroes.heroes)
        {
            Check(data.Classes.classes.Any(c => c.id == h.classId), $"{h.id}: la clase '{h.classId}' existe");
            Check(!data.MissingAbilityIds(h).Any(), $"{h.id}: existen sus habilidades ({string.Join(", ", data.MissingAbilityIds(h))})");
        }
        foreach (var a in data.Abilities.abilities)
            foreach (var e in a.effects)
                Check(data.Status(e.id) != null, $"{a.id}: el efecto '{e.id}' existe en statuses.json");
    }

    private static void CheckRules(GameData data)
    {
        var b = new Battle(data, Heroes(data, PlayerTeam), Heroes(data, EnemyTeam), 1);
        var ironMan = b.Get("player-0");
        var hulk = b.Get("enemy-0");
        Check(b.CurrentActor == ironMan, "empieza el primer héroe del jugador");
        Check(b.MatchupBetween(ironMan, hulk) == Matchup.Advantage, "blaster tiene ventaja sobre bruiser");
        Check(b.MatchupBetween(hulk, ironMan) == Matchup.Disadvantage, "bruiser tiene desventaja contra blaster");
        Check(ironMan.Abilities.Last().id == "rest", "Descansar siempre está al final");
        Check(Battle.JsRound(2.5) == 3 && Battle.JsRound(-2.5) == -2, "redondeo igual que Math.round");

        // Contra una defensa de 3 estrellas, sin efectos ni clase, el daño es el de la ficha.
        var cap = b.Get("player-1");
        var wolverine = b.Get("enemy-1");
        var plain = new AbilityData { id = "x", properties = new List<string>() };
        Check(b.DamageBreakdown(cap, wolverine, 1000, false, plain).Amount == 1000, "defensa de referencia no cambia el daño");

        // Mulberry32: primeros valores con semilla 1, calculados con la versión web.
        var rng = new Rng(1);
        Check(Math.Abs(rng.Next() - 0.6270739405881613) < 1e-15, "mulberry32 igual que la web");
    }

    private static Battle AutoBattle(GameData data, int seed, StringBuilder trace)
    {
        var b = new Battle(data, Heroes(data, PlayerTeam), Heroes(data, EnemyTeam), seed);
        trace.Append("# seed ").Append(seed).Append('\n');
        int written = 0;
        for (int guard = 0; !b.Winner.HasValue && guard < 2000; guard++)
            b.Perform(BattleAi.Choose(b));
        foreach (var e in b.Log.Skip(written)) trace.Append(Format(e)).Append('\n');
        return b;
    }

    /// <summary>Línea canónica de un evento; tools/combat-trace.mjs escribe exactamente lo mismo.</summary>
    private static string Format(BattleEvent e)
    {
        switch (e.Type)
        {
            case EventType.RoundStart: return $"round-start {e.Round} {string.Join(",", e.Order)}";
            case EventType.TurnStart: return $"turn-start {e.ActorUid}";
            case EventType.TurnSkipped: return $"turn-skipped {e.ActorUid} {e.StatusId}";
            case EventType.AbilityUsed: return $"ability-used {e.ActorUid} {e.AbilityId} {string.Join(",", e.Targets)} {(e.Quick ? 1 : 0)}";
            case EventType.Miss: return $"miss {e.SourceUid} {e.TargetUid}";
            case EventType.Damage: return $"damage {e.SourceUid ?? "-"} {e.TargetUid} {e.Amount} {(e.Crit ? 1 : 0)} {e.Matchup.ToString().ToLowerInvariant()} {e.Cause}";
            case EventType.Heal: return $"heal {e.TargetUid} {e.Amount} {e.Cause}";
            case EventType.Stamina: return $"stamina {e.TargetUid} {e.Amount} {e.Cause}";
            case EventType.StatusApplied: return $"status-applied {e.TargetUid} {e.StatusId} {e.Duration} {e.Stacks}";
            case EventType.StatusResisted: return $"status-resisted {e.TargetUid} {e.StatusId}";
            case EventType.StatusRemoved: return $"status-removed {e.TargetUid} {e.StatusId} {e.Cause}";
            case EventType.StatusExpired: return $"status-expired {e.TargetUid} {e.StatusId}";
            case EventType.Ko: return $"ko {e.TargetUid}";
            case EventType.BattleEnd: return $"battle-end {(e.Winner == Team.Player ? "player" : "enemy")}";
            default: return e.Type.ToString();
        }
    }

    private static List<HeroData> Heroes(GameData data, IEnumerable<string> ids) => ids.Select(data.Hero).ToList();

    private static GameData Load(string dir)
    {
        var json = new JsonSerializerOptions { IncludeFields = true };
        T Read<T>(string file) => JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(dir, file)), json);
        return new GameData(Read<HeroCatalog>("heroes.json"), Read<ClassCatalog>("classes.json"),
            Read<AbilityCatalog>("abilities.json"), Read<StatusCatalog>("statuses.json"));
    }

    private static string FindRepoData()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "data", "heroes.json");
            if (File.Exists(candidate)) return Path.Combine(dir.FullName, "data");
        }
        throw new DirectoryNotFoundException("No encontré la carpeta data/ del repo; pásala con --data.");
    }

    private static string Arg(string[] args, string name)
    {
        int i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }

    private static void Check(bool ok, string what)
    {
        if (ok) return;
        _failures++;
        Console.WriteLine($"FALLA: {what}");
    }
}
