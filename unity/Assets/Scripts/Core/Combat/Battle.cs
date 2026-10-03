using System;
using System.Collections.Generic;
using System.Linq;
using MAA.Core.Data;

namespace MAA.Core.Combat
{
    public sealed class InvalidActionException : Exception
    {
        public InvalidActionException(string message) : base(message) { }
    }

    /// <summary>
    /// Combate por turnos de hasta 3 contra 3. Port directo de src/core/combat/battle.ts:
    /// mismas reglas, mismo orden de tiradas y mismo redondeo, así que con la misma
    /// semilla sale el mismo combate que en la versión web. Sin dependencias de Unity.
    /// </summary>
    public sealed class Battle
    {
        public const int TeamSize = 3;
        /// <summary>Fracción de la stamina máxima que se recupera al empezar cada turno.</summary>
        public const double StaminaRegenFraction = 0.1;
        /// <summary>Stamina extra (fracción de la máxima) que da Descansar.</summary>
        public const double RestStaminaFraction = 0.25;
        /// <summary>Stat de 3 estrellas a nivel 13 en el original: contra esa defensa el daño es el de la ficha.</summary>
        public const double StatReference = 1431;
        /// <summary>Puntos de acierto por cada estrella (143) de diferencia entre precisión y evasión.</summary>
        public const double AccuracyPointsPerStar = 5;
        private const double Star = 143;
        public const double CritMultiplier = 1.5;
        public const double DeadlyCritMultiplier = 2;
        public const double MinHitChance = 10;
        public const double AdamantiumDefenseIgnored = 0.5;
        public const double ExploitComboBonus = 0.5;
        public const double ExploitBleedBonusPerStack = 0.25;
        public const double AngerBonusPerStack = 0.15;

        /// <summary>Acción de reserva siempre disponible, para no quedarse sin opciones por falta de stamina.</summary>
        public static readonly AbilityData Rest = new AbilityData
        {
            id = "rest",
            heroId = "",
            name = "Descansar",
            unlockLevel = 1,
            type = "buff",
            target = "self",
            hits = 0,
            accuracy = 100,
            damage = null,
            description = $"Pasa el turno y recupera {RestStaminaFraction * 100}% de stamina extra.",
        };

        public GameData Data { get; }
        public int Round { get; private set; }
        public List<Combatant> Combatants { get; } = new List<Combatant>();
        /// <summary>Orden de actuación de la ronda actual (uids).</summary>
        public List<string> TurnOrder { get; private set; } = new List<string>();
        public int TurnIndex { get; private set; }
        public Team? Winner { get; private set; }
        public List<BattleEvent> Log { get; } = new List<BattleEvent>();
        public Rng Rng { get; }

        public Battle(GameData data, IList<HeroData> playerTeam, IList<HeroData> enemyTeam, int seed)
        {
            Data = data ?? throw new ArgumentNullException(nameof(data));
            foreach (var team in new[] { playerTeam, enemyTeam })
            {
                if (team.Count < 1 || team.Count > TeamSize)
                    throw new ArgumentException($"Cada equipo debe tener entre 1 y {TeamSize} héroes");
            }
            for (int i = 0; i < playerTeam.Count; i++) Combatants.Add(CreateCombatant(playerTeam[i], Team.Player, i));
            for (int i = 0; i < enemyTeam.Count; i++) Combatants.Add(CreateCombatant(enemyTeam[i], Team.Enemy, i));
            Rng = new Rng(seed);
            Advance();
        }

        private Combatant CreateCombatant(HeroData hero, Team team, int slot)
        {
            var abilities = hero.abilityIds
                .Select(id => Data.Ability(id) ?? throw new ArgumentException($"La habilidad {id} de {hero.name} no existe"))
                .ToList();
            abilities.Add(Rest);
            return new Combatant
            {
                Uid = $"{(team == Team.Player ? "player" : "enemy")}-{slot}",
                HeroId = hero.id,
                Name = hero.name,
                Team = team,
                Slot = slot,
                ClassId = hero.classId,
                Stats = hero.baseStats.Clone(),
                Art = hero.art,
                Abilities = abilities,
                Hp = hero.baseStats.health,
                Stamina = hero.baseStats.stamina,
            };
        }

