using System.Collections.Generic;
using System.IO;
using MAA.Core.Data;
using UnityEngine;

namespace MAA.Runtime
{
    /// <summary>
    /// Carga los datos y el arte compartidos con la versión web.
    /// En el editor lee directamente /data y /public/assets de la raíz del repo, así
    /// que cualquier cambio de la web se ve al darle Play. En una build lee la copia
    /// de StreamingAssets/MAA, que se genera sola al compilar (ver SyncSharedData).
    /// </summary>
    public static class GameDataLoader
    {
        public static readonly string[] DataFiles = { "heroes.json", "classes.json", "abilities.json", "statuses.json" };

        private static readonly Dictionary<string, Texture2D> Textures = new Dictionary<string, Texture2D>();

        /// <summary>Raíz del repo (carpeta padre de unity/), o null si no se encuentra.</summary>
        public static string RepoRoot
        {
            get
            {
                var root = Path.GetFullPath(Path.Combine(Application.dataPath, "..", ".."));
                return File.Exists(Path.Combine(root, "data", "heroes.json")) ? root : null;
            }
        }

        public static string StreamingRoot => Path.Combine(Application.streamingAssetsPath, "MAA");

        private static bool UseRepo => Application.isEditor && RepoRoot != null;

        public static string DataFolder => UseRepo ? Path.Combine(RepoRoot, "data") : Path.Combine(StreamingRoot, "data");

        /// <summary>Equivale a public/assets de la web: las rutas de art.figure son relativas a esta carpeta.</summary>
        public static string AssetsFolder => UseRepo ? Path.Combine(RepoRoot, "public", "assets") : Path.Combine(StreamingRoot, "assets");

        public static GameData LoadAll()
        {
            var data = new GameData(
                Load<HeroCatalog>("heroes.json"),
                Load<ClassCatalog>("classes.json"),
                Load<AbilityCatalog>("abilities.json"),
                Load<StatusCatalog>("statuses.json"));
            foreach (var hero in data.Heroes.heroes)
                foreach (var missing in data.MissingAbilityIds(hero))
                    Debug.LogWarning($"[MAA] {hero.id} usa la habilidad '{missing}', que no está en abilities.json");
            Debug.Log($"[MAA] Datos cargados de {DataFolder}");
            return data;
        }

        /// <summary>
        /// Textura de un PNG relativo a public/assets (p. ej. "heroes/hulk.png"), o null si no existe.
        /// Se carga en tiempo de ejecución, así que no hace falta importarla en Unity.
        /// </summary>
        public static Texture2D LoadTexture(string relativePath)
        {
            if (string.IsNullOrEmpty(relativePath)) return null;
            if (Textures.TryGetValue(relativePath, out var cached)) return cached;
            var path = Path.Combine(AssetsFolder, relativePath);
            Texture2D tex = null;
            if (File.Exists(path))
            {
                tex = new Texture2D(2, 2, TextureFormat.RGBA32, false) { name = relativePath, wrapMode = TextureWrapMode.Clamp };
                if (!tex.LoadImage(File.ReadAllBytes(path))) tex = null;
            }
            else
            {
                Debug.LogWarning($"[MAA] No se encontró {path}; se dibuja un marcador.");
            }
            Textures[relativePath] = tex;
            return tex;
        }

        // Lectura directa de disco: vale para el editor y para builds de Windows, macOS y Linux.
        // En Android y WebGL StreamingAssets no es un sistema de archivos y habrá que usar UnityWebRequest.
        private static T Load<T>(string fileName) where T : new()
        {
            var path = Path.Combine(DataFolder, fileName);
            if (!File.Exists(path))
            {
                Debug.LogError($"[MAA] No se encontró {path}. En una build, compílala desde el editor para que se copien los datos.");
                return new T();
            }
            return JsonUtility.FromJson<T>(File.ReadAllText(path));
        }
    }
}
