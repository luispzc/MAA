using System.Collections.Generic;
using System.Linq;
using MAA.Core.Combat;
using MAA.Core.Data;
using UnityEngine;

namespace MAA.Runtime
{
    /// <summary>
    /// Prototipo jugable sin escena ni arte: dibuja el combate con IMGUI.
    /// Se crea solo al darle Play en cualquier escena (ver Bootstrap), así que
    /// sirve para probar datos y reglas antes de tener la UI definitiva.
    /// </summary>
    public sealed class BattleDebugView : MonoBehaviour
    {
        [Tooltip("Ids de héroes del jugador. Vacío = los tres primeros del catálogo.")]
        public List<string> heroIds = new List<string>();
        [Tooltip("Ids de rivales. Vacío = los tres últimos del catálogo.")]
        public List<string> enemyIds = new List<string>();
        [Tooltip("Semilla para repetir un combate. 0 = aleatorio.")]
        public int seed;
        [Tooltip("Segundos entre acciones enemigas.")]
        public float enemyDelay = 0.8f;

        private Battle _battle;
        private AbilityData _selectedAbility;
        private float _enemyTimer;
        private Vector2 _logScroll;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Bootstrap()
        {
            if (FindAnyObjectByType<BattleDebugView>() == null)
                new GameObject("MAA Battle (debug)").AddComponent<BattleDebugView>();
        }

        private void Start() => NewBattle();

        private void NewBattle()
        {
            var data = GameDataLoader.LoadAll();
            var heroes = data.Heroes.heroes;
            if (heroes.Count < 2)
            {
                Debug.LogError("[MAA] Hacen falta al menos 2 héroes en heroes.json.");
                return;
            }

            var team = Pick(heroes, heroIds, heroes.Take(3));
            var rivals = Pick(heroes, enemyIds, heroes.Skip(System.Math.Max(0, heroes.Count - 3)));
            var random = new SystemRandom(seed == 0 ? (int?)null : seed);
            _battle = new Battle(data, team, rivals, new DamageCalculator(new ClassAdvantage(data.Classes), random));
            _battle.OnEvent += e => Debug.Log($"[MAA] R{e.Round}: {e.Message}");
            _selectedAbility = null;
        }

        private static List<HeroData> Pick(List<HeroData> all, List<string> ids, IEnumerable<HeroData> fallback) =>
            ids.Count == 0 ? fallback.ToList() : ids.Select(id => all.First(h => h.id == id)).ToList();

        private void Update()
        {
            if (_battle == null || _battle.Outcome != BattleOutcome.InProgress || _battle.IsPlayerTurn) return;
            _enemyTimer += Time.deltaTime;
            if (_enemyTimer < enemyDelay) return;
            _enemyTimer = 0f;
            _battle.ActAuto();
        }

        private void OnGUI()
        {
            if (_battle == null) return;
            GUILayout.BeginArea(new Rect(10, 10, Screen.width - 20, Screen.height - 20));
            GUILayout.Label($"Ronda {_battle.Round}   Turno: {_battle.CurrentActor?.Name ?? "-"}");

            GUILayout.BeginHorizontal();
            DrawTeam("Héroes", _battle.Heroes, false);
            DrawTeam("Rivales", _battle.Enemies, _battle.IsPlayerTurn && _selectedAbility != null);
            GUILayout.EndHorizontal();

            if (_battle.Outcome != BattleOutcome.InProgress)
            {
                GUILayout.Label(_battle.Outcome == BattleOutcome.HeroesWin ? "¡Victoria!" : "Derrota");
                if (GUILayout.Button("Nuevo combate", GUILayout.Width(200))) NewBattle();
            }
            else if (_battle.IsPlayerTurn)
            {
                DrawAbilities(_battle.CurrentActor);
            }

            _logScroll = GUILayout.BeginScrollView(_logScroll, GUILayout.Height(200));
            foreach (var e in Enumerable.Reverse(_battle.Log)) GUILayout.Label($"R{e.Round}: {e.Message}");
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        private void DrawTeam(string title, IReadOnlyList<Combatant> team, bool targetable)
        {
            GUILayout.BeginVertical("box", GUILayout.Width(320));
            GUILayout.Label(title);
            foreach (var c in team)
            {
                var label = $"{c.Name} [{c.ClassId}]  HP {c.Health}/{c.Stats.health}  ST {c.Stamina}";
                if (targetable && c.IsAlive)
                {
                    if (GUILayout.Button(label)) PlayerAct(c);
                }
                else
                {
                    GUI.enabled = c.IsAlive;
                    GUILayout.Label(label);
                    GUI.enabled = true;
                }
            }
            GUILayout.EndVertical();
        }

        private void DrawAbilities(Combatant actor)
        {
            GUILayout.Label($"Elige habilidad para {actor.Name}:");
            GUILayout.BeginHorizontal();
            foreach (var a in actor.Abilities)
            {
                GUI.enabled = actor.CanUse(a);
                if (GUILayout.Toggle(_selectedAbility == a, AbilityLabel(actor, a), "button") && _selectedAbility != a)
                {
                    _selectedAbility = a;
                    // Solo single_enemy necesita que el jugador elija objetivo.
                    if (a.target != "single_enemy") PlayerAct(null);
                }
                GUI.enabled = true;
            }
            if (GUILayout.Button("Pasar")) { _battle.Pass(); _selectedAbility = null; _enemyTimer = 0f; }
            GUILayout.EndHorizontal();
            if (_selectedAbility != null) GUILayout.Label("Ahora elige un rival.");
        }

        private static string AbilityLabel(Combatant actor, AbilityData a)
        {
            var dmg = a.DealsDamage ? $"{a.damage.min}-{a.damage.max}{(a.hits > 1 ? $" ×{a.hits}" : "")}" : a.type;
            var cd = actor.CooldownOf(a) > 0 ? $", bloqueada {actor.CooldownOf(a)} turnos" : "";
            return $"{a.name} ({dmg}, {a.staminaCost} ST, {a.target}{cd})";
        }

        private void PlayerAct(Combatant target)
        {
            _battle.Act(_selectedAbility, target);
            _selectedAbility = null;
            _enemyTimer = 0f;
        }
    }
}
