# MAA en Unity

Versión Unity del remake de Marvel Avengers Alliance. Vive en `/unity` y no toca la versión web;
ambas comparten los datos de héroes y clases (`/data` en la raíz del repo).

## Abrir el proyecto

1. Unity Hub > Add > carpeta `unity/`. Versión objetivo: **Unity 6 (6000.0 LTS)**.
2. La primera vez Unity genera `Library/` y los `.meta`. Haz commit de los `.meta` (no de `Library/`).
3. Abre cualquier escena (o la vacía por defecto) y dale **Play**: aparece un combate de prueba
   3 contra 3 dibujado con IMGUI. Eliges habilidad y luego rival; los enemigos actúan solos.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `Assets/Scripts/Core` | Reglas del juego en C# puro (`MAA.Core`, sin dependencias de Unity): modelos de datos, ventajas de clase, fórmula de daño, combate por turnos e IA enemiga simple. |
| `Assets/Scripts/Runtime` | Puente con Unity (`MAA.Runtime`): carga de JSON y la vista de combate de prueba. |
| `Assets/Scripts/Editor` | Menú **MAA > Sincronizar datos compartidos**: copia `/data/*.json` a `StreamingAssets/data`. |
| `Assets/StreamingAssets/data` | `heroes.json`, `classes.json` y `abilities.json` que lee el juego. Mismo esquema que `/data` de la web (`src/types/game.ts`); hoy son datos provisionales hasta sincronizar. |
| `Tools/CoreCheck` | Compila `MAA.Core` fuera de Unity y simula 500 combates para validar reglas y datos. |

## Verificar las reglas sin Unity

```bash
dotnet run --project unity/Tools/CoreCheck            # usa StreamingAssets/data
dotnet run --project unity/Tools/CoreCheck -- data    # o la carpeta compartida
```

## Reglas actuales (provisionales)

- Ciclo de clases: Blaster > Bruiser > Scrapper > Infiltrator > Tactician > Blaster. Generalist es neutral.
  Ventaja ×1.25, desventaja ×0.75 (`rules` en `classes.json`).
- Daño por golpe = aleatorio entre `damage.min` y `damage.max` × (100 + ataque) / (100 + defensa), críticos ×1.5 (10%).
- Stamina y cooldown por habilidad. Los efectos (buffs, debuffs, curas) todavía no se aplican.
- Probabilidad de acierto = 90% + (precisión − evasión)%, entre 50% y 99%.
- Cada ronda actúa cada personaje vivo una vez, alternando bandos.

Las constantes están en `DamageCalculator.cs` para alinearlas con la versión web.
