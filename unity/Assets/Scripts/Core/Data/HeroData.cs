using System;
using System.Collections.Generic;

namespace MAA.Core.Data
{
    /// <summary>
    /// Héroe tal como viene de /data/heroes.json (esquema compartido con la web,
    /// ver src/types/game.ts). Campos públicos en camelCase para JsonUtility.
    /// </summary>
    [Serializable]
    public class HeroData
    {
        public string id;
        public string name;
        public string classId;
        public string description;
        public StatBlock baseStats = new StatBlock();
        public List<string> abilityIds = new List<string>();
    }

    [Serializable]
    public class StatBlock
    {
        public int health = 100;
        public int stamina = 30;
        public int attack = 10;
        public int defense = 10;
        public int accuracy = 10;
        public int evasion = 10;
    }

    [Serializable]
    public class HeroCatalog
    {
        public List<HeroData> heroes = new List<HeroData>();
    }
}
