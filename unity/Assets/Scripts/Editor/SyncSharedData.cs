using System.IO;
using UnityEditor;
using UnityEngine;

namespace MAA.Editor
{
    /// <summary>
    /// Copia los JSON compartidos con la versión web (/data en la raíz del repo)
    /// a Assets/StreamingAssets/data, que es lo que lee el juego en Unity.
    /// </summary>
    public static class SyncSharedData
    {
        private static readonly string[] Files = { "heroes.json", "classes.json", "abilities.json" };

        [MenuItem("MAA/Sincronizar datos compartidos")]
        public static void Sync()
        {
            var repoData = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "data"));
            var target = Path.Combine(Application.streamingAssetsPath, "data");
            Directory.CreateDirectory(target);

            int copied = 0;
            foreach (var file in Files)
            {
                var src = Path.Combine(repoData, file);
                if (!File.Exists(src))
                {
                    Debug.LogWarning($"[MAA] No existe {src}; se mantiene la copia local.");
                    continue;
                }
                File.Copy(src, Path.Combine(target, file), overwrite: true);
                copied++;
            }
            AssetDatabase.Refresh();
            Debug.Log($"[MAA] Datos sincronizados: {copied}/{Files.Length} archivos desde {repoData}");
        }
    }
}
