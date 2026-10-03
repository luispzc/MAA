using System;
using System.Collections.Generic;
using System.Linq;
using MAA.Core.Combat;
using MAA.Core.Data;
using UnityEngine;
using CombatEvent = MAA.Core.Combat.EventType;
using EventType = UnityEngine.EventType;

namespace MAA.Runtime
{
    /// <summary>
    /// Pantalla de combate 3 contra 3, con la misma disposición que la versión web
    /// (src/scenes/BattleScene.ts): escenario con los sprites arriba, barra de
    /// habilidades y paneles de equipo abajo. Se dibuja con IMGUI sobre un lienzo
    /// virtual de 960x640 que se escala a la ventana, así que no necesita escena,
    /// prefabs ni assets importados: se crea sola al darle Play.
    /// La lógica vive en MAA.Core; aquí solo se dibuja y se recibe la entrada.
    /// </summary>
    public sealed class BattleView : MonoBehaviour
    {
        /// <summary>Equipos del prototipo (los mismos que la web). Más adelante saldrán de la selección.</summary>
        public string[] playerTeam = { "iron_man", "captain_america", "thor" };
        public string[] enemyTeam = { "hulk", "wolverine", "black_widow" };
        [Tooltip("Semilla del combate. 0 = aleatoria. Con la misma semilla y las mismas acciones sale lo mismo que en la web.")]
        public int seed;

        private const float W = 960, H = 640;
        private const float StageH = 540, BarY = 505, Icon = 48, PanelY = 544, RowH = 32, PlateW = 124;
        private const float EnemyDelay = 0.8f, AfterActionDelay = 0.75f;
        private static readonly Vector2[] PlayerSpots = { new Vector2(205, 305), new Vector2(330, 372), new Vector2(150, 440) };

        private enum Mode { Busy, ChooseAbility, ChooseTarget, Over }

        private sealed class Floater
        {
            public string Uid, Text;
            public Color Color;
            public int Size;
            public float Start;
        }

        private static BattleView _instance;

        private GameData _data;
        private Battle _battle;
        private Mode _mode = Mode.Busy;
        private AbilityData _pending;
        private string _hovered;
        private AbilityData _hoveredAbility;
        private float _hoveredAbilityX;
        private readonly List<string> _logLines = new List<string>();
        private readonly List<Floater> _floaters = new List<Floater>();
        private readonly Dictionary<string, float> _shakeAt = new Dictionary<string, float>();
        private string _lungeUid;
        private float _lungeAt = -10, _lungeDir;
        private float _scheduledAt = -1;
        private Action _scheduled;
        private string _hint = "";
        private Color _hintColor = Color.white;

        private GUIStyle _label, _center, _tooltip;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Bootstrap()
        {
            if (_instance == null) new GameObject("MAA Battle").AddComponent<BattleView>();
        }

        private void Awake()
        {
            if (_instance != null && _instance != this) { Destroy(gameObject); return; }
            _instance = this;
        }

        private void OnDestroy()
        {
            if (_instance == this) _instance = null;
        }

        private void Start()
        {
            // Sin cámara Unity avisa "No cameras rendering"; con cámara, que no se vea el cielo por detrás.
            var cam = Camera.main;
            if (cam == null) cam = new GameObject("Main Camera") { tag = "MainCamera" }.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Color.black;

            _data = GameDataLoader.LoadAll();
            NewBattle();
        }

        private void NewBattle()
        {
            var heroes = _data.Heroes.heroes;
            if (heroes.Count == 0)
            {
                Debug.LogError("[MAA] heroes.json está vacío o no se pudo leer.");
                return;
            }
            List<HeroData> Pick(IEnumerable<string> ids) => ids.Select(_data.Hero).ToList();
            int s = seed != 0 ? seed : Environment.TickCount;
            _battle = new Battle(_data, Pick(playerTeam), Pick(enemyTeam), s);
            _logLines.Clear();
            _floaters.Clear();
            _shakeAt.Clear();
            _pending = null;
            _hovered = null;
            PushLog(_battle.Log);
            NextTurn();
        }

        // ---- Flujo de turnos --------------------------------------------------------

        private void Update()
        {
            if (_scheduled != null && Time.time >= _scheduledAt)
            {
                var step = _scheduled;
                _scheduled = null;
                step();
            }
        }

        private void Schedule(float delay, Action step)
        {
            _scheduledAt = Time.time + delay;
            _scheduled = step;
        }

        private void NextTurn()
        {
            var actor = _battle.CurrentActor;
            if (actor == null)
            {
                _mode = Mode.Over;
                _hint = "";
                return;
            }
            _pending = null;
            if (actor.Team == Team.Enemy)
            {
                _mode = Mode.Busy;
                _hint = "";
                Schedule(EnemyDelay, () => Execute(BattleAi.Choose(_battle)));
                return;
            }
            _mode = Mode.ChooseAbility;
            SetHint("ELIGE UNA HABILIDAD", Color.white);
        }