        // ---- Consultas -------------------------------------------------------------

        public Combatant Get(string uid) =>
            Combatants.FirstOrDefault(c => c.Uid == uid) ?? throw new InvalidActionException($"No existe el combatiente {uid}");

        /// <summary>Combatiente al que le toca elegir acción, o null si la batalla terminó.</summary>
        public Combatant CurrentActor => Winner.HasValue ? null : Get(TurnOrder[TurnIndex]);

        public static int StaminaCost(Combatant c, AbilityData ability) =>
            JsRound(c.Stats.stamina * ability.staminaCostPercent / 100);

        public static bool CanUse(Combatant c, AbilityData ability) =>
            c.Stamina >= StaminaCost(c, ability) && c.CooldownOf(ability) == 0;

        /// <summary>Objetivos elegibles para una habilidad de objetivo único (vacío si no hay que elegir).</summary>
        public List<Combatant> SelectableTargets(Combatant actor, AbilityData ability)
        {
            if (ability.target == "single_enemy") return Combatants.Where(c => c.Team != actor.Team && c.IsAlive).ToList();
            if (ability.target == "single_ally") return Combatants.Where(c => c.Team == actor.Team && c.IsAlive).ToList();
            return new List<Combatant>();
        }

        public Matchup MatchupBetween(Combatant attacker, Combatant defender)
        {
            var classes = Data.Classes.classes;
            if (classes.FirstOrDefault(c => c.id == attacker.ClassId)?.strongAgainst == defender.ClassId) return Matchup.Advantage;
            if (classes.FirstOrDefault(c => c.id == defender.ClassId)?.strongAgainst == attacker.ClassId) return Matchup.Disadvantage;
            return Matchup.Neutral;
        }

        public double ClassMultiplier(Matchup m)
        {
            var rules = Data.Classes.rules;
            if (m == Matchup.Advantage) return rules.advantageDamageMultiplier;
            if (m == Matchup.Disadvantage) return rules.disadvantageDamageMultiplier;
            return 1;
        }

        /// <summary>
        /// Probabilidad de acertar (0 a 100): precisión de la ficha, más 5 puntos por
        /// estrella de precisión del atacante sobre la evasión del defensor, más efectos.
        /// </summary>
        public double HitChance(Combatant attacker, Combatant defender, AbilityData ability)
        {
            if (ability.Has("catastrophic") || HasFlag(defender, m => m.attacksCannotMiss)) return 100;
            bool canEvade = !HasFlag(defender, m => m.ignoreEvasion);
            double evasionStat = canEvade ? defender.Stats.evasion : StatReference;
            double statDiff = (attacker.Stats.accuracy - evasionStat) / Star * AccuracyPointsPerStar;
            double evasionMods = canEvade ? Sum(defender, m => m.evasion) : 0;
            double chance = ability.accuracy + statDiff + Sum(attacker, m => m.accuracy) - evasionMods;
            return Math.Min(100, Math.Max(MinHitChance, JsRound(chance)));
        }

        public double CritChance(Combatant attacker, AbilityData ability) =>
            Math.Min(100, Math.Max(0, ability.critChance + Sum(attacker, m => m.critChance)));

        // ---- Efectos ---------------------------------------------------------------

        public string StatusName(string id) => Data.Status(id)?.name ?? id;
        public bool IsDebuff(string id) => Data.Status(id)?.kind == "debuff";
        public bool IsBuff(string id) => Data.Status(id)?.kind == "buff";

        public static StatusEffect GetStatus(Combatant c, string id) => c.Statuses.FirstOrDefault(s => s.Id == id);
        public static bool HasStatus(Combatant c, string id) => c.Statuses.Any(s => s.Id == id);
        public static int StacksOf(Combatant c, string id) => GetStatus(c, id)?.Stacks ?? 0;

        /// <summary>Suma de un modificador numérico en todos los efectos del combatiente (por acumulación).</summary>
        public double Sum(Combatant c, Func<StatusModifiers, double> key)
        {
            double total = 0;
            foreach (var s in c.Statuses)
            {
                var mods = Data.Status(s.Id)?.modifiers;
                total += (mods != null ? key(mods) : 0) * s.Stacks;
            }
            return total;
        }

