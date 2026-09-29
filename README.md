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

Abre la URL que muestra Vite (por defecto http://localhost:5173). Empieza un combate de prueba: Hulk, Iron Man y Captain America contra Wolverine, Black Widow y Thor.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Revisa tipos y genera la versión de producción en `dist/` |
| `npm run preview` | Sirve la build de `dist/` |
| `npm run typecheck` | Solo revisa tipos |
| `npm test` | Pruebas (integridad de datos y ventajas de clase) |

## Estructura

```
index.html            Página que monta el juego
data/                 Datos en JSON (clases, héroes, habilidades), compartidos con la versión Unity
public/assets/        Sprites, sonidos y fuentes (se sirven tal cual)
src/
  main.ts             Configuración de Phaser y lista de escenas
  scenes/             Escenas del juego (Boot, Battle, …)
  core/               Lógica de juego sin dependencia de Phaser
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

## Combate

Cada ronda actúan primero tus héroes vivos, en orden, y luego los enemigos. En tu turno haces clic en una habilidad y, si es de un solo objetivo, en el enemigo al que quieres atacar (se resalta en amarillo). Los enemigos usan una IA sencilla: su habilidad usable más cara contra tu héroe con menos vida.

- **Aguante**: cada habilidad cuesta aguante; se recuperan 10 puntos al empezar el turno propio.
- **Cooldown**: tras usar una habilidad con cooldown N, queda bloqueada tus N turnos siguientes.
- **Acierto**: depende de la precisión del atacante y la evasión del objetivo; un fallo anula el daño y los efectos.
- **Daño**: tirada entre el mínimo y máximo de la habilidad, escalada por ataque y defensa y multiplicada por la ventaja de clase y los efectos activos.
- **Efectos**: aturdido (pierde el turno), ataque+, defensa-, precisión+ y precisión-, sangrado (pierde vida cada turno) y regeneración (recupera vida cada turno). Un efecto de duración N afecta a los N turnos siguientes del objetivo.

La lógica está en `src/core/battle.ts` y las cifras de balance en `BATTLE_RULES`, al principio de ese archivo. Son provisionales. De los bonus especiales de clase (`advantageBonus`) aún no hay ninguno implementado, solo el multiplicador de daño.

## Datos

- `data/classes.json`: reglas de ventaja y las seis clases (`{"rules": …, "classes": [...]}`).
- `data/heroes.json`: `{"heroes": [...]}`, héroes con clase, estadísticas base e ids de habilidades.
- `data/abilities.json`: `{"abilities": [...]}`, habilidades con coste de stamina, cooldown, daño, golpes y efectos.

Los archivos usan un objeto en la raíz con arrays, campos en camelCase y sin claves dinámicas, para que Unity los lea sin adaptadores. Los tipos de cada archivo están en `src/types/game.ts`. `npm test` comprueba que los datos sean coherentes (ids únicos, referencias válidas, ciclo de clases completo).

Para añadir un héroe: agrega su entrada en `heroes.json`, sus habilidades en `abilities.json` con el mismo `heroId`, y ejecuta `npm test`.