        private void SetHint(string text, Color color)
        {
            _hint = text;
            _hintColor = color;
        }

        private void OnAbilityChosen(AbilityData ability)
        {
            var actor = _battle.CurrentActor;
            if ((_mode != Mode.ChooseAbility && _mode != Mode.ChooseTarget) || actor == null) return;
            if (!Battle.CanUse(actor, ability)) return;
            if (_pending == ability)
            {
                CancelTarget();
                return;
            }
            if (ability.target == "single_enemy" || ability.target == "single_ally")
            {
                _pending = ability;
                _mode = Mode.ChooseTarget;
                SetHint(ability.target == "single_enemy" ? "SELECCIONA UN ENEMIGO" : "SELECCIONA UN ALIADO", BattleArt.Hex(0xff3b30));
                return;
            }
            Execute(new BattleAction { ActorUid = actor.Uid, AbilityId = ability.id });
        }

        private void CancelTarget()
        {
            if (_mode != Mode.ChooseTarget) return;
            _mode = Mode.ChooseAbility;
            _pending = null;
            SetHint("ELIGE UNA HABILIDAD", Color.white);
        }

        private void OnTargetClicked(string uid)
        {
            var actor = _battle.CurrentActor;
            if (_mode != Mode.ChooseTarget || actor == null || _pending == null) return;
            if (!TargetSet().Contains(uid)) return;
            Execute(new BattleAction { ActorUid = actor.Uid, AbilityId = _pending.id, TargetUid = uid });
        }

        private void Execute(BattleAction action)
        {
            _mode = Mode.Busy;
            _pending = null;
            _hovered = null;
            _hint = "";
            var events = _battle.Perform(action);
            PushLog(events);
            Animate(action, events);
            Schedule(AfterActionDelay, NextTurn);
        }

        private HashSet<string> TargetSet()
        {
            var actor = _battle.CurrentActor;
            if (_mode != Mode.ChooseTarget || actor == null || _pending == null) return new HashSet<string>();
            return new HashSet<string>(_battle.SelectableTargets(actor, _pending).Select(c => c.Uid));
        }

        private void PushLog(IEnumerable<BattleEvent> events)
        {
            foreach (var e in events)
            {
                var line = BattleText.Describe(_battle, e);
                if (line != null) _logLines.Add(line);
            }
        }

        /// <summary>Embestida del atacante, sacudida de los golpeados y números flotantes.</summary>
        private void Animate(BattleAction action, List<BattleEvent> events)
        {
            float now = Time.time;
            var used = events.FirstOrDefault(e => e.Type == CombatEvent.AbilityUsed);
            if (used != null)
            {
                var actor = _battle.Get(action.ActorUid);
                var foe = used.Targets.Select(_battle.Get).FirstOrDefault(t => t.Uid != action.ActorUid);
                if (foe != null && foe.Team != actor.Team)
                {
                    _lungeUid = actor.Uid;
                    _lungeAt = now;
                    _lungeDir = actor.Team == Team.Player ? 1 : -1;
                }
            }

            var perUnit = new Dictionary<string, int>();
            foreach (var e in events)
            {
                string text = null, uid = null;
                var color = Color.white;
                int size = 18;
                switch (e.Type)
                {
                    case CombatEvent.Damage:
                        uid = e.TargetUid;
                        text = $"-{e.Amount}{(e.Crit ? "!" : "")}";
                        color = e.Cause == "ability" ? BattleArt.Hex(e.Crit ? 0xffdd57 : 0xff5a4f) : BattleArt.Hex(0xd98cff);
                        size = 26;
                        break;
                    case CombatEvent.Heal when e.Amount > 0:
                        uid = e.TargetUid;
                        text = $"+{e.Amount}";
                        color = BattleArt.Hex(0x6bff9e);
                        break;
                    case CombatEvent.Miss:
                        uid = e.TargetUid;
                        text = "ESQUIVA";
                        color = BattleArt.Hex(0xc9d1e6);
                        break;
                    case CombatEvent.StatusApplied:
                        uid = e.TargetUid;
                        text = _battle.StatusName(e.StatusId) + (e.Stacks > 1 ? $" x{e.Stacks}" : "");
                        color = BattleArt.Hex(_battle.IsDebuff(e.StatusId) ? 0xff9a5a : 0x6bd0ff);
                        break;
                    case CombatEvent.Stamina when e.Amount > 0:
                        uid = e.TargetUid;
                        text = $"+{e.Amount} stamina";
                        color = BattleArt.Hex(0x6bb8ff);
                        break;
                }
                if (text == null) continue;
                perUnit.TryGetValue(uid, out int n);
                perUnit[uid] = n + 1;
                if (e.Type == CombatEvent.Damage) _shakeAt[uid] = now + 0.12f + n * 0.14f;
                _floaters.Add(new Floater { Uid = uid, Text = text, Color = color, Size = size, Start = now + 0.12f + n * 0.16f });
            }
        }