        public bool HasFlag(Combatant c, Func<StatusModifiers, bool> key) =>
            c.Statuses.Any(s => Data.Status(s.Id)?.modifiers is StatusModifiers m && key(m));

        /// <summary>Aplica o refresca un efecto: suma acumulaciones hasta el máximo y se queda con la duración mayor.</summary>
        private StatusEffect AddStatus(Combatant c, string id, int duration, int stacks)
        {
            int max = Data.Status(id)?.maxStacks ?? 1;
            var existing = GetStatus(c, id);
            if (existing != null)
            {
                existing.TurnsLeft = Math.Max(existing.TurnsLeft, duration);
                existing.Stacks = Math.Min(max, existing.Stacks + stacks);
                return existing;
            }
            var status = new StatusEffect { Id = id, TurnsLeft = duration, Stacks = Math.Min(max, stacks) };
            c.Statuses.Add(status);
            return status;
        }

        private static bool RemoveStatus(Combatant c, string id)
        {
            int i = c.Statuses.FindIndex(s => s.Id == id);
            if (i < 0) return false;
            c.Statuses.RemoveAt(i);
            return true;
        }

        // ---- Daño ------------------------------------------------------------------

        private double ExploitMultiplier(Combatant attacker, Combatant defender, AbilityData ability)
        {
            double mult = 1;
            if (ability.Has("exploits_combos") && HasStatus(defender, "combo_setup")) mult *= 1 + ExploitComboBonus;
            if (ability.Has("exploits_bleeds")) mult *= 1 + ExploitBleedBonusPerStack * StacksOf(defender, "bleed");
            if (ability.Has("anger_unleashed")) mult *= 1 + AngerBonusPerStack * StacksOf(attacker, "hulk_up");
            return mult;
        }

        /// <summary>
        /// Daño de un golpe sin aplicarlo. La tirada de la ficha ya incluye el ataque
        /// del héroe; la defensa mitiga con 2·REF / (REF + def) y luego cuentan clase,
        /// crítico, efectos y propiedades. Devuelve (final, antes de reducciones).
        /// </summary>
        public (int Amount, double BeforeTaken) DamageBreakdown(Combatant attacker, Combatant defender, double baseDamage, bool crit, AbilityData ability)
        {
            double attack = Math.Max(0.1, 1 + Sum(attacker, m => m.damageDealtPercent) / 100);
            double defense = defender.Stats.defense * Math.Max(0, 1 + Sum(defender, m => m.defensePercent) / 100);
            if (ability != null && ability.Has("adamantium")) defense *= 1 - AdamantiumDefenseIgnored;
            double mitigation = 2 * StatReference / (StatReference + defense);
            double classMod = ClassMultiplier(MatchupBetween(attacker, defender));
            double critMod = crit ? (ability != null && ability.Has("deadly_crits") ? DeadlyCritMultiplier : CritMultiplier) : 1;
            double exploit = ability != null ? ExploitMultiplier(attacker, defender, ability) : 1;
            double beforeTaken = baseDamage * attack * mitigation * classMod * critMod * exploit;

            double taken = Sum(defender, m => m.damageTakenPercent);
            // Un ataque poderoso atraviesa escudos: solo cuentan los efectos que suben el daño recibido.
            if (ability != null && ability.Has("mighty_attack"))
            {
                taken = 0;
                foreach (var s in defender.Statuses)
                {
                    double v = Data.Status(s.Id)?.modifiers?.damageTakenPercent ?? 0;
                    if (v > 0) taken += v * s.Stacks;
                }
            }
            double amount = beforeTaken * Math.Max(0, 1 + taken / 100);
            return (Math.Max(1, JsRound(amount)), beforeTaken);
        }

        // ---- Acciones --------------------------------------------------------------

