# MAA en Unity

Versión Unity del remake de Marvel Avengers Alliance. Vive en `/unity` y no toca la versión web.
Las dos comparten los datos (`/data`) y el arte (`/public/assets`) de la raíz del repo, y el motor
de combate en C# es un port exacto del de la web: con la misma semilla sale el mismo combate.

## Abrir y jugar

1. Unity Hub > Add > carpeta `unity/` (Unity 6, 6000.0 LTS).
2. Abre cualquier escena (vale la vacía por defecto) y dale **Play**. La pantalla de combate se crea
   sola: escenario con los sprites, orden de turnos arriba, barra de habilidades y paneles de equipo.
3. Pasa el ratón por una habilidad para ver su ficha; haz clic para usarla y luego clic en un enemigo.
   Clic derecho o Esc cancela la selección. Los enemigos juegan solos.

Se ve igual en cualquier tamaño de ventana: todo se dibuja sobre un lienzo de 960x640 que se escala.
En el objeto `MAA Battle` (jerarquía, durante el Play) puedes cambiar los equipos y fijar una semilla.

## De dónde salen los datos

- **En el editor** se leen directamente `/data/*.json` y `/public/assets/` del repo, así que lo que
  cambie la web se ve en Unity al volver a darle Play. No hay copias que sincronizar.
- **En una build** se copian solos a `Assets/StreamingAssets/MAA/` antes de compilar (también a mano:
  menú **MAA > Copiar datos y arte compartidos a StreamingAssets**). Esa carpeta no se sube al repo.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `Assets/Scripts/Core` | `MAA.Core`, C# puro sin Unity: modelos de `/data` y el motor de combate (port de `src/core/combat`): efectos, propiedades, contraataques, IA y textos. |
| `Assets/Scripts/Runtime` | `MAA.Runtime`: carga de datos y sprites, y la pantalla de combate (`BattleView`, IMGUI). |
| `Assets/Scripts/Editor` | Copia de datos y arte a StreamingAssets para las builds. |
| `Tools/CoreCheck` | Compila `MAA.Core` fuera de Unity, valida los datos y simula 200 combates. |
| `Tools/WebTrace` | Saca la traza de esos mismos 200 combates con el motor de la web, para compararlas. |

## Comprobar que C# y web siguen iguales

```bash
npm ci                                                        # una vez, en la raíz
node unity/Tools/WebTrace/run.mjs web.txt
dotnet run --project unity/Tools/CoreCheck -- --trace cs.txt
cmp web.txt cs.txt && echo "Mismo combate en las dos versiones"
```

Si alguien cambia las reglas de `src/core/combat`, hay que portar el cambio a `Assets/Scripts/Core/Combat`
y repetir esta comparación.