        // ---- Geometría ----------------------------------------------------------------

        private static Vector2 Spot(Combatant c)
        {
            var s = PlayerSpots[c.Slot];
            return c.Team == Team.Player ? s : new Vector2(W - s.x, s.y);
        }

        private static Texture2D Figure(Combatant c) => GameDataLoader.LoadTexture(c.Art?.figure);

        private static float FigureHeight(Combatant c)
        {
            var tex = Figure(c);
            return tex != null ? tex.height * BattleArt.FigureScale : BattleArt.MarkerHeight * (c.ClassId == "bruiser" ? 1.15f : 1f);
        }

        private static float FigureWidth(Combatant c)
        {
            var tex = Figure(c);
            return tex != null ? tex.width * BattleArt.FigureScale : 90;
        }

        /// <summary>Zona clicable de la figura (pies en el punto del escenario).</summary>
        private static Rect UnitHitRect(Combatant c)
        {
            var p = Spot(c);
            float h = FigureHeight(c);
            float w = Mathf.Max(80, Mathf.Min(140, FigureWidth(c) * 0.8f));
            return new Rect(p.x - w / 2, p.y - h, w, h);
        }

        private static Rect PanelRect(Team team) =>
            team == Team.Player ? new Rect(6, PanelY, W / 2 - 9, RowH * 3 + 6) : new Rect(W / 2 + 3, PanelY, W / 2 - 9, RowH * 3 + 6);

        private Rect RowRect(Combatant c)
        {
            var panel = PanelRect(c.Team);
            return new Rect(panel.x + 3, PanelY + 3 + c.Slot * RowH, panel.width - 6, RowH - 2);
        }

        private List<AbilityData> BarAbilities()
        {
            var actor = _battle.CurrentActor;
            bool mine = actor != null && actor.Team == Team.Player && (_mode == Mode.ChooseAbility || _mode == Mode.ChooseTarget);
            return mine ? actor.Abilities : new List<AbilityData>();
        }

        /// <summary>Centro X de cada casilla de la barra (habilidades + 3 de objetos, como la web).</summary>
        private static float SlotX(int i, int slots)
        {
            const int itemSlots = 3;
            const float step = Icon + 8;
            float startX = W / 2 - (slots - 1) * step / 2;
            return startX + i * step + (i >= slots - itemSlots ? 14 : 0);
        }

        // ---- Entrada y dibujo ---------------------------------------------------------

        private void OnGUI()
        {
            if (_battle == null) return;
            EnsureStyles();

            float scale = Mathf.Min(Screen.width / W, Screen.height / H);
            var offset = new Vector2((Screen.width - W * scale) / 2, (Screen.height - H * scale) / 2);
            GUI.matrix = Matrix4x4.TRS(offset, Quaternion.identity, new Vector3(scale, scale, 1));

            var e = Event.current;
            UpdateHover(e.mousePosition);
            HandleInput(e);

            DrawStage();
            DrawUnits();
            DrawPlate();
            DrawTurnStrip();
            DrawCaption();
            DrawAbilityBar();
            DrawPanels();
            DrawFloaters();
            if (_mode == Mode.Over) DrawEnd(e);
            DrawTooltip();
        }

        private void EnsureStyles()
        {
            if (_label != null) return;
            _label = new GUIStyle(GUI.skin.label) { alignment = TextAnchor.MiddleLeft, wordWrap = false, clipping = TextClipping.Overflow, padding = new RectOffset() };
            _center = new GUIStyle(_label) { alignment = TextAnchor.MiddleCenter };
            _tooltip = new GUIStyle(_label) { alignment = TextAnchor.UpperLeft, wordWrap = true, fontSize = 12 };
        }

        private GUIStyle Style(GUIStyle baseStyle, int size, FontStyle font = FontStyle.Normal)
        {
            baseStyle.fontSize = size;
            baseStyle.fontStyle = font;
            return baseStyle;
        }

        private void UpdateHover(Vector2 mouse)
        {
            _hovered = null;
            if (_mode == Mode.ChooseTarget)
            {
                var targets = TargetSet();
                foreach (var c in _battle.Combatants)
                {
                    if (!targets.Contains(c.Uid)) continue;
                    if (UnitHitRect(c).Contains(mouse) || RowRect(c).Contains(mouse)) _hovered = c.Uid;
                }
            }

            _hoveredAbility = null;
            var abilities = BarAbilities();
            int slots = Mathf.Max(abilities.Count, 3) + 3;
            for (int i = 0; i < abilities.Count; i++)
            {
                float x = SlotX(i, slots);
                if (new Rect(x - Icon / 2 - 2, BarY - Icon / 2 - 2, Icon + 4, Icon + 4).Contains(mouse))
                {
                    _hoveredAbility = abilities[i];
                    _hoveredAbilityX = x;
                }
            }
        }

