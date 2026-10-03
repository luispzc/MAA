using System;
using System.Collections.Generic;

// Espejo en C# de src/types/game.ts. Campos públicos en camelCase para que
// JsonUtility (y System.Text.Json en Tools/CoreCheck) lean /data sin atributos.
namespace MAA.Core.Data
{
    [Serializable]
    public class ClassData
    {
        public string id;
        public string name;
        public string description;
        /// <summary>Clase contra la que tiene ventaja (vacío o null en generalist).</summary>
        public string strongAgainst;
        public string advantageBonus;
    }

    [Serializable]
    public class ClassRules
    {
        public double advantageDamageMultiplier = 1.25;
        public double disadvantageDamageMultiplier = 0.75;
    }

    [Serializable]
    public class ClassCatalog
    {
        public ClassRules rules = new ClassRules();
        public List<ClassData> classes = new List<ClassData>();
    }

    [Serializable]
    public class StatBlock
    {
        public int health;
        /// <summary>Stamina máxima. Las habilidades cuestan un porcentaje de ella.</summary>
        public int stamina;
        public int attack;
        public int defense;
        public int accuracy;
        public int evasion;

        public StatBlock Clone() => (StatBlock)MemberwiseClone();
    }

    /// <summary>Recorte cuadrado (en píxeles del PNG, origen arriba a la izquierda) para el retrato.</summary>
    [Serializable]
    public class PortraitCrop
    {
        public int x;
        public int y;
        public int size;
    }

    [Serializable]
    public class HeroArt
    {
        /// <summary>Figura de cuerpo entero mirando a la derecha, relativa a public/assets.</summary>
        public string figure;
        public PortraitCrop portraitCrop;
    }

    [Serializable]
    public class HeroData
    {
        public string id;
        public string name;
        public string classId;
        public string description;
        public StatBlock baseStats = new StatBlock();
        public List<string> abilityIds = new List<string>();
        public HeroArt art;
    }

    [Serializable]
    public class HeroCatalog
    {
        public List<HeroData> heroes = new List<HeroData>();
    }

    [Serializable]
    public class DamageRange
    {
        public double min;
        public double max;
    }

    [Serializable]
    public class AbilityEffect
    {
        /// <summary>Id de data/statuses.json.</summary>
        public string id;
        /// <summary>target, self o all_allies.</summary>
        public string target;
        public int duration;
        /// <summary>Probabilidad de aplicarse, de 0 a 1.</summary>
        public double chance = 1;
        public int stacks = 1;
    }

    [Serializable]
    public class AbilityData
    {
        public string id;
        public string heroId;
        public string name;
        public int unlockLevel;
        /// <summary>melee, ranged, buff, debuff o heal.</summary>
        public string type;
        public List<string> tags = new List<string>();
        /// <summary>single_enemy, all_enemies, self, single_ally o all_allies.</summary>
        public string target;
        /// <summary>Coste en % de la stamina máxima del héroe.</summary>
        public double staminaCostPercent;
        public int cooldown;
        public int hits;
        /// <summary>Probabilidad de acierto (%) contra un objetivo sin evasión.</summary>
        public double accuracy;
        /// <summary>Probabilidad de crítico (%) de cada golpe.</summary>
        public double critChance;
        /// <summary>
        /// Daño total de todos los golpes. Viene null en las habilidades sin daño:
        /// JsonUtility lo deja en {0,0} y System.Text.Json en null; ambos son "sin daño".
        /// </summary>
        public DamageRange damage;
        public bool damageEstimated;
        public List<string> properties = new List<string>();
        public List<AbilityEffect> effects = new List<AbilityEffect>();
        public string description;

        public bool HasDamage => damage != null && damage.max > 0;
        public bool Has(string property) => properties != null && properties.Contains(property);
    }

    [Serializable]
    public class AbilityCatalog
    {
        public List<AbilityData> abilities = new List<AbilityData>();
    }

    /// <summary>Modificadores de un efecto, por acumulación. Los que no vienen en el JSON valen 0/false.</summary>
    [Serializable]
    public class StatusModifiers
    {
        public double damageDealtPercent;
        public double damageTakenPercent;
        public double defensePercent;
        public double accuracy;
        public double evasion;
        public double critChance;
        public double damageOverTimePercent;
        public double healOverTimePercent;
        public bool skipTurn;
        public bool attacksCannotMiss;
        public bool ignoreEvasion;
        public bool noCounter;
        public double counterPercent;
    }

    [Serializable]
    public class StatusDefinition
    {
        public string id;
        public string name;
        /// <summary>buff, debuff o instant.</summary>
        public string kind;
        public int maxStacks = 1;
        public string description;
        public StatusModifiers modifiers = new StatusModifiers();
    }

    [Serializable]
    public class StatusCatalog
    {
        public List<StatusDefinition> statuses = new List<StatusDefinition>();
    }
}
