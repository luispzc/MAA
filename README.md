# MAA

Recreación del RPG por turnos **Marvel: Avengers Alliance** hecha con TypeScript, [Phaser 3](https://phaser.io/) y [Vite](https://vitejs.dev/).

## Requisitos

- Node.js 20 o superior
- npm

## Empezar

```bash
npm install
npm run dev
```

Abre la URL que muestra Vite (por defecto http://localhost:5173). Deberías ver una batalla 3 contra 3 (Iron Man, Captain America y Thor contra Hulk, Wolverine y Black Widow) con el arte del juego original. Elige una habilidad abajo (pasa el ratón por encima para ver su ficha) y, si pide objetivo, haz clic en el enemigo o aliado.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Revisa tipos y genera la versión de producción en `dist/` |
| `npm run preview` | Sirve la build de `dist/` |
| `npm run typecheck` | Solo revisa tipos |
| `npm test` | Pruebas (integridad de datos, ventajas de clase y motor de combate) |

## Estructura

```
index.html            Página que monta el juego
data/                 Datos en JSON (clases, héroes, habilidades), compartidos con la versión Unity
public/assets/        Sprites, sonidos y fuentes (se sirven tal cual); heroes/ tiene las figuras
src/
  main.ts             Configuración de Phaser y lista de escenas
  scenes/             Escenas del juego (Boot, Battle, …)
  core/               Lógica de juego sin dependencia de Phaser
    combat/           Motor de combate por turnos (estado, reglas, IA, textos)
  data/               Carga tipada de los JSON de /data
  types/              Tipos TypeScript que describen los datos
tests/                Pruebas con Vitest
```

La lógica de reglas (daño, ventajas, turnos) va en `src/core/` sin importar Phaser, para poder probarla con Vitest. Las escenas solo dibujan y reciben la entrada del jugador.

## Clases y ventajas

Cada héroe pertenece a una clase. Cinco clases forman un ciclo: cada una tiene ventaja sobre la siguiente.

```
Blaster → Bruiser → Scrapper → Infiltrator → Tactician → Blaster
```

| Clase | Fuerte contra | Débil contra |
| --- | --- | --- |
| Blaster | Bruiser | Tactician |
| Bruiser | Scrapper | Blaster |
| Scrapper | Infiltrator | Bruiser |
| Infiltrator | Tactician | Scrapper |
| Tactician | Blaster | Infiltrator |
| Generalist | — | — |

Atacar con ventaja multiplica el daño por `advantageDamageMultiplier` y con desventaja por `disadvantageDamageMultiplier` (ver `data/classes.json`). Generalist nunca recibe ni aplica modificadores. Los valores numéricos son iniciales y se ajustarán al balancear.

## Datos

- `data/classes.json`: reglas de ventaja y las seis clases (`{"rules": …, "classes": [...]}`).
- `data/heroes.json`: `{"heroes": [...]}`, héroes con clase, estadísticas base, ids de habilidades y arte.
- `data/abilities.json`: `{"abilities": [...]}`, las 4 habilidades de cada héroe con los valores de las fichas del juego original.
- `data/statuses.json`: `{"statuses": [...]}`, cada efecto (Sangrado, Fijado, Escudo deflector…) con su nombre en español y sus modificadores.

Los archivos usan un objeto en la raíz con arrays, campos en camelCase y sin claves dinámicas, para que Unity los lea sin adaptadores. Los tipos de cada archivo están en `src/types/game.ts`. `npm test` comprueba que los datos sean coherentes (ids únicos, referencias válidas, efectos y propiedades que existen, ciclo de clases completo).

### Habilidad

Cada campo sale de la ficha del juego original:

| Campo | Ficha | Ejemplo (Repulsor Ray) |
| --- | --- | --- |
| `name` | nombre | `"Repulsor Ray"` |
| `unlockLevel` | Level 2/6/9 (1 para la primera) | `1` |
| `type` + `tags` | Type | `"ranged"` + `["energy", "tech"]` |
| `target` | Target | `"single_enemy"` (`all_enemies`, `self`, `single_ally`, `all_allies`) |
| `staminaCostPercent` | Stamina Cost | `16` |
| `cooldown` | Cooldown (n/a = 0) | `0` |
| `hits` | # of Hits (n/a = 0) | `2` |
| `accuracy` / `critChance` | Hit / Critical | `88` / `11` |
| `damage` | Total Damage (total de todos los golpes; `null` si no hace daño) | `{"min": 700, "max": 950}` |
| `damageEstimated` | `true` si la ficha decía n/a y el daño es una estimación | `true` |
| `properties` | Special Properties | `["quick_action"]` |
| `effects` | efectos de la ficha | `[{"id": "lock_on", "target": "target", "duration": 2, "chance": 1, "stacks": 1}]` |

En `effects`, `target` es a quién se aplica: `target` (los objetivos de la habilidad, solo si algún golpe acierta), `self` (quien la usa) o `all_allies`. `duration` está en turnos del afectado (0 = instantáneo), `chance` va de 0 a 1 y `stacks` son las acumulaciones (Sangrado x2 = 2).

### Añadir un héroe

1. Deja su figura (PNG con fondo transparente, mirando a la derecha) en `public/assets/heroes/<id>.png`.
2. Agrega el héroe en `heroes.json` con `art.figure` y, si quieres retrato, `art.portraitCrop` (cuadrado en píxeles del PNG donde está la cabeza).
3. Agrega sus 4 habilidades en `abilities.json` con el mismo `heroId`.
4. Si usa un efecto nuevo, agrégalo en `statuses.json` con sus modificadores. Si usa una propiedad nueva, hay que programarla en `src/core/combat/battle.ts` y nombrarla en `PROPERTY_INFO` (`describe.ts`).
5. `npm test`.

## Combate

El motor está en `src/core/combat/` y no importa Phaser. `BattleScene` solo dibuja el estado y manda acciones.

```ts
const state = createBattle(playerHeroes, enemyHeroes, { classes: classesData, abilityById, statusById }, seed);
currentActor(state); // a quién le toca
performAction(state, { actorUid, abilityId, targetUid }); // devuelve los eventos del turno
chooseAiAction(state); // acción de la IA para quien tenga el turno
```

Con la misma semilla la batalla es idéntica (útil para tests y repeticiones).

**Turnos.** Cada ronda los equipos se alternan por posición: jugador 1, enemigo 1, jugador 2, enemigo 2… Los caídos no entran. Al empezar su turno, cada héroe recupera el 10% de su stamina, bajan sus cooldowns y se aplican los efectos por turno (sangrado, quemadura, regeneración). Si está aturdido, pierde el turno. Una **acción rápida** no gasta el turno: el héroe vuelve a elegir. Siempre se puede **Descansar** (pasa el turno y recupera 25% de stamina extra), así nadie se queda sin opciones.

**Golpes.** Cada golpe de una habilidad se resuelve por separado:

- Acierto: `accuracy` de la ficha + 5 puntos por cada estrella (143) de precisión del atacante sobre la evasión del defensor + efectos (%), mínimo 10%. Contra un objetivo Fijado o con un ataque Catastrófico, siempre acierta.
- Daño: tirada entre `min/hits` y `max/hits` × `2·1431 / (1431 + defensa)` × ventaja de clase × crítico × efectos y propiedades. El daño de la ficha ya incluye el ataque del héroe, así que contra una defensa de 3 estrellas (1431) sale tal cual.
- Crítico: `critChance` de la habilidad + efectos. Hace x1.5 (x2 con Críticos letales).
- Los efectos sobre el objetivo solo entran si al menos un golpe acierta, y cada uno tira su `chance`.

**Propiedades especiales** (`properties` en `abilities.json`):

| Id | Ficha | Efecto |
| --- | --- | --- |
| `quick_action` | Quick Action | No gasta el turno |
| `deadly_crits` | Deadly Crits | Críticos x2 en vez de x1.5 |
| `high_crits` | High Crits | Informativa: ya está en `critChance` |
| `mighty_attack` | Mighty Attack | Ignora las reducciones de daño del objetivo (escudos) |
| `catastrophic` | Catastrophic | No se puede esquivar |
| `anger_unleashed` | Anger Unleashed | Consume Hulk se crece: +15% de daño por acumulación |
| `exploits_combos` | Exploits Combos | +50% contra Combo preparado, y lo consume |
| `exploits_bleeds` | Exploits Bleeds | +25% por cada acumulación de Sangrado |
| `adamantium` | Adamantium | Ignora la mitad de la defensa |
| `subtle` / `stealthy` | Subtle / Stealthy | No provoca contraataques |

**Efectos** (`data/statuses.json`). Cada uno define `kind` (`buff`, `debuff` o `instant`), `maxStacks` y `modifiers`, todos por acumulación: `damageDealtPercent`, `damageTakenPercent`, `defensePercent`, `accuracy`, `evasion`, `critChance`, `damageOverTimePercent`, `healOverTimePercent`, `skipTurn`, `attacksCannotMiss`, `ignoreEvasion`, `noCounter` y `counterPercent` (devuelve ese % del golpe a quien le ataque cuerpo a cuerpo). Un efecto nuevo que solo combine estos modificadores no necesita código. La duración cuenta turnos propios del afectado; un efecto que el héroe se pone a sí mismo no gasta el turno en que lo usa.

**Stats de los héroes.** Son los del juego original a nivel 13, sacados de las estrellas (1 a 5) de la wiki: vida y stamina 5723 / 6438 / 7153 / 7868 / 8584, y ataque, defensa, precisión y evasión 1144 / 1288 / 1431 / 1574 / 1717. La clase es la del uniforme por defecto.

**Qué es del juego original y qué es provisional.** De las fichas y la wiki salen stats, clase, coste, objetivo, golpes, acierto, crítico, cooldown, tipo, propiedades, efectos y, cuando la ficha lo trae, el daño y la duración. Son provisionales: el daño de las habilidades marcadas con `damageEstimated` (la wiki tampoco lo trae), las duraciones que la ficha no indica, los números de cada efecto (cuánto sube, baja o quita) y las pasivas de cada héroe, que aún no se aplican. Las bonificaciones especiales de clase (`advantageBonus` en `classes.json`) todavía no se aplican; solo el multiplicador de daño.