        private void HandleInput(Event e)
        {
            if (e.type == EventType.KeyDown && e.keyCode == KeyCode.Escape)
            {
                CancelTarget();
                e.Use();
            }
            if (e.type != EventType.MouseDown) return;
            if (e.button == 1)
            {
                CancelTarget();
                e.Use();
                return;
            }
            if (e.button != 0) return;
            if (_hoveredAbility != null)
            {
                OnAbilityChosen(_hoveredAbility);
                e.Use();
            }
            else if (_hovered != null)
            {
                OnTargetClicked(_hovered);
                e.Use();
            }
        }

        private void DrawStage()
        {
            float horizon = StageH * 0.46f;
            BattleArt.VerticalGradient(new Rect(0, 0, W, horizon), BattleArt.Hex(0x2b2e3f), BattleArt.Hex(0x3d3a45));
            for (int i = 0; i < 8; i++)
            {
                var r = new Rect(20 + i * 125, 40, 90, horizon - 70);
                BattleArt.Rect(r, BattleArt.Hex(0x34374a));
                BattleArt.Border(r, BattleArt.Hex(0x23252f), 2);
            }
            foreach (var x in new[] { 0f, 240f, 700f, 930f })
            {
                BattleArt.Rect(new Rect(x, 0, 30, horizon), BattleArt.Hex(0x1f2029));
                BattleArt.Rect(new Rect(x + 4, 0, 6, horizon), BattleArt.Hex(0x4a4656));
            }
            BattleArt.Rect(new Rect(300, 70, 70, 90), BattleArt.Hex(0x5a4630));
            BattleArt.Rect(new Rect(306, 76, 58, 78), BattleArt.Hex(0x6f7f94));
            BattleArt.Rect(new Rect(600, 70, 70, 90), BattleArt.Hex(0x5a4630));
            BattleArt.Rect(new Rect(606, 76, 58, 78), BattleArt.Hex(0x8a6f5a));
            BattleArt.Rect(new Rect(0, horizon - 14, W, 14), BattleArt.Hex(0x1a1b22));
            BattleArt.VerticalGradient(new Rect(0, horizon, W, StageH - horizon), BattleArt.Hex(0x5b3d28), BattleArt.Hex(0x2f1f15));
            for (int i = 1; i < 7; i++)
            {
                float y = horizon + (StageH - horizon) * Mathf.Pow(i / 7f, 1.6f);
                BattleArt.Rect(new Rect(0, y, W, 1), BattleArt.Hex(0x2a1b12, 0.6f));
            }
            // Emblema en el centro del suelo.
            float cy = horizon + (StageH - horizon) * 0.55f;
            BattleArt.Ellipse(new Vector2(W / 2, cy), 240, 90, BattleArt.Hex(0xc99a2e, 0.35f), ring: true);
            BattleArt.Ellipse(new Vector2(W / 2, cy), 90, 34, BattleArt.Hex(0xc99a2e, 0.3f));
            BattleArt.Rect(new Rect(0, 0, W, 30), new Color(0, 0, 0, 0.25f));
        }

        private void DrawUnits()
        {
            var actor = _battle.CurrentActor;
            var targets = TargetSet();
            float now = Time.time;
            // Los de atrás (más arriba) se dibujan antes que los de delante.
            foreach (var c in _battle.Combatants.OrderBy(x => Spot(x).y))
            {
                var p = Spot(c);
                bool isActor = actor == c && _mode != Mode.Over;
                bool isTarget = targets.Contains(c.Uid);
                bool hot = isTarget && _hovered == c.Uid;

                float lunge = 0;
                if (_lungeUid == c.Uid && now - _lungeAt < 0.24f) lunge = _lungeDir * 45 * Mathf.Sin(Mathf.PI * (now - _lungeAt) / 0.24f);
                float shake = 0;
                if (_shakeAt.TryGetValue(c.Uid, out var at) && now >= at && now - at < 0.18f) shake = -6 * Mathf.Cos((now - at) / 0.06f * Mathf.PI) * (1 - (now - at) / 0.18f);
                float period = 0.9f + c.Slot * 0.13f;
                float bob = c.IsAlive ? -3 * (0.5f - 0.5f * Mathf.Cos(now * Mathf.PI / period)) : 0;
                float x = p.x + lunge;

                if (isActor || isTarget)
                {
                    float rw = Mathf.Max(96, Mathf.Max(80, Mathf.Min(140, FigureWidth(c) * 0.8f)));
                    var tint = isTarget ? BattleArt.Hex(0xff3b30) : Color.white;
                    BattleArt.Ellipse(new Vector2(x, p.y), rw, 26, new Color(tint.r, tint.g, tint.b, hot ? 0.25f : 0.08f));
                    BattleArt.Ellipse(new Vector2(x, p.y), rw + 6, 32, new Color(tint.r, tint.g, tint.b, hot ? 1f : 0.85f), ring: true);
                }

                float alpha = c.IsAlive ? 1 : 0.25f;
                var tex = Figure(c);
                if (tex != null)
                {
                    float w = tex.width * BattleArt.FigureScale, h = tex.height * BattleArt.FigureScale;
                    BattleArt.Ellipse(new Vector2(x, p.y - 2), w * 0.7f, 18, new Color(0, 0, 0, 0.35f * alpha));
                    var r = new Rect(x + shake - w / 2, p.y - h + bob, w, h);
                    // Las figuras miran a la derecha: los enemigos se dibujan en espejo.
                    var uv = c.Team == Team.Enemy ? new Rect(1, 0, -1, 1) : new Rect(0, 0, 1, 1);
                    BattleArt.Texture(r, tex, uv, new Color(1, 1, 1, alpha));
                }
                else
                {
                    DrawMarker(c, new Vector2(x + shake, p.y + bob), alpha);
                }
            }
        }

