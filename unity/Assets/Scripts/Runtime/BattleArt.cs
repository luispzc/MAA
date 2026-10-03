using System.Collections.Generic;
using UnityEngine;

namespace MAA.Runtime
{
    /// <summary>
    /// Primitivas de dibujo IMGUI para la pantalla de combate: rectángulos, degradados,
    /// elipses y texto con borde. Las texturas se generan en código, así que no hace
    /// falta ningún asset importado en Unity.
    /// </summary>
    public static class BattleArt
    {
        /// <summary>Escala común de las figuras (igual que FIGURE_SCALE en la web).</summary>
        public const float FigureScale = 0.72f;
        /// <summary>Alto del marcador cuando un héroe no tiene arte.</summary>
        public const float MarkerHeight = 160f;

        public static readonly Dictionary<string, Color> ClassColors = new Dictionary<string, Color>
        {
            ["blaster"] = Hex(0xd9822b),
            ["bruiser"] = Hex(0x3fa34d),
            ["scrapper"] = Hex(0xb83b5e),
            ["infiltrator"] = Hex(0x6c4ab6),
            ["tactician"] = Hex(0x2f6fbf),
            ["generalist"] = Hex(0x7d8597),
        };

        public static readonly Dictionary<string, Color> AbilityColors = new Dictionary<string, Color>
        {
            ["melee"] = Hex(0xd9483b),
            ["ranged"] = Hex(0xe08a2e),
            ["buff"] = Hex(0x3d8bfd),
            ["debuff"] = Hex(0x8e5bd9),
            ["heal"] = Hex(0x3fbf6a),
        };

        public static Color ClassColor(string classId) =>
            classId != null && ClassColors.TryGetValue(classId, out var c) ? c : Hex(0x7d8597);

        public static Color Hex(int rgb, float alpha = 1f) =>
            new Color(((rgb >> 16) & 0xff) / 255f, ((rgb >> 8) & 0xff) / 255f, (rgb & 0xff) / 255f, alpha);

        public static Color Shade(Color c, float factor) =>
            new Color(Mathf.Clamp01(c.r * factor), Mathf.Clamp01(c.g * factor), Mathf.Clamp01(c.b * factor), c.a);

        // ---- Texturas generadas ------------------------------------------------------

        private static Texture2D _ellipse;
        private static Texture2D _ring;
        private static readonly Dictionary<string, Texture2D> Gradients = new Dictionary<string, Texture2D>();

        /// <summary>Elipse rellena con borde suave (para sombras y anillos rellenos).</summary>
        private static Texture2D EllipseTexture => _ellipse ? _ellipse : _ellipse = MakeEllipse(false);

        /// <summary>Contorno de elipse (para el anillo de selección).</summary>
        private static Texture2D RingTexture => _ring ? _ring : _ring = MakeEllipse(true);

        private static Texture2D MakeEllipse(bool ring)
        {
            const int w = 128, h = 128;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color[w * h];
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float dx = (x + 0.5f) / w * 2 - 1, dy = (y + 0.5f) / h * 2 - 1;
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    float a = ring
                        ? Mathf.Clamp01(1 - Mathf.Abs(d - 0.9f) / 0.08f)
                        : Mathf.Clamp01((1 - d) / 0.06f);
                    px[y * w + x] = new Color(1, 1, 1, a);
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            return tex;
        }

        /// <summary>Degradado vertical de dos colores (textura de 1x2 estirada con filtro bilineal).</summary>
        private static Texture2D Gradient(Color top, Color bottom)
        {
            var key = ColorUtility.ToHtmlStringRGBA(top) + ColorUtility.ToHtmlStringRGBA(bottom);
            if (Gradients.TryGetValue(key, out var cached) && cached) return cached;
            var tex = new Texture2D(1, 2, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            // La fila 0 es la de abajo.
            tex.SetPixels(new[] { bottom, top });
            tex.Apply();
            Gradients[key] = tex;
            return tex;
        }

        // ---- Dibujo ------------------------------------------------------------------

        public static void Rect(Rect r, Color color, float radius = 0)
        {
            if (Event.current.type != EventType.Repaint) return;
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, color, 0, radius);
        }

        public static void Border(Rect r, Color color, float width = 1, float radius = 0)
        {
            if (Event.current.type != EventType.Repaint) return;
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, color, width, radius);
        }

        public static void VerticalGradient(Rect r, Color top, Color bottom)
        {
            if (Event.current.type != EventType.Repaint) return;
            // Se recorta medio texel arriba y abajo para que el degradado ocupe todo el alto.
            GUI.DrawTextureWithTexCoords(r, Gradient(top, bottom), new Rect(0, 0.25f, 1, 0.5f));
        }

        public static void Ellipse(Vector2 center, float width, float height, Color color, bool ring = false)
        {
            if (Event.current.type != EventType.Repaint) return;
            var r = new Rect(center.x - width / 2, center.y - height / 2, width, height);
            GUI.DrawTexture(r, ring ? RingTexture : EllipseTexture, ScaleMode.StretchToFill, true, 0, color, 0, 0);
        }

        /// <summary>Barra de progreso con fondo y borde.</summary>
        public static void Bar(Rect r, float fraction, Color fill, Color back, Color? border = null)
        {
            Rect(r, back);
            Rect(new Rect(r.x, r.y, r.width * Mathf.Clamp01(fraction), r.height), fill);
            if (border.HasValue) Border(r, border.Value);
        }

        /// <summary>Textura completa o un trozo (uv en coordenadas de Unity: origen abajo a la izquierda).</summary>
        public static void Texture(Rect r, Texture tex, Rect uv, Color tint)
        {
            if (Event.current.type != EventType.Repaint || tex == null) return;
            var old = GUI.color;
            GUI.color = tint;
            GUI.DrawTextureWithTexCoords(r, tex, uv);
            GUI.color = old;
        }

        /// <summary>Texto con borde negro, como el stroke de la web.</summary>
        public static void Text(Rect r, string text, GUIStyle style, Color color, float outline = 0)
        {
            if (string.IsNullOrEmpty(text)) return;
            var old = style.normal.textColor;
            if (outline > 0)
            {
                style.normal.textColor = new Color(0, 0, 0, color.a);
                for (int i = 0; i < 8; i++)
                {
                    float ang = i * Mathf.PI / 4;
                    GUI.Label(new Rect(r.x + Mathf.Cos(ang) * outline, r.y + Mathf.Sin(ang) * outline, r.width, r.height), text, style);
                }
            }
            style.normal.textColor = color;
            GUI.Label(r, text, style);
            style.normal.textColor = old;
        }

        /// <summary>"Iron Man" -> "IM", "Hulk" -> "HU" (para marcadores e iconos).</summary>
        public static string Initials(string name)
        {
            var words = (name ?? "?").Split(new[] { ' ' }, System.StringSplitOptions.RemoveEmptyEntries);
            if (words.Length == 0) return "?";
            if (words.Length == 1) return words[0].Substring(0, Mathf.Min(2, words[0].Length)).ToUpperInvariant();
            return (words[0].Substring(0, 1) + words[words.Length - 1].Substring(0, 1)).ToUpperInvariant();
        }
    }
}