        /// <summary>
        /// Ejecuta la acción de quien tiene el turno. Una acción rápida no gasta el
        /// turno; cualquier otra lo cierra y avanza al siguiente que pueda actuar.
        /// Devuelve los eventos generados, en orden.
        /// </summary>
        public List<BattleEvent> Perform(BattleAction action)
        {
            int logStart = Log.Count;
            var actor = CurrentActor ?? throw new InvalidActionException("La batalla ya terminó");
            if (actor.Uid != action.ActorUid)
                throw new InvalidActionException($"No es el turno de {action.ActorUid}, sino de {actor.Uid}");
            var ability = actor.Abilities.FirstOrDefault(a => a.id == action.AbilityId)
                ?? throw new InvalidActionException($"{actor.Name} no tiene la habilidad {action.AbilityId}");
            if (!CanUse(actor, ability)) throw new InvalidActionException($"{ability.name} no está disponible");

            var targets = ResolveTargets(actor, ability, action.TargetUid);
            bool quick = ability.Has("quick_action");
            actor.Stamina -= StaminaCost(actor, ability);
            // +1 porque el contador baja al empezar el siguiente turno propio.
            if (ability.cooldown > 0) actor.Cooldowns[ability.id] = ability.cooldown + 1;
            Emit(new BattleEvent { Type = EventType.AbilityUsed, ActorUid = actor.Uid, AbilityId = ability.id, Targets = targets.Select(t => t.Uid).ToList(), Quick = quick });

            if (ability.id == Rest.id)
            {
                int before = actor.Stamina;
                actor.Stamina = Math.Min(actor.Stats.stamina, actor.Stamina + JsRound(actor.Stats.stamina * RestStaminaFraction));
                Emit(new BattleEvent { Type = EventType.Stamina, TargetUid = actor.Uid, Amount = actor.Stamina - before, Cause = "rest" });
            }

            foreach (var target in targets)
            {
                bool landed = !ability.HasDamage;
                if (ability.HasDamage)
                {
                    for (int i = 0; i < ability.hits && target.IsAlive && actor.IsAlive; i++)
                    {
                        if (Strike(actor, target, ability)) landed = true;
                    }
                    if (landed && ability.Has("exploits_combos") && RemoveStatus(target, "combo_setup"))
                        Emit(new BattleEvent { Type = EventType.StatusRemoved, TargetUid = target.Uid, StatusId = "combo_setup", Cause = "exploits_combos" });
                }
                // Los efectos sobre un objetivo solo entran si al menos un golpe acertó.
                if (!landed || !target.IsAlive) continue;
                foreach (var effect in ability.effects)
                {
                    if (effect.target == "target") ApplyEffect(actor, target, effect);
                }
            }

            if (actor.IsAlive)
            {
                if (ability.Has("anger_unleashed") && RemoveStatus(actor, "hulk_up"))
                    Emit(new BattleEvent { Type = EventType.StatusRemoved, TargetUid = actor.Uid, StatusId = "hulk_up", Cause = "anger_unleashed" });
                foreach (var effect in ability.effects)
                {
                    if (effect.target == "self") ApplyEffect(actor, actor, effect);
                    if (effect.target == "all_allies")
                    {
                        foreach (var ally in Combatants.Where(c => c.Team == actor.Team && c.IsAlive).ToList())
                            ApplyEffect(actor, ally, effect);
                    }
                }
            }

            CheckWinner();
            if (!Winner.HasValue && !(quick && actor.IsAlive))
            {
                EndTurn(actor);
                TurnIndex++;
                Advance();
            }
            return Log.GetRange(logStart, Log.Count - logStart);
        }

        private void ApplyEffect(Combatant actor, Combatant target, AbilityEffect effect)
        {
            if (effect.chance < 1 && Rng.Next() >= effect.chance)
            {
                Emit(new BattleEvent { Type = EventType.StatusResisted, TargetUid = target.Uid, StatusId = effect.id });
                return;
            }
            if (Data.Status(effect.id)?.kind == "instant")
            {
                ApplyInstant(target, effect.id);
                return;
            }
            var status = AddStatus(target, effect.id, effect.duration, effect.stacks);
            if (target == actor) status.Fresh = true;
            Emit(new BattleEvent { Type = EventType.StatusApplied, TargetUid = target.Uid, StatusId = effect.id, Duration = effect.duration, Stacks = status.Stacks });
        }