        /// <summary>Silueta con el color de la clase para héroes sin arte.</summary>
        private void DrawMarker(Combatant c, Vector2 feet, float alpha)
        {
            float h = FigureHeight(c), w = 56;
            var color = BattleArt.ClassColor(c.ClassId);
            color.a = alpha;
            BattleArt.Ellipse(new Vector2(feet.x, feet.y - 2), 70, 16, new Color(0, 0, 0, 0.35f * alpha));
            BattleArt.Rect(new Rect(feet.x - 18, feet.y - h * 0.4f, 36, h * 0.4f), BattleArt.Shade(color, 0.5f), 5);
            BattleArt.Rect(new Rect(feet.x - w / 2, feet.y - h * 0.8f, w, h * 0.45f), color, 12);
            BattleArt.Ellipse(new Vector2(feet.x, feet.y - h * 0.88f), 36, 36, BattleArt.Shade(color, 0.75f));
            BattleArt.Text(new Rect(feet.x - w / 2, feet.y - h * 0.7f, w, 24), BattleArt.Initials(c.Name), Style(_center, 16, FontStyle.Bold), new Color(1, 1, 1, alpha), 1);
        }

        /// <summary>Placa sobre la cabeza: nombre, vida, stamina y efectos del activo o del objetivo señalado.</summary>
        private void DrawPlate()
        {
            if (_mode == Mode.Over) return;
            var c = _hovered != null && TargetSet().Contains(_hovered) ? _battle.Get(_hovered) : _battle.CurrentActor;
            if (c == null) return;
            var p = Spot(c);
            float top = Mathf.Max(84, p.y - FigureHeight(c) - 40);
            float left = p.x - PlateW / 2 + 12;

            BattleArt.Ellipse(new Vector2(left - 4, top + 14), 30, 30, Color.white);
            BattleArt.Ellipse(new Vector2(left - 4, top + 14), 26, 26, BattleArt.ClassColor(c.ClassId));
            BattleArt.Text(new Rect(left + 14, top - 2, 200, 16), c.Name.ToUpperInvariant(), Style(_label, 12, FontStyle.BoldAndItalic), Color.white, 1.5f);
            BattleArt.Bar(new Rect(left + 12, top + 16, PlateW - 12, 7), (float)c.Hp / c.Stats.health, BattleArt.Hex(0xd9302b), BattleArt.Hex(0x3a0d0d), Color.black);
            BattleArt.Bar(new Rect(left + 12, top + 24, PlateW - 12, 5), (float)c.Stamina / c.Stats.stamina, BattleArt.Hex(0xf2a93b), BattleArt.Hex(0x0d1f3a), Color.black);
            for (int i = 0; i < c.Statuses.Count; i++)
            {
                var s = c.Statuses[i];
                var r = new Rect(left + 12 + i * 20, top + 33, 18, 16);
                BattleArt.Rect(r, BattleArt.Hex(_battle.IsDebuff(s.Id) ? 0x8f1d1d : 0x1d7a3a));
                BattleArt.Border(r, new Color(1, 1, 1, 0.8f));
                var name = _battle.StatusName(s.Id);
                BattleArt.Text(r, name.Substring(0, 1).ToUpperInvariant(), Style(_center, 11, FontStyle.Bold), Color.white);
            }
        }

