using System;
using System.Collections.Generic;

namespace MAA.Core.Data
{
    /// <summary>Habilidad tal como viene de /data/abilities.json.</summary>
    [Serializable]
    public class AbilityData
    {
        public string id;
        public string heroId;
        public string name;
        /// <summary>melee, ranged, buff, debuff o heal.</summary>
        public string type;
        /// <summary>single_enemy, all_enemies, self, single_ally o all_allies.</summary>
        public string target;
        public int staminaCost;
        /// <summary>Turnos que hay que esperar tras usarla (0 = sin espera).</summary>
        public int cooldown;
        /// <summary>
        /// Puede venir null en el JSON. JsonUtility lo convierte en {0,0} y
        /// System.Text.Json lo deja en null: ambos significan "sin daño".
        /// </summary>
        public DamageRange damage;
        public int hits = 1;
        public List<EffectData> effects = new List<EffectData>();
        public string description;

        public bool DealsDamage => damage != null && damage.max > 0;
        public bool TargetsAllEnemies => target == "all_enemies";
        public bool TargetsEnemies => target == "single_enemy" || target == "all_enemies";
    }

    [Serializable]
    public class DamageRange
    {
        public int min;
        public int max;
    }

    [Serializable]
    public class EffectData
    {
        public string id;
        public int duration;
        /// <summary>Probabilidad de aplicarse, de 0 a 1.</summary>
        public float chance;
    }

    [Serializable]
    public class AbilityCatalog
    {
        public List<AbilityData> abilities = new List<AbilityData>();
    }
}