        /// <summary>Efectos de un solo uso, que no se quedan en el objetivo.</summary>
        private void ApplyInstant(Combatant target, string id)
        {
            if (id != "remove_buffs") return;
            foreach (var s in target.Statuses.Where(x => IsBuff(x.Id)).ToList())
            {
                RemoveStatus(target, s.Id);
                Emit(new BattleEvent { Type = EventType.StatusRemoved, TargetUid = target.Uid, StatusId = s.Id, Cause = id });
            }
        }

        private List<Combatant> ResolveTargets(Combatant actor, AbilityData ability, string targetUid)
        {
            switch (ability.target)
            {
                case "self":
                    return new List<Combatant> { actor };
                case "all_enemies":
                    return Combatants.Where(c => c.Team != actor.Team && c.IsAlive).ToList();
                case "all_allies":
                    return Combatants.Where(c => c.Team == actor.Team && c.IsAlive).ToList();
                case "single_enemy":
                case "single_ally":
                {
                    if (string.IsNullOrEmpty(targetUid)) throw new InvalidActionException($"{ability.name} necesita un objetivo");
                    var target = Get(targetUid);
                    if (!SelectableTargets(actor, ability).Contains(target))
                        throw new InvalidActionException($"{target.Name} no es un objetivo válido para {ability.name}");
                    return new List<Combatant> { target };
                }
                default:
                    throw new InvalidActionException($"Objetivo desconocido: {ability.target}");
            }
        }

        /// <summary>Un golpe: tirada de acierto, de daño y de crítico, y contraataque si toca. Devuelve si acertó.</summary>
        private bool Strike(Combatant attacker, Combatant defender, AbilityData ability)
        {
            if (Rng.Next() * 100 >= HitChance(attacker, defender, ability))
            {
                Emit(new BattleEvent { Type = EventType.Miss, SourceUid = attacker.Uid, TargetUid = defender.Uid });
                return false;
            }
            int hits = Math.Max(1, ability.hits);
            double min = ability.damage.min / hits;
            double max = ability.damage.max / hits;
            double baseDamage = min + Rng.Next() * (max - min);
            bool crit = Rng.Next() * 100 < CritChance(attacker, ability);
            var (amount, beforeTaken) = DamageBreakdown(attacker, defender, baseDamage, crit, ability);
            ApplyDamage(defender, amount, attacker.Uid, crit, MatchupBetween(attacker, defender), "ability");
            Counter(attacker, defender, ability, beforeTaken);
            return true;
        }

        /// <summary>Devuelve parte del golpe a un atacante cuerpo a cuerpo si el defensor tiene un efecto de contraataque.</summary>
        private void Counter(Combatant attacker, Combatant defender, AbilityData ability, double beforeTaken)
        {
            if (ability.type != "melee" || !defender.IsAlive || !attacker.IsAlive) return;
            if (ability.Has("subtle") || ability.Has("stealthy")) return;
            if (HasFlag(defender, m => m.noCounter)) return;
            double percent = Sum(defender, m => m.counterPercent);
            if (percent <= 0) return;
            int amount = Math.Max(1, JsRound(beforeTaken * percent / 100));
            ApplyDamage(attacker, amount, defender.Uid, false, Matchup.Neutral, "counter");
        }

        private void ApplyDamage(Combatant target, int amount, string sourceUid, bool crit, Matchup matchup, string cause)
        {
            int dealt = Math.Min(target.Hp, amount);
            target.Hp -= dealt;
            Emit(new BattleEvent { Type = EventType.Damage, SourceUid = sourceUid, TargetUid = target.Uid, Amount = dealt, Crit = crit, Matchup = matchup, Cause = cause });
            if (target.Hp == 0)
            {
                target.Statuses.Clear();
                Emit(new BattleEvent { Type = EventType.Ko, TargetUid = target.Uid });
            }
        }

        private void Heal(Combatant target, int amount, string cause)
        {
            int healed = Math.Min(target.Stats.health - target.Hp, amount);
            target.Hp += healed;
            Emit(new BattleEvent { Type = EventType.Heal, TargetUid = target.Uid, Amount = healed, Cause = cause });
        }

        // ---- Turnos ----------------------------------------------------------------