        /// <summary>Tira de retratos con el orden de los próximos turnos.</summary>
        private void DrawTurnStrip()
        {
            if (_mode == Mode.Over || _battle.TurnOrder.Count == 0) return;
            var order = _battle.TurnOrder;
            var upcoming = new List<Combatant>();
            for (int i = _battle.TurnIndex; upcoming.Count < 7 && i < _battle.TurnIndex + order.Count * 2; i++)
            {
                var c = _battle.Get(order[i % order.Count]);
                if (c.IsAlive) upcoming.Add(c);
            }
            if (upcoming.Count == 0) return;
            const float big = 52, small = 34, gap = 4;
            float totalW = big + (upcoming.Count - 1) * (small + gap) + gap;
            float left = W / 2 - totalW / 2;
            var bg = new Rect(left - 10, 0, totalW + 20, big + 18);
            BattleArt.Rect(bg, BattleArt.Hex(0x05070d, 0.85f));
            BattleArt.Border(bg, BattleArt.Hex(0x3a4468));
            for (int i = 0; i < upcoming.Count; i++)
            {
                var c = upcoming[i];
                float size = i == 0 ? big : small;
                float cx = i == 0 ? left + big / 2 : left + big + gap + (i - 1) * (small + gap) + small / 2 + gap;
                float cy = i == 0 ? 6 + big / 2 : 8 + small / 2;
                var r = new Rect(cx - size / 2, cy - size / 2, size, size);
                DrawPortrait(c, r);
                var frame = i == 0 ? BattleArt.Hex(0xf2c14e) : BattleArt.Hex(c.Team == Team.Player ? 0x3d8bfd : 0xd9302b);
                BattleArt.Border(r, frame, i == 0 ? 3 : 2);
            }
        }

        /// <summary>Retrato recortado de la figura con art.portraitCrop (o iniciales si no hay arte).</summary>
        private void DrawPortrait(Combatant c, Rect r)
        {
            var color = BattleArt.ClassColor(c.ClassId);
            BattleArt.VerticalGradient(r, BattleArt.Shade(color, 0.6f), BattleArt.Shade(color, 0.2f));
            var tex = Figure(c);
            var crop = c.Art?.portraitCrop;
            if (tex != null && crop != null && crop.size > 0)
            {
                // El recorte viene en píxeles con origen arriba; las uv de Unity empiezan abajo.
                var uv = new Rect((float)crop.x / tex.width, 1 - (float)(crop.y + crop.size) / tex.height,
                    (float)crop.size / tex.width, (float)crop.size / tex.height);
                BattleArt.Texture(r, tex, uv, Color.white);
            }
            else
            {
                BattleArt.Text(r, BattleArt.Initials(c.Name), Style(_center, Mathf.RoundToInt(r.height * 0.4f), FontStyle.Bold), Color.white, 1);
            }
        }

        private void DrawCaption()
        {
            // En pantalla solo se ve lo último que pasó; el registro completo va a la consola.
            var text = string.Join("\n", _logLines.Skip(Math.Max(0, _logLines.Count - 2)));
            BattleArt.Text(new Rect(0, 78, W, 40), text, Style(new GUIStyle(_center) { alignment = TextAnchor.UpperCenter }, 14), Color.white, 1.5f);
        }

        private void DrawAbilityBar()
        {
            BattleArt.Rect(new Rect(0, BarY - Icon / 2 - 8, W, Icon + 16), BattleArt.Hex(0x05070d, 0.75f));
            BattleArt.Text(new Rect(0, BarY - Icon / 2 - 40, W, 28), _hint, Style(_center, 22, FontStyle.BoldAndItalic), _hintColor, 2.5f);

            var actor = _battle.CurrentActor;
            var abilities = BarAbilities();
            int slots = Mathf.Max(abilities.Count, 3) + 3;
            for (int i = 0; i < slots; i++)
            {
                float x = SlotX(i, slots);
                var frame = new Rect(x - Icon / 2 - 2, BarY - Icon / 2 - 2, Icon + 4, Icon + 4);
                BattleArt.Rect(frame, BattleArt.Hex(0x1a2135));
                if (i >= abilities.Count)
                {
                    BattleArt.Border(frame, BattleArt.Hex(0x3a4468), 2);
                    if (i >= slots - 3) BattleArt.Text(frame, "+", Style(_center, 20), BattleArt.Hex(0x3a4468));
                    continue;
                }
                var ability = abilities[i];
                bool usable = Battle.CanUse(actor, ability);
                bool selected = _pending == ability;
                var icon = new Rect(x - Icon / 2, BarY - Icon / 2, Icon, Icon);
                var color = BattleArt.AbilityColors.TryGetValue(ability.type ?? "", out var tc) ? tc : BattleArt.Hex(0x7d8597);
                float a = usable ? 1 : 0.35f;
                var top = BattleArt.Shade(color, 0.7f); top.a = a;
                var bottom = BattleArt.Shade(color, 0.25f); bottom.a = a;
                BattleArt.VerticalGradient(icon, top, bottom);
                BattleArt.Text(icon, BattleArt.Initials(ability.name), Style(_center, 16, FontStyle.Bold), new Color(1, 1, 1, 0.92f * a), 1);
                BattleArt.Border(frame, selected ? BattleArt.Hex(0xff3b30) : usable ? BattleArt.Hex(0x8fa3d6) : BattleArt.Hex(0x3a4468), selected ? 4 : 2);

                int cd = actor.CooldownOf(ability);
                if (cd > 0)
                {
                    BattleArt.Text(icon, cd.ToString(), Style(_center, 22, FontStyle.Bold), Color.white, 2);
                }
                else if (ability.staminaCostPercent > 0)
                {
                    var cost = Battle.StaminaCost(actor, ability).ToString();
                    var style = Style(new GUIStyle(_label) { alignment = TextAnchor.MiddleRight }, 10);
                    float tw = style.CalcSize(new GUIContent(cost)).x + 4;
                    var badge = new Rect(icon.xMax - 2 - tw, icon.yMax - 2 - 12, tw, 12);
                    BattleArt.Rect(badge, BattleArt.Hex(0x1d4f8f));
                    BattleArt.Text(new Rect(badge.x, badge.y, badge.width - 2, badge.height), cost, style, Color.white);
                }
            }
        }

