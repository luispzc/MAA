using System;
using System.Collections.Generic;
using System.Linq;
using MAA.Core.Data;

namespace MAA.Core.Combat
{
    public enum BattleOutcome { InProgress, HeroesWin, EnemiesWin }

    /// <summary>Una línea del registro de combate, para mostrar en pantalla.</summary>
    public sealed class BattleEvent
    {
        public int Round;
        public Combatant Actor;
        public Combatant Target;
        public AbilityData Ability;
        public HitResult Result;
        public string Message;
    }

    /// <summary>
    /// Combate por turnos: en cada ronda actúa cada personaje vivo una vez,
    /// alternando bandos (héroe, enemigo, héroe...). Sin dependencias de Unity.
    /// Los efectos (buffs, debuffs, curas) aún no se aplican: solo gastan stamina y cooldown.
    /// </summary>
    public sealed class Battle
    {
        private readonly DamageCalculator _damage;
        private readonly Queue<Combatant> _turnQueue = new Queue<Combatant>();

        public IReadOnlyList<Combatant> Heroes { get; }
        public IReadOnlyList<Combatant> Enemies { get; }
        public int Round { get; private set; }
        public Combatant CurrentActor { get; private set; }
        public List<BattleEvent> Log { get; } = new List<BattleEvent>();

        public event Action<BattleEvent> OnEvent;

        public Battle(GameData data, IEnumerable<HeroData> heroes, IEnumerable<HeroData> enemies, DamageCalculator damage)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            _damage = damage ?? throw new ArgumentNullException(nameof(damage));
            Heroes = heroes.Select(h => new Combatant(h, data.AbilitiesOf(h), Side.Heroes)).ToList();
            Enemies = enemies.Select(h => new Combatant(h, data.AbilitiesOf(h), Side.Enemies)).ToList();
            if (Heroes.Count == 0 || Enemies.Count == 0)
                throw new ArgumentException("Cada bando necesita al menos un personaje.");
            AdvanceTurn();
        }

        public BattleOutcome Outcome
        {
            get
            {
                if (Enemies.All(e => !e.IsAlive)) return BattleOutcome.HeroesWin;
                if (Heroes.All(h => !h.IsAlive)) return BattleOutcome.EnemiesWin;
                return BattleOutcome.InProgress;
            }
        }

        public bool IsPlayerTurn => Outcome == BattleOutcome.InProgress && CurrentActor?.Side == Side.Heroes;

        public IReadOnlyList<Combatant> OpponentsOf(Combatant c) =>
            (c.Side == Side.Heroes ? Enemies : Heroes).Where(x => x.IsAlive).ToList();

        /// <summary>
        /// El personaje actual usa una habilidad. "target" solo hace falta en single_enemy;
        /// en el resto se ignora. Devuelve los eventos generados.
        /// </summary>
        public IReadOnlyList<BattleEvent> Act(AbilityData ability, Combatant target)
        {
            EnsureInProgress();
            var actor = CurrentActor;
            if (ability == null || !actor.Abilities.Contains(ability))
                throw new ArgumentException($"{actor.Name} no tiene la habilidad {ability?.name}.");
            if (!actor.CanUse(ability))
                throw new InvalidOperationException($"{actor.Name} no puede usar {ability.name} ahora (stamina o cooldown).");

            IReadOnlyList<Combatant> targets;
            if (ability.TargetsAllEnemies) targets = OpponentsOf(actor);
            else if (ability.target == "single_enemy")
            {
                if (target == null || target.Side == actor.Side || !target.IsAlive)
                    throw new ArgumentException("Objetivo inválido.");
                targets = new[] { target };
            }
            else targets = Array.Empty<Combatant>();

            actor.Use(ability);
            var produced = new List<BattleEvent>();
            if (!ability.DealsDamage)
            {
                produced.Add(Emit(actor, null, ability, default,
                    $"{actor.Name} usa {ability.name} (efecto aún no implementado)."));
            }
            foreach (var t in ability.DealsDamage ? targets : Array.Empty<Combatant>())
            {
                for (int i = 0; i < Math.Max(1, ability.hits) && t.IsAlive; i++)
                {
                    var result = _damage.Roll(actor, t, ability);
                    if (result.Hit) t.TakeDamage(result.Damage);
                    produced.Add(Emit(actor, t, ability, result, Describe(actor, t, ability, result)));
                }
            }

            AdvanceTurn();
            return produced;
        }

        /// <summary>El personaje actual no hace nada este turno.</summary>
        public IReadOnlyList<BattleEvent> Pass()
        {
            EnsureInProgress();
            var ev = Emit(CurrentActor, null, null, default, $"{CurrentActor.Name} pasa el turno.");
            AdvanceTurn();
            return new[] { ev };
        }

        /// <summary>IA simple: el ataque con más daño esperado que pueda usar, contra el rival con menos vida.</summary>
        public IReadOnlyList<BattleEvent> ActAuto()
        {
            EnsureInProgress();
            var actor = CurrentActor;
            var foes = OpponentsOf(actor);
            var ability = actor.Abilities
                .Where(a => a.DealsDamage && a.TargetsEnemies && actor.CanUse(a))
                .OrderByDescending(a => DamageCalculator.ExpectedBaseDamage(a) * (a.TargetsAllEnemies ? foes.Count : 1))
                .FirstOrDefault();
            if (ability == null) return Pass();
            return Act(ability, foes.OrderBy(t => t.Health).First());
        }

        private static string Describe(Combatant actor, Combatant target, AbilityData ability, HitResult r)
        {
            if (!r.Hit) return $"{actor.Name} usa {ability.name} sobre {target.Name}, pero falla.";
            return $"{actor.Name} usa {ability.name} sobre {target.Name}: {r.Damage} de daño"
                + (r.Critical ? " (crítico)" : "")
                + (r.Matchup == Matchup.Advantage ? " [ventaja de clase]" : "")
                + (r.Matchup == Matchup.Disadvantage ? " [desventaja de clase]" : "")
                + (target.IsAlive ? "." : $". {target.Name} cae.");
        }

        private BattleEvent Emit(Combatant actor, Combatant target, AbilityData ability, HitResult result, string msg)
        {
            var ev = new BattleEvent { Round = Round, Actor = actor, Target = target, Ability = ability, Result = result, Message = msg };
            Log.Add(ev);
            OnEvent?.Invoke(ev);
            return ev;
        }

        private void EnsureInProgress()
        {
            if (Outcome != BattleOutcome.InProgress)
                throw new InvalidOperationException("El combate ya terminó.");
        }

        private void AdvanceTurn()
        {
            if (Outcome != BattleOutcome.InProgress) { CurrentActor = null; return; }
            while (true)
            {
                if (_turnQueue.Count == 0) StartRound();
                var next = _turnQueue.Dequeue();
                if (!next.IsAlive) continue;
                CurrentActor = next;
                next.TickCooldowns();
                return;
            }
        }

        private void StartRound()
        {
            Round++;
            var h = Heroes.Where(x => x.IsAlive).ToList();
            var e = Enemies.Where(x => x.IsAlive).ToList();
            for (int i = 0; i < Math.Max(h.Count, e.Count); i++)
            {
                if (i < h.Count) _turnQueue.Enqueue(h[i]);
                if (i < e.Count) _turnQueue.Enqueue(e[i]);
            }
        }
    }
}