        /// <summary>Nueva ronda: los equipos se alternan por puesto (jugador 1, enemigo 1, jugador 2...). Los caídos no entran.</summary>
        private void StartRound()
        {
            Round++;
            var order = new List<string>();
            for (int slot = 0; slot < TeamSize; slot++)
            {
                foreach (var team in new[] { Team.Player, Team.Enemy })
                {
                    var c = Combatants.FirstOrDefault(x => x.Team == team && x.Slot == slot);
                    if (c != null && c.IsAlive) order.Add(c.Uid);
                }
            }
            TurnOrder = order;
            TurnIndex = 0;
            Emit(new BattleEvent { Type = EventType.RoundStart, Round = Round, Order = new List<string>(order) });
        }

        /// <summary>
        /// Avanza hasta el próximo combatiente que puede elegir acción: empieza rondas,
        /// salta caídos, aplica efectos por turno y pierde el turno si está aturdido.
        /// </summary>
        private void Advance()
        {
            while (!Winner.HasValue)
            {
                if (TurnIndex >= TurnOrder.Count) StartRound();
                var actor = Get(TurnOrder[TurnIndex]);
                if (!actor.IsAlive) { TurnIndex++; continue; }
                Emit(new BattleEvent { Type = EventType.TurnStart, ActorUid = actor.Uid });
                StartTurn(actor);
                CheckWinner();
                if (Winner.HasValue) return;
                if (!actor.IsAlive) { TurnIndex++; continue; }
                var skip = actor.Statuses.FirstOrDefault(s => Data.Status(s.Id)?.modifiers?.skipTurn == true);
                if (skip != null)
                {
                    Emit(new BattleEvent { Type = EventType.TurnSkipped, ActorUid = actor.Uid, StatusId = skip.Id });
                    EndTurn(actor);
                    TurnIndex++;
                    continue;
                }
                return;
            }
        }

        private void StartTurn(Combatant actor)
        {
            int regen = JsRound(actor.Stats.stamina * StaminaRegenFraction);
            actor.Stamina = Math.Min(actor.Stats.stamina, actor.Stamina + regen);
            foreach (var id in actor.Cooldowns.Keys.ToList())
                actor.Cooldowns[id] = Math.Max(0, actor.Cooldowns[id] - 1);
            foreach (var status in actor.Statuses.ToList())
            {
                if (!actor.IsAlive) break;
                var mods = Data.Status(status.Id)?.modifiers;
                if (mods == null) continue;
                if (mods.healOverTimePercent != 0)
                    Heal(actor, Math.Max(1, JsRound(actor.Stats.health * mods.healOverTimePercent * status.Stacks / 100)), status.Id);
                if (mods.damageOverTimePercent != 0)
                {
                    int amount = Math.Max(1, JsRound(actor.Stats.health * mods.damageOverTimePercent * status.Stacks / 100));
                    ApplyDamage(actor, amount, null, false, Matchup.Neutral, status.Id);
                }
            }
        }

        /// <summary>Resta un turno a los efectos del combatiente, salvo los que se puso en este mismo turno.</summary>
        private void EndTurn(Combatant actor)
        {
            foreach (var status in actor.Statuses.ToList())
            {
                if (status.Fresh) { status.Fresh = false; continue; }
                status.TurnsLeft--;
                if (status.TurnsLeft <= 0)
                {
                    actor.Statuses.Remove(status);
                    Emit(new BattleEvent { Type = EventType.StatusExpired, TargetUid = actor.Uid, StatusId = status.Id });
                }
            }
        }

        private void CheckWinner()
        {
            if (Winner.HasValue) return;
            bool Alive(Team t) => Combatants.Any(c => c.Team == t && c.IsAlive);
            Team? winner = !Alive(Team.Enemy) ? Team.Player : !Alive(Team.Player) ? Team.Enemy : (Team?)null;
            if (winner.HasValue)
            {
                Winner = winner;
                Emit(new BattleEvent { Type = EventType.BattleEnd, Winner = winner.Value });
            }
        }

        private void Emit(BattleEvent e) => Log.Add(e);

        /// <summary>Math.round de JavaScript (redondea .5 hacia arriba), para que coincida con la web.</summary>
        public static int JsRound(double x) => (int)Math.Floor(x + 0.5);
    }
}
