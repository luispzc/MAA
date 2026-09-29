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

Abre la URL que muestra Vite (por defecto http://localhost:5173). Deberías ver la escena de combate vacía con el número de héroes y clases cargados.

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

## Datos

- `data/classes.json`: reglas de ventaja y las seis clases (`{"rules": …, "classes": [...]}`).
- `data/heroes.json`: `{"heroes": [...]}`, héroes con clase, estadísticas base e ids de habilidades.
- `data/abilities.json`: `{"abilities": [...]}`, habilidades con coste de stamina, cooldown, daño, golpes y efectos.

Los archivos usan un objeto en la raíz con arrays, campos en camelCase y sin claves dinámicas, para que Unity los lea sin adaptadores. Los tipos de cada archivo están en `src/types/game.ts`. `npm test` comprueba que los datos sean coherentes (ids únicos, referencias válidas, ciclo de clases completo).

Para añadir un héroe: agrega su entrada en `heroes.json`, sus habilidades en `abilities.json` con el mismo `heroId`, y ejecuta `npm test`.
