using System.IO;
using MAA.Core.Data;
using UnityEngine;

namespace MAA.Runtime
{
    /// <summary>
    /// Carga heroes.json, classes.json y abilities.json desde StreamingAssets/data.
    /// Esos archivos son copia de /data (compartido con la versión web); se
    /// sincronizan con el menú MAA > Sincronizar datos compartidos.
    /// </summary>
    public static class GameDataLoader
    {
        public static string DataFolder => Path.Combine(Application.streamingAssetsPath, "data");

        public static GameData LoadAll()
        {
            var data = new GameData(
                Load<HeroCatalog>("heroes.json"),
                Load<ClassCatalog>("classes.json"),
                Load<AbilityCatalog>("abilities.json"));
            foreach (var hero in data.Heroes.heroes)
                foreach (var missing in data.MissingAbilityIds(hero))
                    Debug.LogWarning($"[MAA] {hero.id} referencia la habilidad '{missing}', que no está en abilities.json");
            return data;
        }

        // Lectura directa de disco: vale para Editor, Windows, macOS y Linux.
        // En Android y WebGL StreamingAssets no es un sistema de archivos y habrá que usar UnityWebRequest.
        private static T Load<T>(string fileName) where T : new()
        {
            var path = Path.Combine(DataFolder, fileName);
            if (!File.Exists(path))
            {
                Debug.LogError($"[MAA] No se encontró {path}");
                return new T();
            }
            return JsonUtility.FromJson<T>(File.ReadAllText(path));
        }
    }
}
