using System.IO;
using MAA.Runtime;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace MAA.Editor
{
    /// <summary>
    /// Copia /data y /public/assets (compartidos con la web) a StreamingAssets/MAA para
    /// que una build los lleve dentro. En el editor no hace falta: se leen del repo.
    /// Se ejecuta solo antes de cada build y también desde el menú MAA.
    /// </summary>
    public sealed class SyncSharedData : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;

        public void OnPreprocessBuild(BuildReport report) => Sync();

        [MenuItem("MAA/Copiar datos y arte compartidos a StreamingAssets")]
        public static void Sync()
        {
            var root = GameDataLoader.RepoRoot;
            if (root == null)
            {
                Debug.LogError("[MAA] No encontré /data en la raíz del repo (carpeta padre de unity/).");
                return;
            }
            var target = GameDataLoader.StreamingRoot;
            if (Directory.Exists(target)) Directory.Delete(target, true);

            int files = 0;
            var dataTarget = Path.Combine(target, "data");
            Directory.CreateDirectory(dataTarget);
            foreach (var file in GameDataLoader.DataFiles)
            {
                File.Copy(Path.Combine(root, "data", file), Path.Combine(dataTarget, file), true);
                files++;
            }
            files += CopyTree(Path.Combine(root, "public", "assets"), Path.Combine(target, "assets"));

            AssetDatabase.Refresh();
            Debug.Log($"[MAA] Copiados {files} archivos a {target}");
        }

        private static int CopyTree(string from, string to)
        {
            if (!Directory.Exists(from)) return 0;
            int count = 0;
            foreach (var file in Directory.GetFiles(from, "*", SearchOption.AllDirectories))
            {
                if (Path.GetFileName(file).StartsWith(".")) continue;
                var dest = Path.Combine(to, Path.GetRelativePath(from, file));
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                File.Copy(file, dest, true);
                count++;
            }
            return count;
        }
    }
}