        private void DrawTooltip()
        {
            var actor = _battle.CurrentActor;
            var ability = _hoveredAbility;
            if (ability == null || actor == null) return;
            int cd = actor.CooldownOf(ability);
            int cost = Battle.StaminaCost(actor, ability);
            var stats = new List<string> { cost > 0 ? $"{cost} stamina ({ability.staminaCostPercent}%)" : "Sin coste" };
            if (ability.HasDamage)
            {
                stats.Add($"Daño {ability.damage.min}-{ability.damage.max}{(ability.damageEstimated ? "*" : "")}{(ability.hits > 1 ? $" en {ability.hits} golpes" : "")}");
                stats.Add($"Acierto {ability.accuracy}% · Crítico {ability.critChance}%");
            }
            if (ability.cooldown > 0) stats.Add($"Cooldown {ability.cooldown} ronda{(ability.cooldown > 1 ? "s" : "")}");
            if (cd > 0) stats.Add($"Lista en {cd} turno{(cd > 1 ? "s" : "")}");

            var who = new Dictionary<string, string> { ["target"] = "Objetivo", ["self"] = "Propio", ["all_allies"] = "Equipo" };
            var lines = new List<string> { string.Join(" · ", stats) };
            if (ability.properties.Count > 0) lines.Add(string.Join(" · ", ability.properties.Select(BattleText.PropertyName)));
            foreach (var e in ability.effects)
            {
                string chance = e.chance < 1 ? $" ({Battle.JsRound(e.chance * 100)}%)" : "";
                string stacks = e.stacks > 1 ? $" x{e.stacks}" : "";
                string turns = e.duration > 0 ? $", {e.duration} t" : "";
                lines.Add($"{(who.TryGetValue(e.target ?? "", out var w) ? w : e.target)}: {_battle.StatusName(e.id)}{stacks}{turns}{chance}");
            }
            if (!string.IsNullOrEmpty(ability.description)) lines.Add(ability.description);
            if (ability.damageEstimated) lines.Add("* Daño estimado: la ficha original no lo trae.");

            const float width = 290;
            var body = string.Join("\n", lines);
            float textH = _tooltip.CalcHeight(new GUIContent(body), width - 20);
            float h = textH + 38;
            float x = Mathf.Clamp(_hoveredAbilityX - width / 2, 6, W - width - 6);
            float y = BarY - Icon / 2 - 44 - h;
            var r = new Rect(x, y, width, h);
            BattleArt.Rect(r, BattleArt.Hex(0x0b1020, 0.95f));
            BattleArt.Border(r, BattleArt.Hex(0x8fa3d6));
            BattleArt.Text(new Rect(x + 10, y + 6, width - 20, 18), ability.name, Style(_label, 14, FontStyle.Bold), Color.white);
            BattleArt.Text(new Rect(x + 10, y + 28, width - 20, textH), body, _tooltip, BattleArt.Hex(0xdfe6f7));
        }

