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

Abre la URL que muestra Vite (por defecto http://localhost:5173). Deberías ver una batalla 3 contra 3 (Iron Man, Captain America y Thor contra Hulk, Wolverine y Black Widow). Elige una habilidad abajo y, si pide objetivo, haz clic en la carta del enemigo o aliado.

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
public/assets/        Sprites, sonidos y fuentes (se sirven tal cual)
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
- `data/heroes.json`: `{"heroes": [...]}`, héroes con clase, estadísticas base e ids de habilidades.
- `data/abilities.json`: `{"abilities": [...]}`, habilidades con coste de stamina, cooldown, daño, golpes y efectos.

Los archivos usan un objeto en la raíz con arrays, campos en camelCase y sin claves dinámicas, para que Unity los lea sin adaptadores. Los tipos de cada archivo están en `src/types/game.ts`. `npm test` comprueba que los datos sean coherentes (ids únicos, referencias válidas, ciclo de clases completo).

Para añadir un héroe: agrega su entrada en `heroes.json`, sus habilidades en `abilities.json` con el mismo `heroId`, y ejecuta `npm test`.

## Combate

El motor está en `src/core/combat/` y no importa Phaser. `BattleScene` solo dibuja el estado y manda acciones.

```ts
const state = createBattle(playerHeroes, enemyHeroes, { classes: classesData, abilityById }, seed);
currentActor(state); // a quién le toca
performAction(state, { actorUid, abilityId, targetUid }); // devuelve los eventos del turno
chooseAiAction(state); // acción de la IA para quien tenga el turno
```

Con la misma semilla la batalla es idéntica (útil para tests y repeticiones).

**Turnos.** Cada ronda los equipos se alternan por posición: jugador 1, enemigo 1, jugador 2, enemigo 2… Los caídos no entran. Al empezar su turno, cada héroe recupera el 10% de su stamina, bajan sus cooldowns y se aplican sangrado o regeneración. Si está aturdido, pierde el turno.

**Golpes.** Cada golpe de una habilidad se resuelve por separado:

- Acierto: `precisión + 20 − evasión` (%), mínimo 10%.
- Daño: tirada entre `min` y `max` de la habilidad × `ataque / 100` × `200 / (200 + defensa)` × ventaja de clase × 1.5 si es crítico (10% de probabilidad).
- Los efectos de un ataque solo se aplican si al menos un golpe acierta, y cada uno tira su `chance`.

**Efectos** (`effects[].id` en `abilities.json`). La duración cuenta turnos propios del afectado; un efecto que el héroe se pone a sí mismo no gasta el turno en que lo usa.

| Id | Efecto |
| --- | --- |
| `stun` | Pierde su siguiente turno |
| `bleed` | Pierde 6% de su vida máxima al empezar cada turno |
| `regeneration` | Recupera 8% de su vida máxima al empezar cada turno |
| `attack_up` / `attack_down` | Ataque ×1.25 / ×0.75 |
| `defense_up` / `defense_down` | Defensa ×1.5 / ×0.6 |
| `accuracy_up` / `accuracy_down` | Precisión +15 / −25 |

Las bonificaciones especiales de clase (`advantageBonus` en `classes.json`) todavía no se aplican; solo el multiplicador de daño.
