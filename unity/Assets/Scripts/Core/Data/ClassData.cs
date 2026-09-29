using System;
using System.Collections.Generic;

namespace MAA.Core.Data
{
    /// <summary>
    /// Clase de héroe (blaster, bruiser, scrapper, infiltrator, tactician, generalist).
    /// "strongAgainst" define el ciclo de ventajas; generalist lo tiene vacío o null.
    /// </summary>
    [Serializable]
    public class ClassData
    {
        public string id;
        public string name;
        public string description;
        public string strongAgainst;
        public string advantageBonus;
    }

    [Serializable]
    public class ClassRules
    {
        public float advantageDamageMultiplier = 1.25f;
        public float disadvantageDamageMultiplier = 0.75f;
    }

    [Serializable]
    public class ClassCatalog
    {
        public ClassRules rules = new ClassRules();
        public List<ClassData> classes = new List<ClassData>();
    }
}