        private void DrawPanels()
        {
            var actor = _battle.CurrentActor;
            var targets = TargetSet();
            BattleArt.Rect(new Rect(0, StageH, W, H - StageH), BattleArt.Hex(0x070a12));
            foreach (var team in new[] { Team.Player, Team.Enemy })
            {
                var panel = PanelRect(team);
                BattleArt.Rect(panel, BattleArt.Hex(0x0f1424));
                BattleArt.Border(panel, BattleArt.Hex(0x26304d));
            }

            var label = Style(new GUIStyle(_label), 9, FontStyle.Bold);
            var num = Style(new GUIStyle(_label), 10);
            foreach (var c in _battle.Combatants)
            {
                var row = RowRect(c);
                var panel = PanelRect(c.Team);
                bool isActor = actor == c && _mode != Mode.Over;
                bool isTarget = targets.Contains(c.Uid);
                bool hot = isTarget && _hovered == c.Uid;
                BattleArt.Rect(row, BattleArt.Hex(isActor ? 0x1d4f8f : hot ? 0x5a1a1a : isTarget ? 0x3a1616 : 0x141b30));

                float barX = panel.x + 58, barW = 118;
                bool twoBars = c.Team == Team.Player;
                float hpY = twoBars ? row.y + 5 : row.y + 11;
                BattleArt.Text(new Rect(panel.x + 10, hpY - 1, 48, 10), "SALUD", label, BattleArt.Hex(0x8f9bbd));
                BattleArt.Bar(new Rect(barX, hpY, barW, 8), (float)c.Hp / c.Stats.health, BattleArt.Hex(0xd9302b), BattleArt.Hex(0x3a0d0d));
                BattleArt.Text(new Rect(barX + barW + 6, hpY - 2, 50, 12), c.Hp.ToString(), num, Color.white);
                if (twoBars)
                {
                    float sy = row.y + 17;
                    BattleArt.Text(new Rect(panel.x + 10, sy - 1, 48, 10), "STAMINA", label, BattleArt.Hex(0x8f9bbd));
                    BattleArt.Bar(new Rect(barX, sy, barW, 8), (float)c.Stamina / c.Stats.stamina, BattleArt.Hex(0x2f7de0), BattleArt.Hex(0x0d1f3a));
                    BattleArt.Text(new Rect(barX + barW + 6, sy - 2, 50, 12), c.Stamina.ToString(), num, Color.white);
                }

                float midY = row.y + RowH / 2 - 1;
                BattleArt.Text(new Rect(panel.x + 222, midY - 9, 140, 18), c.Name.ToUpperInvariant(), Style(new GUIStyle(_label), 13, FontStyle.Bold),
                    c.IsAlive ? Color.white : BattleArt.Hex(0x5c6580));

                var statusText = string.Join("  ", c.Statuses.Select(s => $"{_battle.StatusName(s.Id)}{(s.Stacks > 1 ? $" x{s.Stacks}" : "")} {s.TurnsLeft}"));
                BattleArt.Text(new Rect(panel.xMax - 44 - 200, midY - 8, 200, 16), statusText,
                    Style(new GUIStyle(_label) { alignment = TextAnchor.MiddleRight }, 10), BattleArt.Hex(0xf2c14e));

                var chip = new Rect(panel.xMax - 22 - 13, midY - 10, 26, 20);
                BattleArt.Rect(chip, BattleArt.ClassColor(c.ClassId));
                BattleArt.Border(chip, new Color(0, 0, 0, 0.6f));
                var cls = _data.Classes.classes.FirstOrDefault(k => k.id == c.ClassId);
                var abbr = (cls?.name ?? c.ClassId ?? "?");
                BattleArt.Text(chip, abbr.Substring(0, Math.Min(2, abbr.Length)).ToUpperInvariant(), Style(_center, 11, FontStyle.Bold), Color.white);
            }
        }

        private void DrawFloaters()
        {
            float now = Time.time;
            _floaters.RemoveAll(f => now - f.Start > 1f);
            foreach (var f in _floaters)
            {
                float t = now - f.Start;
                if (t < 0) continue;
                var c = _battle.Get(f.Uid);
                var p = Spot(c);
                float y = p.y - FigureHeight(c) + 20 - 45 * t;
                var color = f.Color;
                color.a = 1 - t;
                BattleArt.Text(new Rect(p.x - 150, y - 16, 300, 32), f.Text, Style(_center, f.Size, FontStyle.Bold), color, 2.5f);
            }
        }

        private void DrawEnd(Event e)
        {
            bool won = _battle.Winner == Team.Player;
            BattleArt.Rect(new Rect(0, 0, W, StageH), new Color(0, 0, 0, 0.55f));
            BattleArt.Text(new Rect(0, 180, W, 60), won ? "¡VICTORIA!" : "DERROTA", Style(_center, 52, FontStyle.BoldAndItalic),
                BattleArt.Hex(won ? 0x6bff9e : 0xff5a4f), 4);
            BattleArt.Text(new Rect(0, 250, W, 24), $"La batalla duró {_battle.Round} rondas", Style(_center, 16), BattleArt.Hex(0xdfe6f7));
            var button = new Rect(W / 2 - 80, 298, 160, 44);
            bool over = button.Contains(e.mousePosition);
            BattleArt.Rect(button, BattleArt.Hex(over ? 0x4a93ef : 0x2f7de0));
            BattleArt.Text(button, "Jugar de nuevo", Style(_center, 18), Color.white);
            if (e.type == EventType.MouseDown && e.button == 0 && over)
            {
                e.Use();
                NewBattle();
            }
        }
    }
}
